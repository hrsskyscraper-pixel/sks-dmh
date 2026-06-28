import type { SupabaseClient } from '@supabase/supabase-js'

export type AnnouncementItem = {
  id: string
  kind: 'grade' | 'ranking' | 'welcome'
  subjectId: string | null
  subjectName: string | null
  subjectStore: string | null
  subjectAvatar: string | null
  gradeLabel: string | null
  title: string | null
  body: string | null
  period: string | null
  createdAt: string
  createdByName: string | null
}
export type AnnouncementReaction = { announcement_id: string; employee_id: string }
export type AnnouncementComment = { id: string; announcement_id: string; employee_id: string; content: string; created_at: string }

/** お知らせ＋♡リアクション＋コメント＋関係者名を取得して整形する（本日のお知らせ・過去ページ・タイムライン共通） */
export async function getAnnouncementsData(
  db: SupabaseClient,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<{ items: AnnouncementItem[]; reactions: AnnouncementReaction[]; comments: AnnouncementComment[]; reactorNames: Record<string, string>; reactorAvatars: Record<string, string | null> }> {
  let q = db
    .from('announcements')
    .select('id, kind, subject_employee_id, grade_label, title, body, period, created_by, created_at, expires_at')
    .order('created_at', { ascending: false })
  if (opts.activeOnly) q = q.gt('expires_at', new Date().toISOString())
  if (opts.limit) q = q.limit(opts.limit)
  const { data: anns } = await q
  const list = anns ?? []
  if (list.length === 0) return { items: [], reactions: [], comments: [], reactorNames: {}, reactorAvatars: {} }

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

  // 対象者の店舗名
  const subjectIds = list.map(a => a.subject_employee_id).filter(Boolean) as string[]
  const storeById: Record<string, string> = {}
  if (subjectIds.length > 0) {
    const { data: tm } = await db.from('team_members').select('employee_id, teams(name, type)').in('employee_id', subjectIds)
    for (const m of (tm ?? []) as { employee_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }[]) {
      const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
      if (t?.type === 'store') storeById[m.employee_id] = t.name
    }
  }

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
    createdByName: a.created_by ? (nameById[a.created_by] ?? null) : null,
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
