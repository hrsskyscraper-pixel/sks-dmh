export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { getTestEmployeeIds } from '@/lib/test-data'
import { getEmployeeProjectMapping } from '@/lib/project-members'
import { getAllCertifiedAchievements } from '@/lib/certified-achievements'
import { TopBar } from '@/components/layout/nav'
import { EmployeeSearch, type SearchEmployee, type SearchOptions } from '@/components/dashboard/employee-search'

/**
 * 社員検索ページ。
 * 全ログインユーザーが利用可能。データはサーバーで一括取得し、
 * 絞り込みはすべてクライアント側で行う（約400名規模のため即時フィルタ）。
 */
export default async function SearchPage() {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')

  const db = createAdminClient()

  const [
    employees,
    testEmpIds,
    { data: storeTeamRows },
    { data: brandRows },
    { data: roleRows },
    { data: skillRows },
    projectMapping,
    certRows,
    { data: projectRows },
  ] = await Promise.all([
    // 承認済み社員のみ（ranking-data と同じ基準）
    fetchAllRows<{ id: string; name: string; name_kana: string | null; avatar_url: string | null; business_role_ids: string[] }>((from, to) =>
      db.from('employees').select('id, name, name_kana, avatar_url, business_role_ids').eq('status', 'approved').order('id').range(from, to)),
    getTestEmployeeIds(),
    db.from('teams').select('id, name, brand_id, is_test').eq('type', 'store').order('name'),
    db.from('brands').select('id, name, sort_order').order('sort_order'),
    db.from('business_roles').select('id, name, sort_order').order('sort_order'),
    db.from('skills').select('id, name, phase, order_index').order('order_index'),
    getEmployeeProjectMapping(),
    getAllCertifiedAchievements(),
    db.from('skill_projects').select('id, name, is_active'),
  ])

  // ---- 店舗（テスト店舗除外・ブランド別にグループ化）----
  const stores = (storeTeamRows ?? []).filter(t => !t.is_test)
  const storeIds = stores.map(t => t.id)
  const storeNameById = Object.fromEntries(stores.map(t => [t.id, t.name]))
  const storeIdSet = new Set(storeIds)

  const brandById = Object.fromEntries((brandRows ?? []).map(b => [b.id, b]))
  const storeGroups: SearchOptions['storeGroups'] = []
  {
    const byBrand = new Map<string, { label: string; sort: number; items: { id: string; name: string }[] }>()
    for (const t of stores) {
      const brand = t.brand_id ? brandById[t.brand_id] : null
      const key = brand?.id ?? '_other'
      if (!byBrand.has(key)) byBrand.set(key, { label: brand?.name ?? 'その他', sort: brand?.sort_order ?? Number.MAX_SAFE_INTEGER, items: [] })
      byBrand.get(key)!.items.push({ id: t.id, name: t.name })
    }
    for (const g of [...byBrand.values()].sort((a, b) => a.sort - b.sort)) {
      g.items.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
      storeGroups.push({ label: g.label, items: g.items })
    }
  }

  // ---- 店舗所属（メンバー or リーダーのどちらでも所属とみなす）----
  const [tmRows, tmgRows] = storeIds.length > 0
    ? await Promise.all([
        fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
          db.from('team_members').select('team_id, employee_id').in('team_id', storeIds).order('team_id').order('employee_id').range(from, to)),
        fetchAllRows<{ team_id: string; employee_id: string }>((from, to) =>
          db.from('team_managers').select('team_id, employee_id').in('team_id', storeIds).order('team_id').order('employee_id').range(from, to)),
      ])
    : [[], []]
  const storeIdsByEmp: Record<string, string[]> = {}
  for (const r of [...tmRows, ...tmgRows]) {
    if (!storeIdSet.has(r.team_id)) continue
    const list = (storeIdsByEmp[r.employee_id] ??= [])
    if (!list.includes(r.team_id)) list.push(r.team_id)
  }

  // ---- カリキュラム（所属マッピングに現れる有効カリキュラムのみを選択肢に）----
  const projectIdsByEmp: Record<string, string[]> = {}
  const mappedProjectIds = new Set<string>()
  for (const m of projectMapping) {
    ;(projectIdsByEmp[m.employee_id] ??= []).push(m.project_id)
    mappedProjectIds.add(m.project_id)
  }
  const projectOptions = (projectRows ?? [])
    .filter(p => p.is_active && mappedProjectIds.has(p.id))
    .map(p => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))

  // ---- スキル（フェーズ別にグループ化。skills は order_index 昇順で取得済み）----
  const skills = skillRows ?? []
  const skillIdxById: Record<string, number> = {}
  skills.forEach((s, i) => { skillIdxById[s.id] = i })
  const skillGroups: SearchOptions['skillGroups'] = []
  {
    const byPhase = new Map<string, { idx: number; name: string }[]>()
    for (const s of skills) {
      const phase = s.phase ?? 'その他'
      if (!byPhase.has(phase)) byPhase.set(phase, [])
      byPhase.get(phase)!.push({ idx: skillIdxById[s.id], name: s.name })
    }
    for (const [phase, items] of byPhase) skillGroups.push({ phase, items })
  }

  // ---- 認定済みスキル（社員ごとのスキル index 集合）----
  const certSkillIdxsByEmp: Record<string, Set<number>> = {}
  for (const c of certRows) {
    const idx = skillIdxById[c.skill_id]
    if (idx === undefined) continue
    ;(certSkillIdxsByEmp[c.employee_id] ??= new Set()).add(idx)
  }

  // ---- 検索対象社員（テスト社員除外）----
  const searchEmployees: SearchEmployee[] = employees
    .filter(e => !testEmpIds.has(e.id))
    .map(e => {
      const empStoreIds = storeIdsByEmp[e.id] ?? []
      return {
        id: e.id,
        name: e.name,
        kana: e.name_kana,
        avatarUrl: e.avatar_url,
        roleIds: e.business_role_ids ?? [],
        storeIds: empStoreIds,
        storeNames: empStoreIds.map(id => storeNameById[id]).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja')),
        projectIds: projectIdsByEmp[e.id] ?? [],
        certifiedSkillIdxs: [...(certSkillIdxsByEmp[e.id] ?? [])],
      }
    })
    .sort((a, b) => (a.kana ?? a.name).localeCompare(b.kana ?? b.name, 'ja'))

  const options: SearchOptions = {
    storeGroups,
    roles: (roleRows ?? []).map(r => ({ id: r.id, name: r.name })),
    projects: projectOptions,
    skillGroups,
  }

  return (
    <>
      <TopBar title="社員検索" />
      <EmployeeSearch employees={searchEmployees} options={options} />
    </>
  )
}
