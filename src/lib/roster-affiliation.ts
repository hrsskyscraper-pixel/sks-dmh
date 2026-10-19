import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

/**
 * 名簿の「店舗部署」と、Mission Board の所属（店舗・部署のメンバー）の突き合わせ（2026-10-19 B-⑥）。
 * - 名簿の店舗部署名は、空白・全角半角を揃えてアプリの店舗・部署名と照合する。
 *   書き方が違う名前は、運用管理者が対応づけ（roster_dept_aliases）を設定する
 * - 名簿の店舗が、アプリの所属のどれかに含まれていれば「一致」（兼務は違いにしない）
 * - 退職日を過ぎた人・テスト社員は対象外。店舗・部署の所属が無い運用管理者・開発者（上長）も対象外
 */

export const normalizeDeptName = (s: string) => s.replace(/[\s　]+/g, '').normalize('NFKC').toLowerCase()

export type RosterTeam = { id: string; name: string; type: string }

export type RosterMismatch = {
  employeeId: string
  name: string
  rosterDept: string
  rosterDeptAt: string | null
  /** unknown_dept: 名簿の店舗部署がアプリのどの店舗・部署か分からない ／ mismatch: 所属が違う */
  kind: 'unknown_dept' | 'mismatch'
  rosterTeam: RosterTeam | null
  mbTeams: RosterTeam[]
}

export type RosterCheck = {
  items: RosterMismatch[]
  /** 対応づけが必要な名簿の店舗部署名（人数つき） */
  unknownDepts: { name: string; count: number }[]
  /** 名簿の店舗部署が登録されている（＝照合した）人数 */
  checked: number
  teams: RosterTeam[]
  aliases: { rosterName: string; team: RosterTeam | null }[]
}

export async function getRosterCheck(db: SupabaseClient, excludedIds: Set<string>, now: Date = new Date()): Promise<RosterCheck> {
  const [employees, members, { data: teamsData }, { data: aliasData }] = await Promise.all([
    fetchAllRows<{ id: string; name: string; roster_dept: string | null; roster_dept_at: string | null; left_at: string | null; status: string; system_permission: string | null }>((from, to) =>
      db.from('employees').select('id, name, roster_dept, roster_dept_at, left_at, status, system_permission')
        .not('roster_dept', 'is', null).order('id').range(from, to)),
    fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
      db.from('team_members').select('team_id, employee_id').order('team_id').order('employee_id').range(from, to)),
    db.from('teams').select('id, name, type, is_test').in('type', ['store', 'department']).order('name'),
    db.from('roster_dept_aliases').select('roster_name, team_id'),
  ])

  const teams: RosterTeam[] = (teamsData ?? []).filter(t => !t.is_test).map(t => ({ id: t.id, name: t.name, type: t.type }))
  const teamById = new Map(teams.map(t => [t.id, t]))
  // 同じ名前の店舗・部署が2つ以上あるときは、名前だけでは決めない（対応づけを求める）
  const byName = new Map<string, RosterTeam | null>()
  for (const t of teams) {
    const k = normalizeDeptName(t.name)
    byName.set(k, byName.has(k) ? null : t)
  }
  const aliasByName = new Map((aliasData ?? []).map(a => [a.roster_name, teamById.get(a.team_id) ?? null]))

  const mbTeamsOf = new Map<string, RosterTeam[]>()
  for (const m of members) {
    const t = teamById.get(m.team_id)
    if (!t) continue
    ;(mbTeamsOf.get(m.employee_id) ?? mbTeamsOf.set(m.employee_id, []).get(m.employee_id)!).push(t)
  }

  const today = now.toISOString().slice(0, 10)
  const items: RosterMismatch[] = []
  const unknown = new Map<string, number>()
  let checked = 0
  for (const e of employees) {
    const dept = e.roster_dept?.trim()
    if (!dept || e.status !== 'approved' || excludedIds.has(e.id)) continue
    if (e.left_at && e.left_at <= today) continue
    const mbTeams = mbTeamsOf.get(e.id) ?? []
    if (mbTeams.length === 0 && (e.system_permission === 'ops_admin' || e.system_permission === 'developer')) continue
    checked++
    const key = normalizeDeptName(dept)
    const rosterTeam = aliasByName.get(key) ?? byName.get(key) ?? null
    if (!rosterTeam) {
      unknown.set(dept, (unknown.get(dept) ?? 0) + 1)
      items.push({ employeeId: e.id, name: e.name, rosterDept: dept, rosterDeptAt: e.roster_dept_at, kind: 'unknown_dept', rosterTeam: null, mbTeams })
      continue
    }
    if (mbTeams.some(t => t.id === rosterTeam.id)) continue
    items.push({ employeeId: e.id, name: e.name, rosterDept: dept, rosterDeptAt: e.roster_dept_at, kind: 'mismatch', rosterTeam, mbTeams })
  }
  items.sort((a, b) => (a.rosterDept.localeCompare(b.rosterDept, 'ja') || a.name.localeCompare(b.name, 'ja')))

  return {
    items,
    unknownDepts: [...unknown].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    checked,
    teams,
    aliases: [...aliasByName].map(([rosterName, team]) => ({ rosterName, team })),
  }
}

/** ログイン時の「要対応」に出す人数（所属が違う人＋どの店舗か分からない人） */
export async function countRosterMismatches(db: SupabaseClient, excludedIds: Set<string>): Promise<number> {
  const { count } = await db.from('employees').select('id', { count: 'exact', head: true }).not('roster_dept', 'is', null)
  if (!count) return 0
  return (await getRosterCheck(db, excludedIds)).items.length
}
