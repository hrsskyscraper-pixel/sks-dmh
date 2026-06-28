import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmployeeProjectMapping } from '@/lib/project-members'

export type RankEntry = { employeeId: string; name: string; avatarUrl: string | null; store: string | null; affType: 'store' | 'department' | null; curricula: string[]; count: number }

/** 期間内の認定（certified）数を社員ごとに集計してランキング化（テスト除外） */
export async function computeSkillCountRanking(
  db: SupabaseClient,
  fromISO: string,
  toISO: string | null,
  testIds: Set<string>,
  topN = 10,
): Promise<RankEntry[]> {
  let q = db.from('achievements').select('employee_id, certified_at').eq('status', 'certified').gte('certified_at', fromISO)
  if (toISO) q = q.lt('certified_at', toISO)
  const { data } = await q

  const counts: Record<string, number> = {}
  for (const a of data ?? []) {
    if (!a.certified_at || testIds.has(a.employee_id)) continue
    counts[a.employee_id] = (counts[a.employee_id] ?? 0) + 1
  }
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, topN)
  const ids = ranked.map(([id]) => id)
  if (ids.length === 0) return []

  const { data: emps } = await db.from('employees').select('id, name, avatar_url').in('id', ids)
  const nameById: Record<string, string> = Object.fromEntries((emps ?? []).map(e => [e.id, e.name]))
  const avatarById: Record<string, string | null> = Object.fromEntries((emps ?? []).map(e => [e.id, e.avatar_url]))
  type TeamJoin = { employee_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }
  const pickAff = (rows: TeamJoin[], store: Record<string, string>, dept: Record<string, string>) => {
    for (const m of rows) {
      const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
      if (t?.type === 'store' && !store[m.employee_id]) store[m.employee_id] = t.name
      if (t?.type === 'department' && !dept[m.employee_id]) dept[m.employee_id] = t.name
    }
  }
  // メンバー所属（team_members）と担当（team_managers）の両方から店舗/部署を集める
  const [{ data: tm }, { data: tmg }] = await Promise.all([
    db.from('team_members').select('employee_id, teams(name, type)').in('employee_id', ids),
    db.from('team_managers').select('employee_id, teams(name, type)').in('employee_id', ids),
  ])
  const memStore: Record<string, string> = {}, memDept: Record<string, string> = {}
  const mgrStore: Record<string, string> = {}, mgrDept: Record<string, string> = {}
  pickAff((tm ?? []) as TeamJoin[], memStore, memDept)
  pickAff((tmg ?? []) as TeamJoin[], mgrStore, mgrDept)
  // 表示の優先順位: メンバー店舗 → メンバー部署 → 担当店舗 → 担当部署
  const affById: Record<string, string> = {}
  const affTypeById: Record<string, 'store' | 'department'> = {}
  for (const id of ids) {
    if (memStore[id]) { affById[id] = memStore[id]; affTypeById[id] = 'store' }
    else if (memDept[id]) { affById[id] = memDept[id]; affTypeById[id] = 'department' }
    else if (mgrStore[id]) { affById[id] = mgrStore[id]; affTypeById[id] = 'store' }
    else if (mgrDept[id]) { affById[id] = mgrDept[id]; affTypeById[id] = 'department' }
  }

  // 各社員の所属習得カリキュラム名（project_teams + team_members 経由）
  const idSet = new Set(ids)
  const mapping = await getEmployeeProjectMapping(db)
  const projectIdsByEmp: Record<string, string[]> = {}
  const allProjectIds = new Set<string>()
  for (const m of mapping) {
    if (!idSet.has(m.employee_id)) continue
    ;(projectIdsByEmp[m.employee_id] ??= []).push(m.project_id)
    allProjectIds.add(m.project_id)
  }
  const { data: projects } = allProjectIds.size > 0
    ? await db.from('skill_projects').select('id, name').in('id', [...allProjectIds])
    : { data: [] as { id: string; name: string }[] }
  const projectNameById: Record<string, string> = Object.fromEntries((projects ?? []).map(p => [p.id, p.name]))
  const curriculaById: Record<string, string[]> = {}
  for (const [empId, pids] of Object.entries(projectIdsByEmp)) {
    curriculaById[empId] = [...new Set(pids.map(pid => projectNameById[pid]).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ja'))
  }

  return ranked.map(([id, count]) => ({ employeeId: id, name: nameById[id] ?? '不明', avatarUrl: avatarById[id] ?? null, store: affById[id] ?? null, affType: affTypeById[id] ?? null, curricula: curriculaById[id] ?? [], count }))
}

/**
 * 前月のスキル習得数ランキングを「本日のお知らせ」に自動掲載（未掲載なら）。
 * ホーム読込時に呼ぶ。period(YYYY-MM)のユニーク制約で重複生成を防ぐ。
 */
export async function ensureMonthlyRankingAnnouncement(db: SupabaseClient, testIds: Set<string>): Promise<void> {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const period = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`

  const { data: existing } = await db.from('announcements').select('id').eq('kind', 'ranking').eq('period', period).limit(1)
  if (existing && existing.length > 0) return

  const fromISO = new Date(prev.getFullYear(), prev.getMonth(), 1).toISOString()
  const toISO = new Date(now.getFullYear(), now.getMonth(), 1).toISOString() // 当月1日 0:00
  const ranking = await computeSkillCountRanking(db, fromISO, toISO, testIds, 3)
  if (ranking.length === 0) return

  const monthLabel = `${prev.getMonth() + 1}月`
  const top = ranking.map((r, i) => `${i + 1}位 ${r.store ? r.store + 'の ' : ''}${r.name}さん（${r.count}個）`).join('\n')
  const title = `${monthLabel}のスキル習得数ランキングが掲載されました！🏆`
  const body = `TOP3は…\n${top}\nおめでとうございます☆ みんなで🎉を送りましょう！`
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 2週間表示

  try {
    await db.from('announcements').insert({ kind: 'ranking', period, title, body, expires_at: expires.toISOString() })
  } catch {
    // 同時アクセスでの重複(ユニーク制約)は無視
  }
}
