import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

/**
 * 承認の滞留（2026-09-20 決定）
 * - 申請（achieved_at）の翌日中に承認されなかったものを「滞留」とする。＝申請の翌々日（JST）から表示。
 * - 承認者（そのメンバーが所属するチームの担当リーダー）の名前で数える。目的は「承認が止まっている」問題の解消。
 * - 承認者がいないチームの分は「承認者未設定」として運用管理者向けにまとめる。
 */

/** 滞留とみなす経過日数（申請日を 0 日目として、翌々日＝2 日目から） */
export const STALLED_APPROVAL_DAYS = 2

export interface StalledItem {
  achievementId: string
  employeeId: string
  employeeName: string
  skillName: string
  appliedAt: string
  /** 申請日からの経過日数（JST の日付差） */
  days: number
  teamId: string | null
  teamName: string | null
  approverIds: string[]
}

export interface ApproverSummary {
  approverId: string
  name: string
  email: string | null
  lineUserId: string | null
  count: number
  maxDays: number
  items: StalledItem[]
}

export interface StalledApprovals {
  items: StalledItem[]
  byApprover: ApproverSummary[]
  /** 承認者がいないチームの滞留（チーム → 件数）。teamId が null は「所属なし」 */
  unassigned: { teamId: string | null; teamName: string; count: number }[]
  total: number
}

const DAY = 24 * 3600 * 1000

/** JST の日付差（申請日を 0 日目とする） */
function jstDayDiff(fromISO: string, now: Date): number {
  const jst = (ms: number) => Math.floor((ms + 9 * 3600 * 1000) / DAY)
  return jst(now.getTime()) - jst(Date.parse(fromISO))
}

/**
 * 全社の滞留を集計する（デイリーレポート・通知用）。
 * @param excludedIds テスト社員など、集計から外す社員ID（申請者・承認者の両方に適用）
 */
export async function getStalledApprovals(db: SupabaseClient, now: Date, excludedIds: Set<string>): Promise<StalledApprovals> {
  const threshold = new Date(now.getTime() - (STALLED_APPROVAL_DAYS - 1) * DAY).toISOString()
  // 「翌々日から」= JST 日付差 >= 2。ざっくり threshold で絞ってから、JST 日付差で厳密に判定する
  const pend = await fetchAllRows<{ id: string; employee_id: string; achieved_at: string; skills: { name: string } | { name: string }[] | null }>((from, to) =>
    db.from('achievements')
      .select('id, employee_id, achieved_at, skills(name)')
      .eq('status', 'pending')
      .lt('achieved_at', threshold)
      .order('id')
      .range(from, to),
  )
  const stalledRows = pend
    .filter(a => !excludedIds.has(a.employee_id))
    .map(a => ({ ...a, days: jstDayDiff(a.achieved_at, now) }))
    .filter(a => a.days >= STALLED_APPROVAL_DAYS)
  if (stalledRows.length === 0) return { items: [], byApprover: [], unassigned: [], total: 0 }

  const empIds = [...new Set(stalledRows.map(a => a.employee_id))]
  const [{ data: memberRows }, { data: empRows }] = await Promise.all([
    db.from('team_members').select('employee_id, team_id, teams(id, name, type)').in('employee_id', empIds),
    db.from('employees').select('id, name').in('id', empIds),
  ])
  const nameById: Record<string, string> = Object.fromEntries((empRows ?? []).map(e => [e.id, e.name]))

  // 申請者 → 所属チーム（店舗を優先。無ければ部署・PJ）
  type TeamRef = { id: string; name: string; type: string }
  const teamByEmp: Record<string, TeamRef | null> = {}
  for (const m of (memberRows ?? []) as { employee_id: string; team_id: string; teams: TeamRef | TeamRef[] | null }[]) {
    const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
    if (!t) continue
    const cur = teamByEmp[m.employee_id]
    if (!cur || (cur.type !== 'store' && t.type === 'store')) teamByEmp[m.employee_id] = t
  }
  const teamIds = [...new Set(Object.values(teamByEmp).filter((t): t is TeamRef => !!t).map(t => t.id))]
  const { data: mgrRows } = teamIds.length > 0
    ? await db.from('team_managers').select('team_id, employee_id').in('team_id', teamIds)
    : { data: [] as { team_id: string; employee_id: string }[] }
  const approversByTeam: Record<string, string[]> = {}
  for (const r of mgrRows ?? []) {
    if (excludedIds.has(r.employee_id)) continue
    ;(approversByTeam[r.team_id] ??= []).push(r.employee_id)
  }

  const items: StalledItem[] = stalledRows.map(a => {
    const t = teamByEmp[a.employee_id] ?? null
    const sk = Array.isArray(a.skills) ? a.skills[0] : a.skills
    // 自分の申請は自分で承認できない → 承認者から本人を除く
    const approverIds = (t ? (approversByTeam[t.id] ?? []) : []).filter(id => id !== a.employee_id)
    return {
      achievementId: a.id,
      employeeId: a.employee_id,
      employeeName: nameById[a.employee_id] ?? '',
      skillName: sk?.name ?? '',
      appliedAt: a.achieved_at,
      days: a.days,
      teamId: t?.id ?? null,
      teamName: t?.name ?? null,
      approverIds,
    }
  })

  // 承認者ごとに集計
  const approverIds = [...new Set(items.flatMap(i => i.approverIds))]
  const { data: approverRows } = approverIds.length > 0
    ? await db.from('employees').select('id, name, email, line_user_id').in('id', approverIds)
    : { data: [] as { id: string; name: string; email: string; line_user_id: string | null }[] }
  const approverInfo: Record<string, { name: string; email: string | null; lineUserId: string | null }> =
    Object.fromEntries((approverRows ?? []).map(e => [e.id, { name: e.name, email: e.email ?? null, lineUserId: e.line_user_id ?? null }]))
  const byApproverMap: Record<string, ApproverSummary> = {}
  for (const it of items) {
    for (const id of it.approverIds) {
      const s = (byApproverMap[id] ??= { approverId: id, name: approverInfo[id]?.name ?? '', email: approverInfo[id]?.email ?? null, lineUserId: approverInfo[id]?.lineUserId ?? null, count: 0, maxDays: 0, items: [] })
      s.count++
      s.maxDays = Math.max(s.maxDays, it.days)
      s.items.push(it)
    }
  }
  const byApprover = Object.values(byApproverMap).sort((a, b) => b.maxDays - a.maxDays || b.count - a.count || a.name.localeCompare(b.name, 'ja'))

  // 承認者がいない分
  const unassignedMap: Record<string, { teamId: string | null; teamName: string; count: number }> = {}
  for (const it of items) {
    if (it.approverIds.length === 0) {
      const key = it.teamId ?? '__none__'
      const u = (unassignedMap[key] ??= { teamId: it.teamId, teamName: it.teamName ?? '所属なし', count: 0 })
      u.count++
    }
  }
  const unassigned = Object.values(unassignedMap).sort((a, b) => b.count - a.count)

  return { items, byApprover, unassigned, total: items.length }
}

