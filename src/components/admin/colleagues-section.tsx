import { cookies } from 'next/headers'
import { Users2, ChevronDown } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { EmployeeManager } from '@/components/admin/employee-manager'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'
import type { Role, SystemPermission, Team, TeamMember } from '@/types/database'
import { canAdminister, isTrainingLeader } from '@/lib/permissions'

/**
 * 「仲間」一覧（旧 /admin/employees ページの中身）。
 *
 * - `embedded=false`（既定）: 従来通り単独ページとして TopBar 付きで描画。
 * - `embedded=true`: Myキャリアページ内のカードとして、折りたたみ可能な
 *   `<details>` で `EmployeeManager` を包んで描画する。
 *
 * 表示範囲（ロール別）:
 * - 運用管理者・役員・開発者（canAdminister）: 全ての仲間。
 * - それ以外: 自分が member または manager として所属するチームの仲間のみ。
 */
export async function ColleaguesSection({ embedded = false }: { embedded?: boolean }) {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) return null

  const db = createAdminClient()

  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  let effectiveRole: Role = currentEmployee.role
  let effectiveSystemPermission: SystemPermission | null | undefined = currentEmployee.system_permission

  if (viewAsId) {
    const { data: viewAsEmp } = await db
      .from('employees')
      .select('role, system_permission')
      .eq('id', viewAsId)
      .single()
    if (viewAsEmp) {
      effectiveRole = viewAsEmp.role as Role
      effectiveSystemPermission = viewAsEmp.system_permission as SystemPermission | null | undefined
    }
  }

  const effectiveEmp = { role: effectiveRole, system_permission: effectiveSystemPermission }
  const isSystemAdmin = canAdminister(effectiveEmp)
  const isTeamManager = isTrainingLeader(effectiveEmp)
  const canEdit = isSystemAdmin

  const [
    { data: employees },
    { data: allCertified },
    { data: allWorkHours },
    { data: allEmployeeProjects },
    { data: allProjectPhases },
    { data: allProjectSkills },
    { data: teams },
    { data: teamMembers },
    { data: careerRecordsRaw },
    { data: certMaster },
    { data: allTeamManagers },
    { data: projectTeamsData },
  ] = await Promise.all([
    db.from('employees').select('id, auth_user_id, name, last_name, first_name, name_kana, email, role, business_role_ids, system_permission, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, line_friend, approved_by, approved_at, notifications_read_at, font_scale, is_test, created_at, updated_at').order('created_at'),
    db.from('achievements').select('employee_id, skill_id').eq('status', 'certified'),
    db.from('work_hours').select('employee_id, hours'),
    // project_teams + team_members 経由で employee→project マッピング
    (async () => {
      const { getEmployeeProjectMapping } = await import('@/lib/project-members')
      return { data: await getEmployeeProjectMapping(db, { membersOnly: true }) }
    })(),
    db.from('project_phases').select('id, project_id, name, order_index, end_hours'),
    db.from('project_skills').select('project_id, skill_id, project_phase_id'),
    db.from('teams').select('id, name, type, prefecture').order('type').order('name'),
    db.from('team_members').select('team_id, employee_id'),
    db.from('career_records').select('employee_id, record_type, department, occurred_at').in('record_type', ['役職', '資格']).order('occurred_at', { ascending: false }),
    db.from('certifications').select('name, icon, color').eq('is_active', true),
    db.from('team_managers').select('team_id, employee_id, role'),
    db.from('project_teams').select('team_id'),
  ])

  // 各社員の最大プロジェクト進捗を計算
  const milestoneMap = buildMilestoneMap(allProjectPhases ?? [])
  const certifiedByEmp: Record<string, Set<string>> = {}
  for (const a of allCertified ?? []) {
    if (!certifiedByEmp[a.employee_id]) certifiedByEmp[a.employee_id] = new Set()
    certifiedByEmp[a.employee_id].add(a.skill_id)
  }

  const workHoursByEmp: Record<string, number> = {}
  for (const w of allWorkHours ?? []) {
    workHoursByEmp[w.employee_id] = (workHoursByEmp[w.employee_id] ?? 0) + Number(w.hours)
  }

  // 各社員ごとに「所属プロジェクトのうち最大の達成率」を採用
  const employeeStats: Record<string, { certifiedPct: number; standardPct: number }> = {}
  for (const emp of employees ?? []) {
    const empProjects = allEmployeeProjects?.[emp.id] ?? []
    let best: { certifiedCount: number; totalSkills: number; standardPct: number } | null = null
    for (const projectId of empProjects) {
      const phaseList = (allProjectPhases ?? []).filter(p => p.project_id === projectId)
      const phaseIds = new Set(phaseList.map(p => p.id))
      const projectSkillRows = (allProjectSkills ?? []).filter(ps => phaseIds.has(ps.project_id) || (ps.project_phase_id && phaseIds.has(ps.project_phase_id)))
      // skills that belong to this project
      const projectSkillIds = new Set(projectSkillRows.filter(ps => ps.project_id === projectId).map(ps => ps.skill_id))
      const certifiedForProject = certifiedByEmp[emp.id] ?? new Set()
      let certifiedCount = 0
      for (const sid of projectSkillIds) if (certifiedForProject.has(sid)) certifiedCount++
      const totalSkills = projectSkillIds.size
      const standardPct = calcStandardPct(milestoneMap, projectId, workHoursByEmp[emp.id] ?? 0)
      if (!best || (totalSkills > 0 && certifiedCount / totalSkills > best.certifiedCount / Math.max(1, best.totalSkills))) {
        best = { certifiedCount, totalSkills, standardPct }
      }
    }

    employeeStats[emp.id] = {
      certifiedPct: best && best.totalSkills > 0 ? Math.round((best.certifiedCount / best.totalSkills) * 100) : 0,
      standardPct: best?.standardPct ?? 0,
    }
  }

  // マネジャー/店長が管理するチームのメンバーID
  const effectiveEmployeeId = viewAsId ?? currentEmployee.id
  let managedMemberIds: string[] = []
  if (isTeamManager) {
    const { data: managed } = await db
      .from('team_managers')
      .select('team_id')
      .eq('employee_id', effectiveEmployeeId)
    const managedTeamIds = (managed ?? []).map(m => m.team_id)
    if (managedTeamIds.length > 0) {
      const members = (teamMembers as TeamMember[] ?? []).filter(m => managedTeamIds.includes(m.team_id))
      managedMemberIds = [...new Set(members.map(m => m.employee_id))]
    }
  }

  // 社員ごとの最新役職と社内資格を構築
  const positionByEmployee: Record<string, string> = {}
  const certsByEmployee: Record<string, string[]> = {}
  for (const r of careerRecordsRaw ?? []) {
    if (r.record_type === '役職' && r.department && !positionByEmployee[r.employee_id]) {
      positionByEmployee[r.employee_id] = r.department
    }
    if (r.record_type === '資格' && r.department?.startsWith('[社内]')) {
      if (!certsByEmployee[r.employee_id]) certsByEmployee[r.employee_id] = []
      const name = r.department.replace('[社内]', '')
      if (!certsByEmployee[r.employee_id].includes(name)) certsByEmployee[r.employee_id].push(name)
    }
  }

  // 表示範囲のフィルタ（ロール別）。
  // 管理系以外は、自分が member または manager として所属するチームの仲間のみに絞る。
  let visibleEmployees = employees ?? []
  if (!isSystemAdmin) {
    const myTeamIds = new Set<string>([
      ...(teamMembers ?? []).filter(m => m.employee_id === effectiveEmployeeId).map(m => m.team_id),
      ...(allTeamManagers ?? []).filter(m => m.employee_id === effectiveEmployeeId).map(m => m.team_id),
    ])
    const colleagueIds = new Set<string>([
      effectiveEmployeeId,
      ...(teamMembers ?? []).filter(m => myTeamIds.has(m.team_id)).map(m => m.employee_id),
      ...(allTeamManagers ?? []).filter(m => myTeamIds.has(m.team_id)).map(m => m.employee_id),
    ])
    visibleEmployees = visibleEmployees.filter(e => colleagueIds.has(e.id))
  }

  const manager = (
    <EmployeeManager
      employees={visibleEmployees}
      canEdit={canEdit}
      isTeamManager={isTeamManager}
      managedMemberIds={managedMemberIds}
      employeeStats={employeeStats}
      teams={teams as Team[] ?? []}
      teamMembers={teamMembers as TeamMember[] ?? []}
      positionByEmployee={positionByEmployee}
      certsByEmployee={certsByEmployee}
      certMaster={(certMaster ?? []) as { name: string; icon: string; color: string }[]}
      teamManagersList={(allTeamManagers ?? []) as { team_id: string; employee_id: string; role: string }[]}
      projectTeamIds={[...new Set((projectTeamsData ?? []).map(pt => pt.team_id))]}
      currentEmployeeId={effectiveEmployeeId}
    />
  )

  if (embedded) {
    return (
      <details open className="group bg-white border border-gray-200 rounded-lg overflow-hidden">
        <summary className="flex items-center gap-1.5 px-4 py-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-semibold text-gray-700">
          <Users2 className="w-4 h-4 text-gray-400" />
          仲間
          <ChevronDown className="w-4 h-4 text-gray-400 ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-gray-100">
          {manager}
        </div>
      </details>
    )
  }

  return (
    <>
      <TopBar title="メンバー一覧" />
      {manager}
    </>
  )
}
