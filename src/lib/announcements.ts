import type { SupabaseClient } from '@supabase/supabase-js'

/** デイリーレポートの構造化データ（announcements.payload）。名前リンク→タイムライン絞り込みに使う */
export type DailyReportPayload = {
  /** 対象日（JST, YYYY-MM-DD） */
  date: string
  achievers: { id: string; name: string; store: string | null; count: number; skill: string }[]
  achieversMore: number
  certifiers: { id: string; name: string; count: number }[]
  praisers: { id: string; name: string; count: number }[]
  applicants: { people: number; count: number }
  newMembers: { id: string; name: string }[]
  streak: number
  /** 承認の滞留（承認者名でリンク→承認センターの絞り込み。承認者未設定の店舗は運用管理者向けに分けて出す） */
  stalled?: {
    total: number
    /** 店舗・部署ごと（承認者がいるチーム）。店舗名→承認センターの絞り込み */
    byTeam?: { teamId: string; teamName: string; count: number; maxDays: number; approverNames: string[] }[]
    /** 旧形式（承認者ごと）。2026-09-20 の途中まで */
    byApprover?: { id: string; name: string; count: number; maxDays: number }[]
    unassigned: { teamId: string | null; teamName: string; count: number; maxDays?: number; selfOnly?: boolean }[]
  }
}

export type AnnouncementItem = {
  id: string
  kind: 'grade' | 'ranking' | 'welcome' | 'daily' | 'praise'
  subjectId: string | null
  subjectName: string | null
  subjectStore: string | null
  subjectAvatar: string | null
  gradeLabel: string | null
  title: string | null
  body: string | null
  period: string | null
  createdAt: string
  createdById: string | null
  createdByName: string | null
  /** デイリーレポートの構造化データ（無ければ本文のみ） */
  payload: DailyReportPayload | null
}
export type AnnouncementReaction = { announcement_id: string; employee_id: string }
export type AnnouncementComment = { id: string; announcement_id: string; employee_id: string; content: string; created_at: string }

/**
 * 「自分に関係ある一言」の判定に使う閲覧者の情報（2026-09-20 決定: ホームの本日のお知らせでは
 * 店長からの一言を 本人・書いた人・同じ店舗／部署の仲間・運用管理者 にだけ出す。タイムラインは全社）。
 */
export type AnnouncementViewer = {
  id: string
  /** 閲覧者が所属する店舗・部署のチームID（メンバー・担当リーダーの両方） */
  teamIds: Set<string>
  isAdmin: boolean
}

/** 閲覧者の店舗・部署チームIDを集める（メンバー＋担当リーダー） */
export async function getViewerTeamIds(db: SupabaseClient, employeeId: string): Promise<Set<string>> {
  const [{ data: tm }, { data: tg }] = await Promise.all([
    db.from('team_members').select('team_id, teams(type)').eq('employee_id', employeeId),
    db.from('team_managers').select('team_id, teams(type)').eq('employee_id', employeeId),
  ])
  const ids = new Set<string>()
  type Row = { team_id: string; teams: { type: string } | { type: string }[] | null }
  for (const r of [...((tm ?? []) as Row[]), ...((tg ?? []) as Row[])]) {
    const t = Array.isArray(r.teams) ? r.teams[0] : r.teams
    if (t && (t.type === 'store' || t.type === 'department')) ids.add(r.team_id)
  }
  return ids
}

