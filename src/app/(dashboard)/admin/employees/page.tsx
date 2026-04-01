import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { EmployeeManager } from '@/components/admin/employee-manager'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'
import type { Role, Team, TeamMember } from '@/types/database'

export default async function EmployeesPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const supabase = await createClient()
  const db = createAdminClient()

  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  let effectiveRole: Role = currentEmployee.role

  if (viewAsId) {
    const { data: viewAsEmp } = await db
      .from('employees')
      .select('role')
      .eq('id', viewAsId)
      .single()
    if (viewAsEmp) effectiveRole = viewAsEmp.role as Role
  }

  const isSystemAdmin = ['admin', 'ops_manager', 'executive'].includes(effectiveRole)
  const isTeamManager = ['store_manager', 'manager'].includes(effectiveRole)
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
    db.from('employees').select('id, auth_user_id, name, name_kana, email, role, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, notifications_read_at, created_at, updated_at').order('created_at'),
    db.from('achievements').select('employee_id, skill_id').eq('status', 'certified'),
    db.from('work_hours').select('employee_id, hours'),
    // project_teams + team_members 経由で employee→project マッピング
    (async () => {
      const { getEmployeeProjectMapping } = await import('@/lib/project-members')
      return { data: await getEmployeeProjectMapping(db) }
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

  const certifiedByEmployee = (allCertified ?? []).reduce((acc, a) => {
    acc[a.employee_id] = (acc[a.employee_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const hoursByEmployee = (allWorkHours ?? []).reduce((acc, r) => {
    acc[r.employee_id] = (acc[r.employee_id] ?? 0) + r.hours
    return acc
  }, {} as Record<string, number>)

  // employee→project マッピングを事前構築
  const empFirstProject: Record<string, string> = {}
  for (const ep of allEmployeeProjects ?? []) {
    if (!empFirstProject[ep.employee_id]) empFirstProject[ep.employee_id] = ep.project_id
  }

  // project別のフェーズ・スキルを事前構築
  const allProjectPhasesArr = allProjectPhases ?? []
  const phasesByProject: Record<string, typeof allProjectPhasesArr> = {}
  for (const p of allProjectPhasesArr) {
    if (!phasesByProject[p.project_id]) phasesByProject[p.project_id] = []
    phasesByProject[p.project_id].push(p)
  }
  const allProjectSkillsArr = allProjectSkills ?? []
  const skillsByProject: Record<string, typeof allProjectSkillsArr> = {}
  for (const ps of allProjectSkillsArr) {
    if (!skillsByProject[ps.project_id]) skillsByProject[ps.project_id] = []
    skillsByProject[ps.project_id].push(ps)
  }

  // project別のmilestoneをキャッシュ
  const projectCache: Record<string, { milestones: ReturnType<typeof buildMilestoneMap>; totalSkills: number; skillsByPhase: Record<string, number> }> = {}
  function getProjectStats(projectId: string) {
    if (projectCache[projectId]) return projectCache[projectId]
    const phases = phasesByProject[projectId] ?? []
    const pSkills = skillsByProject[projectId] ?? []
    const phaseById = Object.fromEntries(phases.map(p => [p.id, p]))
    const sbp: Record<string, number> = {}
    for (const ps of pSkills) {
      const phase = phaseById[ps.project_phase_id ?? '']
      if (phase) sbp[phase.name] = (sbp[phase.name] ?? 0) + 1
    }
    const result = { milestones: buildMilestoneMap(phases), totalSkills: pSkills.length, skillsByPhase: sbp }
    projectCache[projectId] = result
    return result
  }

  // 社員ごとの最初の参加PJで標準進捗を計算
  const employeeStats: Record<string, { certifiedPct: number; standardPct: number }> = {}

  for (const emp of employees ?? []) {
    if (emp.role !== 'employee') continue

    const empProjectId = empFirstProject[emp.id] ?? null
    let totalSkills = 0
    let standardPct = 0

    if (empProjectId) {
      const stats = getProjectStats(empProjectId)
      totalSkills = stats.totalSkills
      standardPct = calcStandardPct(hoursByEmployee[emp.id] ?? 0, stats.milestones, stats.skillsByPhase, totalSkills)
    }

    const certifiedCount = certifiedByEmployee[emp.id] ?? 0
    employeeStats[emp.id] = {
      certifiedPct: totalSkills > 0 ? Math.round((certifiedCount / totalSkills) * 100) : 0,
      standardPct,
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

  return (
    <>
      <TopBar title="メンバー一覧" />
      <EmployeeManager
        employees={employees ?? []}
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
    </>
  )
}