/**
 * 特定の承認者（自分）が抱える滞留件数（ベル用）。
 * 管理者は全社の滞留を数え、店長・リーダーは担当チームのメンバー分だけを数える。
 */
export async function countStalledForApprover(
  db: SupabaseClient,
  approverId: string,
  isAdmin: boolean,
  now: Date,
  excludedIds: Set<string>,
): Promise<{ count: number; maxDays: number; unassignedTeams: number }> {
  // 管理者: 全社の滞留に加えて「承認者が未設定の店舗・チーム」の数も返す（ログイン時の案内に使う）
  if (isAdmin) {
    const all = await getStalledApprovals(db, now, excludedIds)
    return { count: all.total, maxDays: all.items.reduce((m, i) => Math.max(m, i.days), 0), unassignedTeams: all.unassigned.length }
  }
  const threshold = new Date(now.getTime() - (STALLED_APPROVAL_DAYS - 1) * DAY).toISOString()
  let q = db.from('achievements').select('employee_id, achieved_at').eq('status', 'pending').lt('achieved_at', threshold)
  if (!isAdmin) {
    const { data: managed } = await db.from('team_managers').select('team_id').eq('employee_id', approverId)
    const teamIds = (managed ?? []).map(m => m.team_id)
    if (teamIds.length === 0) return { count: 0, maxDays: 0, unassignedTeams: 0 }
    const { data: members } = await db.from('team_members').select('employee_id').in('team_id', teamIds)
    const memberIds = [...new Set((members ?? []).map(m => m.employee_id))].filter(id => id !== approverId && !excludedIds.has(id))
    if (memberIds.length === 0) return { count: 0, maxDays: 0, unassignedTeams: 0 }
    q = q.in('employee_id', memberIds)
  }
  const { data } = await q
  let count = 0
  let maxDays = 0
  for (const a of data ?? []) {
    if (excludedIds.has(a.employee_id) || a.employee_id === approverId) continue
    const d = jstDayDiff(a.achieved_at, now)
    if (d >= STALLED_APPROVAL_DAYS) { count++; maxDays = Math.max(maxDays, d) }
  }
  return { count, maxDays, unassignedTeams: 0 }
}
