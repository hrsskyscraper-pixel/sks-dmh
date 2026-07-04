import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmployeeProjectMapping } from '@/lib/project-members'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export type RankEntry = {
  employeeId: string
  name: string
  avatarUrl: string | null
  joinDate: string | null
  store: string | null
  affType: 'store' | 'department' | 'project' | null
  curricula: string[]
  count: number
  /** カリキュラム別の認定数（合算の内訳・クリックで表示） */
  breakdown: { name: string; count: number }[]
}

/**
 * 期間内の認定（certified）を、所属する有効な習得カリキュラムごとに集計して合算しランキング化。
 * テスト・開発者は除外。includeZero=true で認定0件メンバーも含む。toISO 指定時はその月までの参加者のみ。
 */
export async function computeSkillCountRanking(
  db: SupabaseClient,
  fromISO: string,
  toISO: string | null,
  testIds: Set<string>,
  topN = 10,
  includeZero = false,
): Promise<RankEntry[]> {
  // 期間内の認定（skill_id 付き）
  const achs = await fetchAllRows<{ employee_id: string; skill_id: string; certified_at: string | null }>((from, to) => {
    let q = db.from('achievements').select('employee_id, skill_id, certified_at').eq('status', 'certified').gte('certified_at', fromISO)
    if (toISO) q = q.lt('certified_at', toISO)
    return q.order('id').range(from, to)
  })
  const certSkillsByEmp: Record<string, Set<string>> = {}
  for (const a of achs) {
    if (!a.certified_at || testIds.has(a.employee_id)) continue
    ;(certSkillsByEmp[a.employee_id] ??= new Set()).add(a.skill_id)
  }

  // 社員→所属カリキュラム
  const mapping = await getEmployeeProjectMapping(db, { excludeOptOuts: true })
  const projectIdsByEmp: Record<string, string[]> = {}
  const allProjectIds = new Set<string>()
  for (const m of mapping) {
    ;(projectIdsByEmp[m.employee_id] ??= []).push(m.project_id)
    allProjectIds.add(m.project_id)
  }

  // 有効カリキュラム（フェーズあり）の名前・スキル集合（セットアップ未完了は除外）
  const [{ data: projects }, { data: phaseRows }, { data: psRows }] = allProjectIds.size > 0
    ? await Promise.all([
        db.from('skill_projects').select('id, name').in('id', [...allProjectIds]),
        db.from('project_phases').select('project_id').in('project_id', [...allProjectIds]),
        db.from('project_skills').select('project_id, skill_id').in('project_id', [...allProjectIds]),
      ])
    : [{ data: [] as { id: string; name: string }[] }, { data: [] as { project_id: string }[] }, { data: [] as { project_id: string; skill_id: string }[] }]
  const projectNameById: Record<string, string> = Object.fromEntries((projects ?? []).map(p => [p.id, p.name]))
  const validProjectIds = new Set((phaseRows ?? []).map(r => r.project_id))
  const projectSkillSet: Record<string, Set<string>> = {}
  for (const ps of psRows ?? []) (projectSkillSet[ps.project_id] ??= new Set()).add(ps.skill_id)

  const validPidsOf = (empId: string) => [...new Set(projectIdsByEmp[empId] ?? [])].filter(p => validProjectIds.has(p))

  // ランキング候補
  let candidateIds: string[]
  if (includeZero) {
    const allEmps = await fetchAllRows<{ id: string; approved_at: string | null }>((from, to) =>
      db.from('employees').select('id, approved_at').eq('status', 'approved').order('id').range(from, to))
    candidateIds = allEmps
      .filter(e => !testIds.has(e.id) && (!toISO || !e.approved_at || e.approved_at < toISO))
      .map(e => e.id)
  } else {
    candidateIds = Object.keys(certSkillsByEmp)
  }

  // カリキュラム別の認定数 → 合算（同じスキルが複数カリキュラムに属する場合は各カリキュラムで計上）
  const totals: Record<string, number> = {}
  const breakdownById: Record<string, { name: string; count: number }[]> = {}
  for (const id of candidateIds) {
    const certSkills = certSkillsByEmp[id] ?? new Set<string>()
    const bd = validPidsOf(id).map(pid => {
      const skills = projectSkillSet[pid] ?? new Set<string>()
      let c = 0
      for (const sid of certSkills) if (skills.has(sid)) c++
      return { name: projectNameById[pid] ?? '', count: c }
    }).filter(b => b.count > 0).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
    totals[id] = bd.reduce((s, b) => s + b.count, 0)
    breakdownById[id] = bd
  }

  let rankedIds = includeZero ? candidateIds : candidateIds.filter(id => totals[id] > 0)
  if (rankedIds.length === 0) return []

  // 並べ替え（合算降順・同点は名前）
  const { data: nameEmps } = await db.from('employees').select('id, name').in('id', rankedIds)
  const nameForSort: Record<string, string> = Object.fromEntries((nameEmps ?? []).map(e => [e.id, e.name]))
  rankedIds = [...rankedIds].sort((a, b) => (totals[b] - totals[a]) || (nameForSort[a] ?? '').localeCompare(nameForSort[b] ?? '', 'ja'))
  const ids = rankedIds.slice(0, topN)

  // 詳細（名前/アバター/承認日/店舗部署/カリキュラム名）
  const { data: emps } = await db.from('employees').select('id, name, avatar_url, approved_at').in('id', ids)
  const nameById: Record<string, string> = Object.fromEntries((emps ?? []).map(e => [e.id, e.name]))
  const avatarById: Record<string, string | null> = Object.fromEntries((emps ?? []).map(e => [e.id, e.avatar_url]))
  const joinById: Record<string, string | null> = Object.fromEntries((emps ?? []).map(e => [e.id, e.approved_at]))
  type TeamJoin = { employee_id: string; teams: { name: string; type: string } | { name: string; type: string }[] | null }
  const pickAff = (rows: TeamJoin[], store: Record<string, string>, dept: Record<string, string>) => {
    for (const m of rows) {
      const t = Array.isArray(m.teams) ? m.teams[0] : m.teams
      if (t?.type === 'store' && !store[m.employee_id]) store[m.employee_id] = t.name
      if (t?.type === 'department' && !dept[m.employee_id]) dept[m.employee_id] = t.name
    }
  }
  const [{ data: tm }, { data: tmg }] = await Promise.all([
    db.from('team_members').select('employee_id, teams(name, type)').in('employee_id', ids),
    db.from('team_managers').select('employee_id, teams(name, type)').in('employee_id', ids),
  ])
  const memStore: Record<string, string> = {}, memDept: Record<string, string> = {}
  const mgrStore: Record<string, string> = {}, mgrDept: Record<string, string> = {}
  pickAff((tm ?? []) as TeamJoin[], memStore, memDept)
  pickAff((tmg ?? []) as TeamJoin[], mgrStore, mgrDept)
  const affById: Record<string, string> = {}
  const affTypeById: Record<string, 'store' | 'department'> = {}
  for (const id of ids) {
    if (memStore[id]) { affById[id] = memStore[id]; affTypeById[id] = 'store' }
    else if (memDept[id]) { affById[id] = memDept[id]; affTypeById[id] = 'department' }
    else if (mgrStore[id]) { affById[id] = mgrStore[id]; affTypeById[id] = 'store' }
    else if (mgrDept[id]) { affById[id] = mgrDept[id]; affTypeById[id] = 'department' }
  }
  const curriculaById: Record<string, string[]> = {}
  for (const id of ids) {
    curriculaById[id] = [...new Set(validPidsOf(id).map(pid => projectNameById[pid]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
  }

  return ids.map(id => ({
    employeeId: id,
    name: nameById[id] ?? '不明',
    avatarUrl: avatarById[id] ?? null,
    joinDate: joinById[id] ?? null,
    store: affById[id] ?? null,
    affType: affTypeById[id] ?? null,
    curricula: curriculaById[id] ?? [],
    count: totals[id] ?? 0,
    breakdown: breakdownById[id] ?? [],
  }))
}

/**
 * 前月のスキル習得ランキングを「本日のお知らせ」に自動掲載（未掲載なら）。
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
  const title = `${monthLabel}のスキル習得ランキングが掲載されました！🏆`
  const body = `TOP3は…\n${top}\nおめでとうございます☆ みんなで🎉を送りましょう！`
  const expires = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) // 2週間表示

  try {
    await db.from('announcements').insert({ kind: 'ranking', period, title, body, expires_at: expires.toISOString() })
  } catch {
    // 同時アクセスでの重複(ユニーク制約)は無視
  }
}
