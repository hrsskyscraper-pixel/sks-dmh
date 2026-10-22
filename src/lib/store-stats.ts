import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { getTestEmployeeIds, getTestTeamIds } from '@/lib/test-data'
import { getEmployeeProjectMapping } from '@/lib/project-members'

/**
 * 店舗別スキル状況（/admin/store-stats）の集計。人事・育成ダッシュボード（2026-09-19 MTG 決定 ⑥）。
 *
 * 用語の定義（画面の「数え方」パネルと必ず一致させること）:
 * - 対象従業員数 : その所属に「メンバー」として在籍する、承認済み・非テスト・**在籍中（退職日なし）** の社員数。
 *                  リーダーはトリガ（sync_leader_as_member）でメンバー行も持つため含まれる。
 * - スキル申請人数: 対象従業員のうち、スキル申請を1件以上出したことがある人数
 *                  （承認待ち・認定済み・差し戻しのいずれかが1件でもある人）。
 * - 承認済み人数  : 対象従業員のうち、認定済み（certified）の申請を1件以上持つ人数。
 * - 未申請人数    : 対象従業員数 − スキル申請人数（一度も申請していない人数）。
 * - 未承認件数    : 対象従業員の申請のうち、承認待ち（pending）の「件数」。人数ではない。
 * - 停滞人数      : 対象従業員のうち、最後の動き（最終申請日。一度も申請していない人は登録日）から
 *                  STALLED_DAYS 日以上、申請が1件も無い人数。2026-09-19 のMTGで「停滞＝申請なし7日」と決定。
 * - 進捗率        : 対象従業員それぞれの「所属カリキュラムのスキルのうち認定済みの割合」の平均。
 *                  カリキュラムに所属していない人は分母に入れない（— 表示）。
 * - 30/60/90日定着率: 入社日から N 日を経過した入社者（退職者を含む）のうち、その N 日目に在籍していた割合。
 *                  入社日が無い人は数えない。該当者が 0 人なら —。退職日は employees.left_at。
 *
 * 複数店舗に所属する社員は各店舗に計上されるため、店舗行の単純合計は全社合計と一致しない。
 * 全社合計は社員IDで重複排除して算出する（画面側で行の members から再集計できるよう、必要な値は members に持たせる）。
 */

/** 停滞と判定する日数（最後の動きからの経過日数） */
export const STALLED_DAYS = 7
/** 「新人」とみなす入社からの日数 */
export const NEWCOMER_DAYS = 90
export const RETENTION_DAYS = [30, 60, 90] as const

export type StoreStatMember = {
  id: string
  name: string
  /** 申請件数（承認待ち＋認定済み＋差し戻しの合計） */
  applied: number
  certified: number
  pending: number
  rejected: number
  /** 最終申請日時（ISO）。一度も申請していなければ null */
  lastAppliedAt: string | null
  /** 最後の動き（最終申請、なければ登録）からの経過日数 */
  stalledDays: number
  /** stalledDays >= STALLED_DAYS */
  stalled: boolean
  /** 入社日（YYYY-MM-DD）。未登録なら null */
  hireDate: string | null
  /** 退職日（YYYY-MM-DD）。在籍中なら null。対象従業員（在籍中）の一覧では常に null */
  leftAt: string | null
  /** 入社からの日数（入社日が無ければ null） */
  daysSinceHire: number | null
  /** 所属カリキュラムの達成率（0〜100）。カリキュラム未所属なら null */
  progress: number | null
  /** 次に取り組む項目（所属カリキュラムで最初の未認定スキル）。無ければ null */
  nextSkill: string | null
}

/** 定着率の材料（在籍者・退職者の両方から数える） */
export type RetentionCohort = {
  /** 入社日から N 日を経過した人数 */
  eligible: number
  /** そのうち N 日目に在籍していた人数 */
  retained: number
}

export type RetentionByDays = Record<(typeof RETENTION_DAYS)[number], RetentionCohort>

