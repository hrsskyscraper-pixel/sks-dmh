import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar, AccountSettingsMenu } from '@/components/layout/nav'
import { EmployeeCareerCard } from '@/components/admin/employee-career-card'
import { SkillGrantSection } from '@/components/admin/skill-grant-dialog'
import { ColleaguesSection } from '@/components/admin/colleagues-section'
import { canAdminister, canApprove, isTrainingLeader } from '@/lib/permissions'
import { canViewEmail } from '@/lib/email-visibility'
import type { SystemPermission } from '@/types/database'

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ add?: string }> }) {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const { id } = await params
  const db = createAdminClient()

  // アクセス権限チェック
  const isFullAccess = canAdminister(currentEmployee)
  const isTeamAccess = isTrainingLeader(currentEmployee)
  const isSelfOnly = !isFullAccess && !isTeamAccess

  // 権限が無い相手でも redirect() せず、画面内で「権限がありません」を描画する。
  // soft-navigation 中の redirect() はクライアント例外（Application error）を
  // 引き起こすため、リダイレクトを使わない。
  let accessDenied = isSelfOnly && currentEmployee.id !== id

  // マネジャー・店長: 自チーム/プロジェクトのメンバーのみ
  if (isTeamAccess && currentEmployee.id !== id) {
    const { data: myTeams } = await db.from('team_managers').select('team_id').eq('employee_id', currentEmployee.id)
    const myTeamIds = (myTeams ?? []).map(t => t.team_id)

    const { data: teamMembersAccess } = myTeamIds.length > 0
      ? await db.from('team_members').select('employee_id').in('team_id', myTeamIds)
      : { data: [] }

    const accessibleIds = new Set([
      ...(teamMembersAccess ?? []).map(m => m.employee_id),
      currentEmployee.id,
    ])
    if (!accessibleIds.has(id)) accessDenied = true
  }

  if (accessDenied) {
    return (
      <>
        <TopBar title="メンバーキャリア" />
        <div className="px-6 py-16 text-center space-y-3">
          <p className="text-sm text-gray-500">このメンバーを閲覧する権限がありません。</p>
          <Link href="/" className="inline-block text-sm text-orange-600 hover:underline">ホームに戻る</Link>
        </div>
      </>
    )
  }

  const canEdit = isFullAccess || isTeamAccess

  const [
    { data: employee },
    { data: careerRecords },
    { data: allEmployees },
    { data: memberTeamRows },
    { data: allTeams },
    { data: goals },
    { data: certs },
  ] = await Promise.all([
    db.from('employees').select('id, name, last_name, first_name, name_kana, email, role, system_permission, business_role_ids, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, line_user_id').eq('id', id).single() as unknown as Promise<{ data: { id: string; name: string; last_name: string; first_name: string; name_kana: string | null; email: string; role: string; system_permission: SystemPermission; business_role_ids: string[]; employment_type: string; hire_date: string | null; birth_date: string | null; avatar_url: string | null; instagram_url: string | null; line_url: string | null; line_user_id: string | null } | null }>,
    db.from('career_records').select('*').eq('employee_id', id).order('occurred_at', { ascending: false }),
    db.from('employees').select('id, name, avatar_url').order('name'),
    db.from('team_members').select('team_id').eq('employee_id', id),
    db.from('teams').select('id, name, type, prefecture').order('name'),
    db.from('goals').select('id, content, deadline, set_at').eq('employee_id', id).order('created_at', { ascending: false }).limit(1),
    db.from('certifications').select('id, name, icon, color').eq('is_active', true).order('order_index'),
  ])
  const { data: businessRoles } = await db.from('business_roles').select('*').order('sort_order')

  // スキル付与用: 対象社員が所属するプロジェクト経由で付与可能スキル一覧を算出
  const { data: empProjectRows } = await db.from('employee_projects').select('project_id').eq('employee_id', id)
  const empProjectIds = (empProjectRows ?? []).map(r => r.project_id)
  // メンバー所属プロジェクトが空の場合は、team_members/team_managers → project_teams からも取得
  let fallbackProjectIds: string[] = []
  if (empProjectIds.length === 0) {
    const [{ data: teamMemRows }, { data: teamMgrRows }] = await Promise.all([
      db.from('team_members').select('team_id').eq('employee_id', id),
      db.from('team_managers').select('team_id').eq('employee_id', id),
    ])
    const teamIdsForEmp = [...new Set([...(teamMemRows ?? []).map(r => r.team_id), ...(teamMgrRows ?? []).map(r => r.team_id)])]
    if (teamIdsForEmp.length > 0) {
      const { data: pt } = await db.from('project_teams').select('project_id').in('team_id', teamIdsForEmp)
      fallbackProjectIds = [...new Set((pt ?? []).map(r => r.project_id))]
    }
  }
  const grantProjectIds = empProjectIds.length > 0 ? empProjectIds : fallbackProjectIds

  const [{ data: projectSkills }, { data: certifiedAch }, { data: projectPhases }] = grantProjectIds.length > 0
    ? await Promise.all([
        db.from('project_skills').select('skill_id, skills(id, name, phase, category, order_index)').in('project_id', grantProjectIds),
        db.from('achievements').select('id, skill_id, certified_at, certified_by, skills(name)').eq('employee_id', id).eq('status', 'certified'),
        db.from('project_phases').select('name, order_index, project_id').in('project_id', grantProjectIds).order('order_index'),
      ])
    : [{ data: [] as never[] }, { data: [] as Array<{ id: string; skill_id: string; certified_at: string | null; certified_by: string | null; skills: { name: string } | null }> }, { data: [] as Array<{ name: string; order_index: number; project_id: string }> }]

  // プロジェクトフェーズの順序（同名なら最小 order_index を採用）
  const phaseOrderMap = new Map<string, number>()
  for (const p of projectPhases ?? []) {
    const prev = phaseOrderMap.get(p.name)
    if (prev === undefined || p.order_index < prev) phaseOrderMap.set(p.name, p.order_index)
  }
  const phaseOrder = [...phaseOrderMap.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name)

  type SkillRow = { id: string; name: string; phase: string | null; category: string; order_index: number }
  const availableSkillsMap = new Map<string, SkillRow>()
  for (const ps of (projectSkills ?? []) as Array<{ skill_id: string; skills: SkillRow | SkillRow[] | null }>) {
    const sk = Array.isArray(ps.skills) ? ps.skills[0] : ps.skills
    if (sk) availableSkillsMap.set(sk.id, sk)
  }
  const availableSkills = [...availableSkillsMap.values()].sort((a, b) => a.order_index - b.order_index)
  type CertifiedAchRow = { id: string; skill_id: string; certified_at: string | null; certified_by: string | null; skills: { name: string } | { name: string }[] | null }
  const certifiedAchRows = (certifiedAch ?? []) as CertifiedAchRow[]
  const certifiedSkillIds = certifiedAchRows.map(r => r.skill_id)
  const certifierIds = [...new Set(certifiedAchRows.map(r => r.certified_by).filter((v): v is string => !!v))]
  const { data: certifierRows } = certifierIds.length > 0
    ? await db.from('employees').select('id, name').in('id', certifierIds)
    : { data: [] as { id: string; name: string }[] }
  const certifierNameMap = Object.fromEntries((certifierRows ?? []).map(r => [r.id, r.name]))
  const certifiedAchievements = certifiedAchRows.map(r => {
    const sk = Array.isArray(r.skills) ? r.skills[0] : r.skills
    return {
      achievementId: r.id,
      skillId: r.skill_id,
      skillName: sk?.name ?? '不明',
      certifiedAt: r.certified_at,
      certifierName: r.certified_by ? certifierNameMap[r.certified_by] ?? null : null,
    }
  })

  if (!employee) {
    return (
      <>
        <TopBar title="メンバーキャリア" />
        <div className="px-6 py-16 text-center space-y-3">
          <p className="text-sm text-gray-500">このメンバーは見つかりませんでした。</p>
          <Link href="/" className="inline-block text-sm text-orange-600 hover:underline">ホームに戻る</Link>
        </div>
      </>
    )
  }

  const employeeMap = Object.fromEntries((allEmployees ?? []).map(e => [e.id, e]))
  const memberTeamIds = (memberTeamRows ?? []).map(m => m.team_id)
  const isSelf = currentEmployee.id === id

  // メールアドレスは本人とシステム管理者にのみ表示（個人情報保護）。
  // リーダーが他メンバーを見るときは空文字にする。
  const employeeForCard = canViewEmail(currentEmployee, employee.id)
    ? employee
    : { ...employee, email: '' }

  return (
    <>
      <TopBar
        title="メンバーキャリア"
        right={isSelf ? (
          <AccountSettingsMenu
            employeeId={currentEmployee.id}
            employeeName={currentEmployee.name}
            role={currentEmployee.role}
            fontScale={currentEmployee.font_scale ?? undefined}
          />
        ) : undefined}
      />
      <EmployeeCareerCard
        employee={employeeForCard}
        careerRecords={careerRecords ?? []}
        employeeMap={employeeMap}
        allEmployees={allEmployees ?? []}
        canEdit={canEdit}
        isSelf={isSelf}
        canEditPermission={canAdminister(currentEmployee)}
        businessRoles={businessRoles ?? []}
        memberTeamIds={memberTeamIds}
        allTeams={(allTeams ?? []) as { id: string; name: string; type: 'store' | 'project' | 'department'; prefecture: string | null }[]}
        goal={(goals ?? [])[0] ?? null}
        certifications={(certs ?? []) as { id: string; name: string; icon: 'award' | 'star'; color: string }[]}
        autoAddType={(await (searchParams ?? Promise.resolve({})) as { add?: string })?.add ?? undefined}
      />
      <div className="px-4 pb-8 space-y-4">
        {canApprove(currentEmployee) && canEdit && (
          <SkillGrantSection
            employeeId={employee.id}
            employeeName={employee.name}
            availableSkills={availableSkills}
            certifiedSkillIds={certifiedSkillIds}
            certifiedAchievements={certifiedAchievements}
            phaseOrder={phaseOrder}
            canGrant={canApprove(currentEmployee)}
          />
        )}
        {/* Myキャリア（自分のページ）でのみ「仲間」カードを表示 */}
        {isSelf && <ColleaguesSection embedded />}
      </div>
    </>
  )
}
