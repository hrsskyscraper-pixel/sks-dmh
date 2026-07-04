import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmployeeProjectMapping } from '@/lib/project-members'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export type AffType = 'store' | 'department' | 'project'

export type RankPeriod = { key: string; label: string; toISO: string | null }
export type ComparePeriod = { key: string; label: string; prevKey: string }

export type RankRowMeta = {
  id: string
  name: string
  avatarUrl: string | null
  affName: string | null
  affType: AffType | null
  joinDate: string | null
  curricula: string[]
}

/** ランキングページの全切替（個人別/所属別 × 期間内/前月対比 × 各期間）に必要なデータを一括算出した結果 */
export type RankingDataset = {
  periods: RankPeriod[]
  comparePeriods: ComparePeriod[]
  personalMeta: RankRowMeta[]
  affiliationMeta: RankRowMeta[]
  /** periodKey -> employeeId -> 期間内の合算認定数 */
  empCount: Record<string, Record<string, number>>
  /** periodKey -> employeeId -> カリキュラム別内訳 */
  empBreakdown: Record<string, Record<string, { name: string; count: number }[]>>
  /** periodKey -> teamId -> 所属メンバーの合算認定数 */
  affCount: Record<string, Record<string, number>>
}

const mk = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}`
const ml = (y: number, m: number) => `${y}年${m + 1}月`
const monthFromISO = (y: number, m: number) => new Date(y, m, 1).toISOString()

/**
 * スキル習得ランキングの全データセットを構築。
 * - 期間: 過去30日 ＋ 各月（最古の認定月まで、最大12ヶ月）
 * - 個人別/所属別の期間内認定数、および前月対比の算出に必要な月別カウントを内包
 * - テスト社員・開発者は testIds で除外
 * 認定数のカウントは既存の computeSkillCountRanking と同じ「有効カリキュラム別に数えて合算」ロジック。
 */
export async function buildRankingDataset(
  db: SupabaseClient,
  testIds: Set<string>,
  now: Date,
): Promise<RankingDataset> {
  // 全認定（期間で絞らず取得し、JSで月別バケツに振り分け）
  const certRows = await fetchAllRows<{ employee_id: string; skill_id: string; certified_at: string | null }>((from, to) =>
    db.from('achievements')
      .select('employee_id, skill_id, certified_at')
      .eq('status', 'certified')
      .order('id')
      .range(from, to),
  )
  const certs = certRows
    .filter(c => c.certified_at && !testIds.has(c.employee_id))
    .map(c => ({ e: c.employee_id as string, s: c.skill_id as string, t: Date.parse(c.certified_at as string) }))

  // 期間（月）の生成: 当月 → 最古の認定月（最大12ヶ月）。+1ヶ月古いものを前月対比の基準用に余分に算出。
  let earliest = now.getTime()
  for (const c of certs) if (c.t < earliest) earliest = c.t
  const eDate = new Date(earliest)
  const curY = now.getFullYear(), curM = now.getMonth()
  const earY = eDate.getFullYear(), earM = eDate.getMonth()
  const months: { key: string; label: string; y: number; m: number }[] = []
  let y = curY, m = curM
  while (true) {
    months.push({ key: mk(y, m), label: ml(y, m), y, m })
    if ((y === earY && m === earM) || months.length >= 12) break
    m--; if (m < 0) { m = 11; y-- }
  }
  const oldest = months[months.length - 1]
  let ey = oldest.y, em = oldest.m - 1
  if (em < 0) { em = 11; ey-- }
  const extra = { key: mk(ey, em), y: ey, m: em }

  const last30From = now.getTime() - 30 * 24 * 60 * 60 * 1000
  const computeList: { key: string; fromMs: number; toMs: number }[] = [
    { key: 'last30', fromMs: last30From, toMs: Infinity },
    ...months.map(mo => ({ key: mo.key, fromMs: Date.parse(monthFromISO(mo.y, mo.m)), toMs: Date.parse(monthFromISO(mo.y, mo.m + 1)) })),
    { key: extra.key, fromMs: Date.parse(monthFromISO(extra.y, extra.m)), toMs: Date.parse(monthFromISO(extra.y, extra.m + 1)) },
  ]

  const periods: RankPeriod[] = [
    { key: 'last30', label: '過去30日', toISO: null },
    ...months.map(mo => ({ key: mo.key, label: mo.label, toISO: monthFromISO(mo.y, mo.m + 1) })),
  ]
  const comparePeriods: ComparePeriod[] = months.map((mo, i) => ({
    key: mo.key,
    label: mo.label,
    prevKey: i < months.length - 1 ? months[i + 1].key : extra.key,
  }))

  // 社員→所属カリキュラム
  const mapping = await getEmployeeProjectMapping(db, { excludeOptOuts: true })
  const projectIdsByEmp: Record<string, string[]> = {}
  const allProjectIds = new Set<string>()
  for (const mp of mapping) {
    ;(projectIdsByEmp[mp.employee_id] ??= []).push(mp.project_id)
    allProjectIds.add(mp.project_id)
  }

  // 有効カリキュラム（フェーズあり）の名前・スキル集合
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
  const validPidsOf = (e: string) => [...new Set(projectIdsByEmp[e] ?? [])].filter(p => validProjectIds.has(p))

  // 対象社員（承認・非テスト）
  const empRows = await fetchAllRows<{ id: string; name: string; avatar_url: string | null; approved_at: string | null }>((from, to) =>
    db.from('employees').select('id, name, avatar_url, approved_at').eq('status', 'approved').order('id').range(from, to),
  )
  const targetEmps = empRows.filter(e => !testIds.has(e.id))
  const targetIds = new Set(targetEmps.map(e => e.id))

  // 期間別の個人カウント＋内訳
  const empCount: Record<string, Record<string, number>> = {}
  const empBreakdown: Record<string, Record<string, { name: string; count: number }[]>> = {}
  for (const p of computeList) {
    const certByEmp: Record<string, Set<string>> = {}
    for (const c of certs) {
      if (!targetIds.has(c.e)) continue
      if (c.t < p.fromMs || c.t >= p.toMs) continue
      ;(certByEmp[c.e] ??= new Set()).add(c.s)
    }
    const cnt: Record<string, number> = {}
    const bdm: Record<string, { name: string; count: number }[]> = {}
    for (const e of Object.keys(certByEmp)) {
      const cs = certByEmp[e]
      const bd: { name: string; count: number }[] = []
      for (const pid of validPidsOf(e)) {
        const ss = projectSkillSet[pid]; if (!ss) continue
        let c = 0
        for (const s of cs) if (ss.has(s)) c++
        if (c > 0) bd.push({ name: projectNameById[pid] ?? '', count: c })
      }
      bd.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
      const total = bd.reduce((s, b) => s + b.count, 0)
      if (total > 0) { cnt[e] = total; bdm[e] = bd }
    }
    empCount[p.key] = cnt
    empBreakdown[p.key] = bdm
  }

  // 所属（店舗・部署・PJチーム、非テスト）とメンバー
  const { data: teamRows } = await db.from('teams').select('id, name, type, is_test').in('type', ['store', 'department', 'project'])
  const realTeams = (teamRows ?? []).filter(t => !t.is_test) as { id: string; name: string; type: AffType }[]
  const teamById: Record<string, { id: string; name: string; type: AffType }> = Object.fromEntries(realTeams.map(t => [t.id, t]))
  const teamIds = realTeams.map(t => t.id)
  const [tmAll, tmgAll] = teamIds.length > 0
    ? await Promise.all([
        fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
          db.from('team_members').select('team_id, employee_id').in('team_id', teamIds).order('team_id').order('employee_id').range(from, to)),
        fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
          db.from('team_managers').select('team_id, employee_id').in('team_id', teamIds).order('team_id').order('employee_id').range(from, to)),
      ])
    : [[] as { team_id: string; employee_id: string }[], [] as { team_id: string; employee_id: string }[]]

  const membersByTeam: Record<string, string[]> = {}
  for (const r of tmAll ?? []) {
    if (!targetIds.has(r.employee_id)) continue
    ;(membersByTeam[r.team_id] ??= []).push(r.employee_id)
  }
  const affiliationMeta: RankRowMeta[] = realTeams
    .filter(t => (membersByTeam[t.id]?.length ?? 0) > 0)
    .map(t => ({ id: t.id, name: t.name, avatarUrl: null, affName: null, affType: t.type, joinDate: null, curricula: [] }))

  const affCount: Record<string, Record<string, number>> = {}
  for (const p of computeList) {
    const ec = empCount[p.key]
    const cnt: Record<string, number> = {}
    for (const t of affiliationMeta) {
      let s = 0
      for (const e of membersByTeam[t.id] ?? []) s += ec[e] ?? 0
      if (s > 0) cnt[t.id] = s
    }
    affCount[p.key] = cnt
  }

  // 個人の所属バッジ（メンバーの店舗>部署>PJ、無ければマネージャーの店舗>部署>PJ）
  type AffPick = { store?: string; dept?: string; proj?: string }
  const pickByEmp = (rows: { team_id: string; employee_id: string }[]) => {
    const byEmp: Record<string, AffPick> = {}
    for (const r of rows) {
      const t = teamById[r.team_id]; if (!t) continue
      const b = (byEmp[r.employee_id] ??= {})
      if (t.type === 'store' && !b.store) b.store = t.name
      if (t.type === 'department' && !b.dept) b.dept = t.name
      if (t.type === 'project' && !b.proj) b.proj = t.name
    }
    return byEmp
  }
  const memAff = pickByEmp(tmAll ?? [])
  const mgrAff = pickByEmp(tmgAll ?? [])
  const affOf = (e: string): { name: string | null; type: AffType | null } => {
    for (const src of [memAff[e] ?? {}, mgrAff[e] ?? {}]) {
      if (src.store) return { name: src.store, type: 'store' }
      if (src.dept) return { name: src.dept, type: 'department' }
      if (src.proj) return { name: src.proj, type: 'project' }
    }
    return { name: null, type: null }
  }

  const personalMeta: RankRowMeta[] = targetEmps.map(e => {
    const a = affOf(e.id)
    const curricula = [...new Set(validPidsOf(e.id).map(pid => projectNameById[pid]).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'ja'))
    return { id: e.id, name: e.name, avatarUrl: e.avatar_url, affName: a.name, affType: a.type, joinDate: e.approved_at, curricula }
  })

  return { periods, comparePeriods, personalMeta, affiliationMeta, empCount, empBreakdown, affCount }
}