export type StoreStatRow = {
  id: string
  name: string
  /** 'none' は「所属なし」の集約行（実在のチームではない） */
  type: 'store' | 'department' | 'none'
  brandName: string | null
  target: number
  /** スキル申請人数 */
  applied: number
  /** 承認済み人数 */
  certified: number
  /** 未申請人数 */
  notApplied: number
  /** 未承認件数（承認待ちの申請件数） */
  pending: number
  /** 停滞人数（最後の動きから STALLED_DAYS 日以上、申請が無い人数） */
  stalled: number
  /** 進捗率（達成率の平均。0〜100）。対象がいなければ null */
  progress: number | null
  /** 30/60/90日定着率の材料（この所属に登録されている入社者。退職者を含む） */
  retention: RetentionByDays
  members: StoreStatMember[]
  /** 定着率の計算に使う、退職者を含む入社者（画面側で入社月フィルタをかけ直すために持つ） */
  cohort: { id: string; hireDate: string; leftAt: string | null }[]
}

export type StoreStatsTotal = {
  target: number
  applied: number
  certified: number
  notApplied: number
  pending: number
  stalled: number
  progress: number | null
  retention: RetentionByDays
}

export type StoreStats = {
  rows: StoreStatRow[]
  /** 社員IDで重複排除した全社合計 */
  total: StoreStatsTotal
  brands: string[]
  generatedAt: string
}

const NO_AFFILIATION_ID = '__none__'
const DAY = 86400000

const emptyRetention = (): RetentionByDays => ({ 30: { eligible: 0, retained: 0 }, 60: { eligible: 0, retained: 0 }, 90: { eligible: 0, retained: 0 } })

/** 定着率の材料を数える（入社日 + N 日 が今日以前の人が対象） */
export function computeRetention(cohort: { hireDate: string; leftAt: string | null }[], now = Date.now()): RetentionByDays {
  const r = emptyRetention()
  for (const c of cohort) {
    const hired = Date.parse(c.hireDate)
    if (Number.isNaN(hired)) continue
    const left = c.leftAt ? Date.parse(c.leftAt) : null
    for (const n of RETENTION_DAYS) {
      const at = hired + n * DAY
      if (at > now) continue
      r[n].eligible++
      if (left === null || Number.isNaN(left) || left > at) r[n].retained++
    }
  }
  return r
}

/** メンバー一覧から行の数字を出す（画面側の再集計でも同じ関数を使う） */
export function aggregateMembers(members: StoreStatMember[]): Pick<StoreStatRow, 'target' | 'applied' | 'certified' | 'notApplied' | 'pending' | 'stalled' | 'progress'> {
  const applied = members.filter(m => m.applied > 0).length
  const withProgress = members.filter(m => m.progress !== null)
  return {
    target: members.length,
    applied,
    certified: members.filter(m => m.certified > 0).length,
    notApplied: members.length - applied,
    pending: members.reduce((s, m) => s + m.pending, 0),
    stalled: members.filter(m => m.stalled).length,
    progress: withProgress.length > 0 ? Math.round(withProgress.reduce((s, m) => s + (m.progress ?? 0), 0) / withProgress.length) : null,
  }
}

