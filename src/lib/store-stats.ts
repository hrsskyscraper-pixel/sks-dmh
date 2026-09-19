import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { getTestEmployeeIds, getTestTeamIds } from '@/lib/test-data'

/**
 * 店舗別スキル状況（/admin/store-stats）の集計。
 *
 * 用語の定義（画面の「数え方」パネルと必ず一致させること）:
 * - 対象従業員数 : その所属に「メンバー」として在籍する、承認済み・非テストの社員数。
 *                  リーダーはトリガ（sync_leader_as_member）でメンバー行も持つため含まれる。
 * - スキル申請人数: 対象従業員のうち、スキル申請を1件以上出したことがある人数
 *                  （承認待ち・認定済み・差し戻しのいずれかが1件でもある人）。
 * - 承認済み人数  : 対象従業員のうち、認定済み（certified）の申請を1件以上持つ人数。
 * - 未申請人数    : 対象従業員数 − スキル申請人数（一度も申請していない人数）。
 * - 未承認件数    : 対象従業員の申請のうち、承認待ち（pending）の「件数」。人数ではない。
 * - 停滞人数      : 対象従業員のうち、最後の動き（最終申請日。一度も申請していない人は登録日）から
 *                  STALLED_DAYS 日以上、申請が1件も無い人数。2026-09-19 のMTGで「停滞＝申請なし7日」と決定。
 *
 * 複数店舗に所属する社員は各店舗に計上されるため、店舗行の単純合計は全社合計と一致しない。
 * 全社合計は社員IDで重複排除して算出する。
 */

/** 停滞と判定する日数（最後の動きからの経過日数） */
export const STALLED_DAYS = 7

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
}

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
  members: StoreStatMember[]
}

export type StoreStatsTotal = {
  target: number
  applied: number
  certified: number
  notApplied: number
  pending: number
  stalled: number
}

export type StoreStats = {
  rows: StoreStatRow[]
  /** 社員IDで重複排除した全社合計 */
  total: StoreStatsTotal
  brands: string[]
  generatedAt: string
}

const NO_AFFILIATION_ID = '__none__'

