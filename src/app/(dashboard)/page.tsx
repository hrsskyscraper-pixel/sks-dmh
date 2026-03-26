import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { TestUserGuide } from '@/components/testuser/test-user-guide'
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
    .select('id, name, email, role, employment_type, hire_date, avatar_url, auth_user_id, created_at, updated_at')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee) redirect('/login')

  const cookieStore = await cookies()
  const canViewAs = ['manager', 'admin', 'ops_manager', 'testuser'].includes(currentEmployee.role)
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  // testuser で view-as 未設定 → ガイド画面を表示
  if (currentEmployee.role === 'testuser' && !viewAsId) {
    const adminDb = createAdminClient()
    const { data: testEmployees } = await adminDb
      .from('employees')
      .select('id, name, role, employment_type')
      .neq('role', 'testuser')
      .order('name')
    return (
      <>
        <TopBar title="できました表" />
        <TestUserGuide employees={testEmployees ?? []} />
      </>
    )
  }

  // testuser はRLSを回避するため admin client でデータ取得
  const db = currentEmployee.role === 'testuser' ? createAdminClient() : supabase

  // targetEmployee と searchParams を並列取得
  const [targetEmployeeResult, params] = await Promise.all([
    viewAsId
      ? db.from('employees').select('id, name, email, role, employment_type, hire_date, avatar_url, auth_user_id, created_at, updated_at').eq('id', viewAsId).single()
      : Promise.resolve({ data: null }),
    searchParams ?? Promise.resolve(undefined),
  ])
  const employee = (targetEmployeeResult as { data: typeof currentEmployee | null }).data ?? currentEmployee

  // 参加プロジェクト一覧
  const { data: employeeProjectRows } = await db
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
          const { data: leaderTeamRows } = await db
            .from('team_managers').select('team_id').eq('employee_id', employee.id)
          const myTeamIds = (leaderTeamRows ?? []).map(r => r.team_id)
          if (!myTeamIds.length) return 0
          const { data: myMembers } = await db
            .from('team_members').select('employee_id').in('team_id', myTeamIds)
          const myMemberIds = (myMembers ?? []).map(r => r.employee_id)
          if (!myMemberIds.length) return 0
          const { count } = await db
            .from('achievements').select('*', { count: 'exact', head: true })
            .eq('status', 'pending').in('employee_id', myMemberIds)
          return count ?? 0
        })()
      : db.from('achievements').select('*', { count: 'exact', head: true })
          .eq('status', 'pending').then(r => r.count ?? 0)

    const teamRequestsCountP = ['admin', 'ops_manager'].includes(effectiveRole)
      ? db.from('team_change_requests').select('*', { count: 'exact', head: true })
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
      ? db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at').eq('project_id', selectedProject.id).order('order_index')
      : Promise.resolve({ data: [] }),
    selectedProject
      ? db.from('project_skills').select('skill_id, project_phase_id').eq('project_id', selectedProject.id)
      : Promise.resolve({ data: [] }),
    db.from('skills').select('id, name, phase, category, order_index, target_date_hint, created_at').order('order_index'),
    db.from('achievements').select('id, skill_id, employee_id, status, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement, notes, apply_comment, certify_comment, is_read, created_at, skills(id, name, phase, category, order_index, target_date_hint, created_at)').eq('employee_id', employee.id),
    db.from('employees').select('id, name, avatar_url, employment_type, hire_date').eq('role', 'employee').order('name'),
    db.from('achievements').select('employee_id, skill_id').eq('status', 'certified'),
    db.from('work_hours').select('employee_id, hours'),
    db.from('employee_projects').select('employee_id, project_id'),
    db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at'),
    db.from('project_skills').select('project_id, skill_id, project_phase_id'),
    db.from('teams').select('id, name, type'),
    db.from('team_members').select('employee_id, team_id'),
    db.rpc('get_employee_cumulative_hours', {
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

  // employee→project マッピングを事前構築（O(n)）
  const empFirstProject: Record<string, string> = {}
  for (const ep of allEmployeeProjects ?? []) {
    if (!empFirstProject[ep.employee_id]) empFirstProject[ep.employee_id] = ep.project_id
  }

  // certified を employee+skill でインデックス化（O(n)）
  const certifiedSet = new Set(
    (allCertified ?? []).map(a => `${a.employee_id}:${a.skill_id}`)
  )

  // project別のフェーズ・スキルを事前構築（O(n)）
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

  // project別のmilestone/skillsByPhaseをキャッシュ
  const projectCache: Record<string, { milestones: ReturnType<typeof buildMilestoneMap>; totalSkills: number; skillsByPhase: Record<string, number> }> = {}
  function getProjectStats(projectId: string) {
    if (projectCache[projectId]) return projectCache[projectId]
    const empPhases = phasesByProject[projectId] ?? []
    const empProjectSkills = skillsByProject[projectId] ?? []
    const phaseById = Object.fromEntries(empPhases.map(p => [p.id, p]))
    const sbp: Record<string, number> = {}
    for (const ps of empProjectSkills) {
      const phase = phaseById[ps.project_phase_id ?? '']
      if (phase) sbp[phase.name] = (sbp[phase.name] ?? 0) + 1
    }
    const result = { milestones: buildMilestoneMap(empPhases), totalSkills: empProjectSkills.length, skillsByPhase: sbp }
    projectCache[projectId] = result
    return result
  }

  const teamStats = (allEmployees ?? []).map(emp => {
    const firstProjectId = empFirstProject[emp.id] ?? null
    const empSkillIdSet = firstProjectId ? (projectSkillIdMap[firstProjectId] ?? new Set<string>()) : new Set<string>()
    let empCertifiedCount = 0
    for (const skillId of empSkillIdSet) {
      if (certifiedSet.has(`${emp.id}:${skillId}`)) empCertifiedCount++
    }

    if (!firstProjectId) {
      return {
        id: emp.id, name: emp.name, avatar_url: emp.avatar_url,
        employment_type: emp.employment_type, hire_date: emp.hire_date,
        store_name: storeByEmployee[emp.id] ?? null,
        certifiedCount: empCertifiedCount, totalSkills: 0, standardPct: 0,
      }
    }

    const stats = firstProjectId === selectedProject?.id
      ? { milestones, totalSkills, skillsByPhase }
      : getProjectStats(firstProjectId)

    return {
      id: emp.id, name: emp.name, avatar_url: emp.avatar_url,
      employment_type: emp.employment_type, hire_date: emp.hire_date,
      store_name: storeByEmployee[emp.id] ?? null,
      certifiedCount: empCertifiedCount, totalSkills: stats.totalSkills,
      standardPct: calcStandardPct(hoursByEmployee[emp.id] ?? 0, stats.milestones, stats.skillsByPhase, stats.totalSkills),
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