export async function buildStoreStats(): Promise<StoreStats> {
  const db = createAdminClient()
  const [testEmpIds, testTeamIds] = await Promise.all([getTestEmployeeIds(), getTestTeamIds()])
  const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

  const [teamRows, brandRows, empRows, memberRows, achRows, projectSkillRows, phaseRows, skillRows, empProjects] = await Promise.all([
    db.from('teams').select('id, name, type, brand_id, is_test').in('type', ['store', 'department']),
    db.from('brands').select('id, name'),
    fetchAllRows<{ id: string; name: string; created_at: string; hire_date: string | null; left_at?: string | null }>((from, to) =>
      db.from('employees').select('id, name, created_at, hire_date, left_at').eq('status', 'approved').order('id').range(from, to)),
    fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
      db.from('team_members').select('team_id, employee_id').order('team_id').order('employee_id').range(from, to)),
    fetchAllRows<{ employee_id: string; skill_id: string; status: string; created_at: string }>((from, to) =>
      db.from('achievements').select('employee_id, skill_id, status, created_at').order('id').range(from, to)),
    fetchAllRows<{ project_id: string; skill_id: string; project_phase_id: string | null }>((from, to) =>
      db.from('project_skills').select('project_id, skill_id, project_phase_id').order('project_id').order('skill_id').range(from, to)),
    db.from('project_phases').select('id, order_index'),
    fetchAllRows<{ id: string; name: string; order_index: number }>((from, to) =>
      db.from('skills').select('id, name, order_index').order('id').range(from, to)),
    getEmployeeProjectMapping({ membersOnly: true }),
  ])

  const brandNameById: Record<string, string> = Object.fromEntries((brandRows.data ?? []).map(b => [b.id, b.name]))
  const teams = ((teamRows.data ?? []) as { id: string; name: string; type: string; brand_id: string | null; is_test: boolean }[])
    .filter(t => !t.is_test && !testTeamIds.has(t.id))

  // 承認済み・非テストの全員（退職者を含む。定着率の分母に使う）
  const everyone = empRows.filter(e => !testEmpIds.has(e.id))
  const isLeft = (e: { left_at?: string | null }) => !!e.left_at && e.left_at <= todayStr
  // 対象従業員（在籍中）
  const targets = everyone.filter(e => !isLeft(e))
  const targetIds = new Set(targets.map(e => e.id))
  const empById: Record<string, { name: string; created_at: string; hire_date: string | null; left_at?: string | null }> =
    Object.fromEntries(everyone.map(e => [e.id, e]))
  const now = Date.now()

  // 社員ごとの申請状況
  type Counts = { applied: number; certified: number; pending: number; rejected: number; lastAppliedAt: string | null; certifiedSkillIds: Set<string>; pendingSkillIds: Set<string> }
  const countsByEmp: Record<string, Counts> = {}
  const newCounts = (): Counts => ({ applied: 0, certified: 0, pending: 0, rejected: 0, lastAppliedAt: null, certifiedSkillIds: new Set(), pendingSkillIds: new Set() })
  for (const a of achRows) {
    if (!targetIds.has(a.employee_id)) continue
    const c = (countsByEmp[a.employee_id] ??= newCounts())
    c.applied++
    if (a.status === 'certified') { c.certified++; c.certifiedSkillIds.add(a.skill_id) }
    else if (a.status === 'pending') { c.pending++; c.pendingSkillIds.add(a.skill_id) }
    else if (a.status === 'rejected') c.rejected++
    if (!c.lastAppliedAt || a.created_at > c.lastAppliedAt) c.lastAppliedAt = a.created_at
  }
  const countsOf = (id: string): Counts => countsByEmp[id] ?? newCounts()
  /** 最後の動き（最終申請。なければ登録）からの経過日数 */
  const stalledDaysOf = (id: string, lastAppliedAt: string | null): number => {
    const base = lastAppliedAt ?? empById[id]?.created_at
    if (!base) return 0
    return Math.max(0, Math.floor((now - new Date(base).getTime()) / DAY))
  }

  // カリキュラム → スキル（習得順）
  const phaseOrder: Record<string, number> = Object.fromEntries((phaseRows.data ?? []).map(p => [p.id, p.order_index]))
  const skillById: Record<string, { name: string; order_index: number }> = Object.fromEntries(skillRows.map(s => [s.id, s]))
  const skillsByProject: Record<string, { skillId: string; key: number }[]> = {}
  for (const ps of projectSkillRows) {
    const sk = skillById[ps.skill_id]
    if (!sk) continue
    const key = (ps.project_phase_id ? (phaseOrder[ps.project_phase_id] ?? 0) : 0) * 100000 + (sk.order_index ?? 0)
    ;(skillsByProject[ps.project_id] ??= []).push({ skillId: ps.skill_id, key })
  }
  for (const pid in skillsByProject) skillsByProject[pid].sort((a, b) => a.key - b.key)
  const projectsByEmp: Record<string, string[]> = {}
  for (const m of empProjects) (projectsByEmp[m.employee_id] ??= []).push(m.project_id)

  /** 達成率と「次の項目」（所属カリキュラムの全スキルの和集合で計算。次の項目は最初のカリキュラムの並びで探す） */
  const progressOf = (id: string, c: Counts): { progress: number | null; nextSkill: string | null } => {
    const pids = projectsByEmp[id] ?? []
    if (pids.length === 0) return { progress: null, nextSkill: null }
    const all = new Set<string>()
    for (const pid of pids) for (const s of skillsByProject[pid] ?? []) all.add(s.skillId)
    if (all.size === 0) return { progress: null, nextSkill: null }
    let done = 0
    for (const sid of all) if (c.certifiedSkillIds.has(sid)) done++
    let nextSkill: string | null = null
    for (const pid of pids) {
      const next = (skillsByProject[pid] ?? []).find(s => !c.certifiedSkillIds.has(s.skillId) && !c.pendingSkillIds.has(s.skillId))
      if (next) { nextSkill = skillById[next.skillId]?.name ?? null; break }
    }
    return { progress: Math.round((done / all.size) * 100), nextSkill }
  }

  // 所属（店舗・部署）→ 在籍者 ／ 退職者を含む入社者
  const teamIds = new Set(teams.map(t => t.id))
  const membersByTeam: Record<string, string[]> = {}
  const cohortByTeam: Record<string, string[]> = {}
  const affiliated = new Set<string>()
  const everyoneIds = new Set(everyone.map(e => e.id))
  for (const r of memberRows) {
    if (!teamIds.has(r.team_id) || !everyoneIds.has(r.employee_id)) continue
    const cl = (cohortByTeam[r.team_id] ??= [])
    if (!cl.includes(r.employee_id)) cl.push(r.employee_id)
    if (!targetIds.has(r.employee_id)) continue
    const list = (membersByTeam[r.team_id] ??= [])
    if (!list.includes(r.employee_id)) list.push(r.employee_id)
    affiliated.add(r.employee_id)
  }

  const buildMembers = (ids: string[]): StoreStatMember[] =>
    ids
      .map(id => {
        const c = countsOf(id)
        const e = empById[id]
        const stalledDays = stalledDaysOf(id, c.lastAppliedAt)
        const hireDate = e?.hire_date ?? null
        const daysSinceHire = hireDate ? Math.max(0, Math.floor((now - Date.parse(hireDate)) / DAY)) : null
        const { progress, nextSkill } = progressOf(id, c)
        return {
          id,
          name: e?.name ?? '',
          applied: c.applied,
          certified: c.certified,
          pending: c.pending,
          rejected: c.rejected,
          lastAppliedAt: c.lastAppliedAt,
          stalledDays,
          stalled: stalledDays >= STALLED_DAYS,
          hireDate,
          leftAt: e?.left_at ?? null,
          daysSinceHire,
          progress,
          nextSkill,
        }
      })
      .sort((a, b) => a.applied - b.applied || b.stalledDays - a.stalledDays || b.pending - a.pending || a.name.localeCompare(b.name, 'ja'))

  const buildCohort = (ids: string[]) =>
    ids
      .map(id => ({ id, hireDate: empById[id]?.hire_date ?? null, leftAt: empById[id]?.left_at ?? null }))
      .filter((c): c is { id: string; hireDate: string; leftAt: string | null } => !!c.hireDate)

  const summarize = (id: string, name: string, type: StoreStatRow['type'], brandName: string | null, memberIds: string[], cohortIds: string[]): StoreStatRow => {
    const members = buildMembers(memberIds)
    const cohort = buildCohort(cohortIds)
    return { id, name, type, brandName, ...aggregateMembers(members), retention: computeRetention(cohort, now), members, cohort }
  }

  const rows: StoreStatRow[] = teams
    .map(t => summarize(
      t.id,
      t.name,
      t.type === 'department' ? 'department' : 'store',
      t.brand_id ? (brandNameById[t.brand_id] ?? null) : null,
      membersByTeam[t.id] ?? [],
      cohortByTeam[t.id] ?? [],
    ))
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'store' ? -1 : 1) || a.name.localeCompare(b.name, 'ja'))

  // 店舗にも部署にも所属していない対象従業員（上長は正常。それ以外は所属設定漏れ）
  const orphanIds = targets.map(e => e.id).filter(id => !affiliated.has(id))
  const orphanCohortIds = everyone.map(e => e.id).filter(id => !Object.values(cohortByTeam).some(l => l.includes(id)))
  if (orphanIds.length > 0 || orphanCohortIds.length > 0) {
    rows.push(summarize(NO_AFFILIATION_ID, '所属なし', 'none', null, orphanIds, orphanCohortIds))
  }

  // 全社合計（社員IDで重複排除）
  const allMembers = buildMembers(targets.map(e => e.id))
  const total: StoreStatsTotal = {
    ...aggregateMembers(allMembers),
    retention: computeRetention(buildCohort(everyone.map(e => e.id)), now),
  }

  const brands = [...new Set(rows.map(r => r.brandName).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b, 'ja'))

  return { rows, total, brands, generatedAt: new Date().toISOString() }
}