/** お知らせ＋♡リアクション＋コメント＋関係者名を取得して整形する（本日のお知らせ・過去ページ・タイムライン共通） */
export async function getAnnouncementsData(
  db: SupabaseClient,
  opts: { activeOnly?: boolean; limit?: number; viewer?: AnnouncementViewer } = {},
): Promise<{ items: AnnouncementItem[]; reactions: AnnouncementReaction[]; comments: AnnouncementComment[]; reactorNames: Record<string, string>; reactorAvatars: Record<string, string | null> }> {
  let q = db
    .from('announcements')
    .select('id, kind, subject_employee_id, grade_label, title, body, period, created_by, created_at, expires_at, payload')
    .order('created_at', { ascending: false })
  if (opts.activeOnly) q = q.gt('expires_at', new Date().toISOString())
  if (opts.limit) q = q.limit(opts.limit)
  const { data: anns } = await q
  let list = anns ?? []
  if (list.length === 0) return { items: [], reactions: [], comments: [], reactorNames: {}, reactorAvatars: {} }

  // 対象者の店舗名（表示用）と、店舗・部署のチームID（閲覧者との関係判定用）
  const subjectIds = [...new Set(list.map(a => a.subject_employee_id).filter(Boolean) as string[])]
  const storeById: Record<string, string> = {}
  const teamIdsBySubject: Record<string, Set<string>> = {}
  if (subjectIds.length > 0) {
    const { data: tm } = await db.from('team_members').select('employee_id, team_id, teams(name, type)').in('employee_id', subjectIds)
    for (const m of (tm ?? []) as { employee_id: string; team_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }[]) {
      const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
      if (!t) continue
      if (t.type === 'store' && !storeById[m.employee_id]) storeById[m.employee_id] = t.name
      if (t.type === 'store' || t.type === 'department') (teamIdsBySubject[m.employee_id] ??= new Set()).add(m.team_id)
    }
  }

  // 店長からの一言は「自分に関係あるもの」だけ（閲覧者が渡されたとき）
  if (opts.viewer) {
    const v = opts.viewer
    list = list.filter(a => {
      if (a.kind !== 'praise') return true
      if (v.isAdmin) return true
      if (a.subject_employee_id === v.id || a.created_by === v.id) return true
      const st = a.subject_employee_id ? teamIdsBySubject[a.subject_employee_id] : undefined
      if (!st) return false
      for (const id of st) if (v.teamIds.has(id)) return true
      return false
    })
    if (list.length === 0) return { items: [], reactions: [], comments: [], reactorNames: {}, reactorAvatars: {} }
  }

  const ids = list.map(a => a.id)
  const [{ data: reactions }, { data: comments }] = await Promise.all([
    db.from('announcement_reactions').select('announcement_id, employee_id').in('announcement_id', ids),
    db.from('announcement_comments').select('id, announcement_id, employee_id, content, created_at').in('announcement_id', ids).order('created_at'),
  ])

  // 関係者（対象者・投稿者・リアクション/コメントした人）の名前・アバター
  const empIds = new Set<string>()
  for (const a of list) {
    if (a.subject_employee_id) empIds.add(a.subject_employee_id)
    if (a.created_by) empIds.add(a.created_by)
  }
  for (const r of reactions ?? []) empIds.add(r.employee_id)
  for (const c of comments ?? []) empIds.add(c.employee_id)
  const { data: emps } = empIds.size > 0
    ? await db.from('employees').select('id, name, avatar_url').in('id', [...empIds])
    : { data: [] as { id: string; name: string; avatar_url: string | null }[] }
  const nameById: Record<string, string> = Object.fromEntries((emps ?? []).map(e => [e.id, e.name]))
  const avatarById: Record<string, string | null> = Object.fromEntries((emps ?? []).map(e => [e.id, e.avatar_url]))

  const items: AnnouncementItem[] = list.map(a => ({
    id: a.id,
    kind: a.kind as AnnouncementItem['kind'],
    subjectId: a.subject_employee_id,
    subjectName: a.subject_employee_id ? (nameById[a.subject_employee_id] ?? '不明') : null,
    subjectStore: a.subject_employee_id ? (storeById[a.subject_employee_id] ?? null) : null,
    subjectAvatar: a.subject_employee_id ? (avatarById[a.subject_employee_id] ?? null) : null,
    gradeLabel: a.grade_label,
    title: a.title,
    body: a.body,
    period: a.period,
    createdAt: a.created_at,
    createdById: a.created_by ?? null,
    createdByName: a.created_by ? (nameById[a.created_by] ?? null) : null,
    payload: (a.payload as DailyReportPayload | null) ?? null,
  }))
  return { items, reactions: reactions ?? [], comments: comments ?? [], reactorNames: nameById, reactorAvatars: avatarById }
}

/**
 * 新メンバーの歓迎投稿を作成（本日のお知らせ＆タイムラインに7日間表示）。
 * 対象者1人につき1件（unique index で重複防止）。join 系フローから呼ぶ。
 */
export async function createWelcomeAnnouncement(db: SupabaseClient, employeeId: string): Promise<void> {
  try {
    await db.from('announcements').insert({ kind: 'welcome', subject_employee_id: employeeId })
  } catch {
    // 既に歓迎投稿済み（unique 制約）等は無視
  }
}