export async function buildStoreStats(): Promise<StoreStats> {
  const db = createAdminClient()
  const [testEmpIds, testTeamIds] = await Promise.all([getTestEmployeeIds(), getTestTeamIds()])

  const [teamRows, brandRows, empRows, memberRows, achRows] = await Promise.all([
    db.from('teams').select('id, name, type, brand_id, is_test').in('type', ['store', 'department']),
    db.from('brands').select('id, name'),
    fetchAllRows<{ id: string; name: string; created_at: string }>((from, to) =>
      db.from('employees').select('id, name, created_at').eq('status', 'approved').order('id').range(from, to)),
    fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
      db.from('team_members').select('team_id, employee_id').order('team_id').order('employee_id').range(from, to)),
    fetchAllRows<{ employee_id: string; status: string; created_at: string }>((from, to) =>
      db.from('achievements').select('employee_id, status, created_at').order('id').range(from, to)),
  ])

  const brandNameById: Record<string, string> = Object.fromEntries((brandRows.data ?? []).map(b => [b.id, b.name]))
  const teams = ((teamRows.data ?? []) as { id: string; name: string; type: string; brand_id: string | null; is_test: boolean }[])
    .filter(t => !t.is_test && !testTeamIds.has(t.id))

  // 対象従業員（承認済み・非テスト）
  const targets = empRows.filter(e => !testEmpIds.has(e.id))
  const targetIds = new Set(targets.map(e => e.id))
  const nameById: Record<string, string> = Object.fromEntries(targets.map(e => [e.id, e.name]))
  const registeredAtById: Record<string, string> = Object.fromEntries(targets.map(e => [e.id, e.created_at]))
  const now = Date.now()

  // 社員ごとの申請状況
  type Counts = { applied: number; certified: number; pending: number; rejected: number; lastAppliedAt: string | null }
  const countsByEmp: Record<string, Counts> = {}
  for (const a of achRows) {
    if (!targetIds.has(a.employee_id)) continue
    const c = (countsByEmp[a.employee_id] ??= { applied: 0, certified: 0, pending: 0, rejected: 0, lastAppliedAt: null })
    c.applied++
    if (a.status === 'certified') c.certified++
    else if (a.status === 'pending') c.pending++
    else if (a.status === 'rejected') c.rejected++
    if (!c.lastAppliedAt || a.created_at > c.lastAppliedAt) c.lastAppliedAt = a.created_at
  }
  const countsOf = (id: string): Counts => countsByEmp[id] ?? { applied: 0, certified: 0, pending: 0, rejected: 0, lastAppliedAt: null }
  /** 最後の動き（最終申請。なければ登録）からの経過日数 */
  const stalledDaysOf = (id: string, lastAppliedAt: string | null): number => {
    const base = lastAppliedAt ?? registeredAtById[id]
    if (!base) return 0
    return Math.max(0, Math.floor((now - new Date(base).getTime()) / 86400000))
  }

  // 所属（店舗・部署）→ 対象従業員
  const teamIds = new Set(teams.map(t => t.id))
  const membersByTeam: Record<string, string[]> = {}
  const affiliated = new Set<string>()
  for (const r of memberRows) {
    if (!teamIds.has(r.team_id) || !targetIds.has(r.employee_id)) continue
    const list = (membersByTeam[r.team_id] ??= [])
    if (!list.includes(r.employee_id)) list.push(r.employee_id)
    affiliated.add(r.employee_id)
  }

  const buildMembers = (ids: string[]): StoreStatMember[] =>
    ids
      .map(id => {
        const c = countsOf(id)
        const stalledDays = stalledDaysOf(id, c.lastAppliedAt)
        return { id, name: nameById[id] ?? '', ...c, stalledDays, stalled: stalledDays >= STALLED_DAYS }
      })
      .sort((a, b) => a.applied - b.applied || b.stalledDays - a.stalledDays || b.pending - a.pending || a.name.localeCompare(b.name, 'ja'))

  const summarize = (id: string, name: string, type: StoreStatRow['type'], brandName: string | null, memberIds: string[]): StoreStatRow => {
    const members = buildMembers(memberIds)
    const applied = members.filter(m => m.applied > 0).length
    return {
      id,
      name,
      type,
      brandName,
      target: members.length,
      applied,
      certified: members.filter(m => m.certified > 0).length,
      notApplied: members.length - applied,
      pending: members.reduce((s, m) => s + m.pending, 0),
      stalled: members.filter(m => m.stalled).length,
      members,
    }
  }

  const rows: StoreStatRow[] = teams
    .map(t => summarize(
      t.id,
      t.name,
      t.type === 'department' ? 'department' : 'store',
      t.brand_id ? (brandNameById[t.brand_id] ?? null) : null,
      membersByTeam[t.id] ?? [],
    ))
    .sort((a, b) => (a.type === b.type ? 0 : a.type === 'store' ? -1 : 1) || a.name.localeCompare(b.name, 'ja'))

  // 店舗にも部署にも所属していない対象従業員（上長は正常。それ以外は所属設定漏れ）
  const orphanIds = targets.map(e => e.id).filter(id => !affiliated.has(id))
  if (orphanIds.length > 0) {
    rows.push(summarize(NO_AFFILIATION_ID, '所属なし', 'none', null, orphanIds))
  }

  // 全社合計（社員IDで重複排除）
  const allMembers = buildMembers(targets.map(e => e.id))
  const appliedTotal = allMembers.filter(m => m.applied > 0).length
  const total: StoreStatsTotal = {
    target: allMembers.length,
    applied: appliedTotal,
    certified: allMembers.filter(m => m.certified > 0).length,
    notApplied: allMembers.length - appliedTotal,
    pending: allMembers.reduce((s, m) => s + m.pending, 0),
    stalled: allMembers.filter(m => m.stalled).length,
  }

  const brands = [...new Set(rows.map(r => r.brandName).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b, 'ja'))

  return { rows, total, brands, generatedAt: new Date().toISOString() }
}
