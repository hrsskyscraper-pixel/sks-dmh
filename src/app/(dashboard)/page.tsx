import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ project_id?: string }>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee) redirect('/login')

  const cookieStore = await cookies()
  const canViewAs = ['manager', 'admin', 'ops_manager'].includes(currentEmployee.role)
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  // targetEmployee と searchParams を並列取得
  const [targetEmployeeResult, params] = await Promise.all([
    viewAsId
      ? supabase.from('employees').select('*').eq('id', viewAsId).single()
      : Promise.resolve({ data: null }),
    searchParams ?? Promise.resolve(undefined),
  ])
  const employee = (targetEmployeeResult as { data: typeof currentEmployee | null }).data ?? currentEmployee

  // 参加プロジェクト一覧
  const { data: employeeProjectRows } = await supabase
    .from('employee_projects')
    .select('project_id, skill_projects(id, name, is_active)')
    .eq('employee_id', employee.id)

  const employeeProjects = (employeeProjectRows ?? [])
    .map(r => r.skill_projects)
    .filter((p): p is NonNullable<typeof p> => p !== null && (p as { is_active: boolean }).is_active)

  const requestedProjectId = (params as { project_id?: string } | undefined)?.project_id
  const selectedProject = employeeProjects.find(p => p.id === requestedProjectId)
    ?? employeeProjects[0]
    ?? null

  const effectiveRole = employee.role

  // pending件数（manager は内部で直列クエリが必要なため async IIFE で並列起動）
  const pendingCountsTask = (async (): Promise<{ pendingAchievementsCount: number; pendingTeamRequestsCount: number }> => {
    if (!['manager', 'admin', 'ops_manager'].includes(effectiveRole)) {
      return { pendingAchievementsCount: 0, pendingTeamRequestsCount: 0 }
    }
    const achievementsCountP = effectiveRole === 'manager'
      ? (async () => {
          const { data: leaderTeamRows } = await supabase
            .from('team_managers').select('team_id').eq('employee_id', employee.id)
          const myTeamIds = (leaderTeamRows ?? []).map(r => r.team_id)
          if (!myTeamIds.length) return 0
          const { data: myMembers } = await supabase
            .from('team_members').select('employee_id').in('team_id', myTeamIds)
          const myMemberIds = (myMembers ?? []).map(r => r.employee_id)
          if (!myMemberIds.length) return 0
          const { count } = await supabase
            .from('achievements').select('*', { count: 'exact', head: true })
            .eq('status', 'pending').in('employee_id', myMemberIds)
          return count ?? 0
        })()
      : supabase.from('achievements').select('*', { count: 'exact', head: true })
          .eq('status', 'pending').then(r => r.count ?? 0)

    const teamRequestsCountP = ['admin', 'ops_manager'].includes(effectiveRole)
      ? supabase.from('team_change_requests').select('*', { count: 'exact', head: true })
          .eq('status', 'pending').then(r => r.count ?? 0)
      : Promise.resolve(0)

    const [pendingAchievementsCount, pendingTeamRequestsCount] = await Promise.all([
      achievementsCountP,
      teamRequestsCountP,
    ])
    return { pendingAchievementsCount, pendingTeamRequestsCount }
  })()

  // selectedProject 確定後の全クエリを並列実行
  const [
    projectPhasesResult,
    projectSkillsResult,
    { data: allSkills },
    { data: achievements },
    { data: allEmployees },
    { data: allCertified },
    { data: allWorkHours },
    { data: allEmployeeProjects },
    { data: allProjectPhases },
    { data: allProjectSkills },
    { data: allTeams },
    { data: allTeamMembersForStore },
    workHoursSumResult,
    { pendingAchievementsCount, pendingTeamRequestsCount },
  ] = await Promise.all([
    selectedProject
      ? supabase.from('project_phases').select('*').eq('project_id', selectedProject.id).order('order_index')
      : Promise.resolve({ data: [] }),
    selectedProject
      ? supabase.from('project_skills').select('skill_id, project_phase_id').eq('project_id', selectedProject.id)
      : Promise.resolve({ data: [] }),
    supabase.from('skills').select('*').order('order_index'),
    supabase.from('achievements').select('*, skills(*)').eq('employee_id', employee.id),
    supabase.from('employees').select('id, name, avatar_url, employment_type, hire_date').eq('role', 'employee').order('name'),
    supabase.from('achievements').select('employee_id, skill_id').eq('status', 'certified'),
    supabase.from('work_hours').select('employee_id, hours'),
    supabase.from('employee_projects').select('employee_id, project_id'),
    supabase.from('project_phases').select('*'),
    supabase.from('project_skills').select('project_id, skill_id, project_phase_id'),
    supabase.from('teams').select('id, name, type'),
    supabase.from('team_members').select('employee_id, team_id'),
    supabase.rpc('get_employee_cumulative_hours', {
      p_employee_id: employee.id,
      p_as_of_date: new Date().toISOString().split('T')[0],
    }),
    pendingCountsTask,
  ])

  const projectPhaseRows = (projectPhasesResult as { data: typeof allProjectPhases }).data ?? []
  const projectSkillRows = (projectSkillsResult as { data: typeof allProjectSkills }).data ?? []
  const workHoursSum = (workHoursSumResult as { data: number | null }).data ?? 0

  // unreadNotifications は achievements から生成（別クエリ不要）
  const unreadNotifications = viewAsId
    ? []
    : (achievements ?? []).filter(a => !a.is_read && ['certified', 'rejected'].includes(a.status))

  // skillPhaseMap
  const skillPhaseMap: Record<string, string | null> = {}
  for (const ps of projectSkillRows ?? []) {
    skillPhaseMap[ps.skill_id] = ps.project_phase_id
  }

  const projectSkillIds = new Set(Object.keys(skillPhaseMap))
  const skills = (allSkills ?? []).filter(s => projectSkillIds.has(s.id))

  const projectPhases = projectPhaseRows ?? []
  const milestones = buildMilestoneMap(projectPhases)

  const skillsByPhase: Record<string, number> = {}
  for (const s of skills) {
    const phaseId = skillPhaseMap[s.id]
    const phase = projectPhases.find(p => p.id === phaseId)
    if (phase) {
      skillsByPhase[phase.name] = (skillsByPhase[phase.name] ?? 0) + 1
    }
  }

  const totalSkills = skills.length

  const storeTeams = (allTeams ?? []).filter(t => t.type === 'store')
  const storeTeamIds = new Set(storeTeams.map(t => t.id))
  const storeTeamById = Object.fromEntries(storeTeams.map(t => [t.id, t.name]))
  const storeByEmployee: Record<string, string> = {}
  for (const m of allTeamMembersForStore ?? []) {
    if (storeTeamIds.has(m.team_id)) {
      storeByEmployee[m.employee_id] = storeTeamById[m.team_id]
    }
  }

  const hoursByEmployee = (allWorkHours ?? []).reduce((acc, r) => {
    acc[r.employee_id] = (acc[r.employee_id] ?? 0) + r.hours
    return acc
  }, {} as Record<string, number>)

  const projectSkillIdMap: Record<string, Set<string>> = {}
  for (const ps of allProjectSkills ?? []) {
    if (!projectSkillIdMap[ps.project_id]) projectSkillIdMap[ps.project_id] = new Set()
    projectSkillIdMap[ps.project_id].add(ps.skill_id)
  }

  const teamStats = (allEmployees ?? []).map(emp => {
    const empProjectIds = (allEmployeeProjects ?? [])
      .filter(ep => ep.employee_id === emp.id)
      .map(ep => ep.project_id)

    const firstProjectId = empProjectIds[0] ?? null
    const empSkillIdSet = firstProjectId ? (projectSkillIdMap[firstProjectId] ?? new Set<string>()) : new Set<string>()
    const empCertifiedCount = (allCertified ?? [])
      .filter(a => a.employee_id === emp.id && empSkillIdSet.has(a.skill_id))
      .length

    if (!firstProjectId) {
      return {
        id: emp.id,
        name: emp.name,
        avatar_url: emp.avatar_url,
        employment_type: emp.employment_type,
        hire_date: emp.hire_date,
        store_name: storeByEmployee[emp.id] ?? null,
        certifiedCount: empCertifiedCount,
        totalSkills: 0,
        standardPct: 0,
      }
    }

    let empMilestones = milestones
    let empTotalSkills = totalSkills
    let empSkillsByPhase = skillsByPhase

    if (firstProjectId !== selectedProject?.id) {
      const empPhases = (allProjectPhases ?? []).filter(p => p.project_id === firstProjectId)
      const empProjectSkills = (allProjectSkills ?? []).filter(ps => ps.project_id === firstProjectId)
      empMilestones = buildMilestoneMap(empPhases)
      empTotalSkills = empProjectSkills.length
      empSkillsByPhase = {}
      for (const ps of empProjectSkills) {
        const phase = empPhases.find(p => p.id === ps.project_phase_id)
        if (phase) {
          empSkillsByPhase[phase.name] = (empSkillsByPhase[phase.name] ?? 0) + 1
        }
      }
    }

    const empHours = hoursByEmployee[emp.id] ?? 0
    return {
      id: emp.id,
      name: emp.name,
      avatar_url: emp.avatar_url,
      employment_type: emp.employment_type,
      hire_date: emp.hire_date,
      store_name: storeByEmployee[emp.id] ?? null,
      certifiedCount: empCertifiedCount,
      totalSkills: empTotalSkills,
      standardPct: calcStandardPct(empHours, empMilestones, empSkillsByPhase, empTotalSkills),
    }
  })

  const lastPhase = projectPhases[projectPhases.length - 1]
  const standardEndHours = lastPhase?.end_hours ?? 0

  return (
    <>
      <TopBar
        title="できました表"
        right={
          <div className="flex items-end gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">標準完了</p>
              <p className="text-base font-bold text-gray-400">{standardEndHours}h</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">8h換算</p>
              <p className="text-base font-bold text-gray-400">{Math.floor(standardEndHours / 8)}日</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">累計勤務</p>
              <p className="text-base font-bold text-orange-500">{workHoursSum}h</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">8h換算</p>
              <p className="text-base font-bold text-gray-600">{Math.floor(workHoursSum / 8)}日</p>
            </div>
          </div>
        }
      />
      <DashboardContent
        employee={employee}
        skills={skills}
        achievements={achievements ?? []}
        cumulativeHours={workHoursSum}
        milestones={milestones}
        projectPhases={projectPhases}
        skillPhaseMap={skillPhaseMap}
        currentProject={selectedProject}
        employeeProjects={employeeProjects as { id: string; name: string; is_active: boolean }[]}
        teamStats={teamStats}
        unreadNotifications={unreadNotifications}
        pendingAchievementsCount={pendingAchievementsCount}
        pendingTeamRequestsCount={pendingTeamRequestsCount}
      />
    </>
  )
}
