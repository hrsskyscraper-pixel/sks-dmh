import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { TeamDashboard } from '@/components/dashboard/team-dashboard'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'

export default async function TeamPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee || !['manager', 'admin', 'ops_manager', 'testuser'].includes(currentEmployee.role)) {
    redirect('/')
  }

  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  let effectiveEmployeeId = currentEmployee.id
  if (viewAsId) {
    const { data: viewAsEmp } = await supabase
      .from('employees')
      .select('id')
      .eq('id', viewAsId)
      .single()
    if (viewAsEmp) effectiveEmployeeId = viewAsEmp.id
  }

  // effectiveEmployeeId 確定後の全クエリを並列実行
  const [
    { data: employees },
    { data: skills },
    { data: achievements },
    { data: leaderTeamRows },
    { data: allWorkHours },
    { data: allEmployeeProjects },
    { data: allProjectPhases },
    { data: allProjectSkills },
    { data: allTeams },
    { data: allTeamMembersForStore },
  ] = await Promise.all([
    supabase.from('employees').select('*').order('hire_date'),
    supabase.from('skills').select('*'),
    supabase.from('achievements')
      .select('*, skills(*), employees!achievements_employee_id_fkey(*)')
      .order('created_at', { ascending: false }),
    supabase.from('team_managers').select('team_id').eq('employee_id', effectiveEmployeeId),
    supabase.from('work_hours').select('employee_id, hours'),
    supabase.from('employee_projects').select('employee_id, project_id'),
    supabase.from('project_phases').select('*'),
    supabase.from('project_skills').select('project_id, skill_id, project_phase_id'),
    supabase.from('teams').select('id, name, type'),
    supabase.from('team_members').select('employee_id, team_id'),
  ])

  const myTeamIds = (leaderTeamRows ?? []).map(r => r.team_id)

  let priorityMemberIds = new Set<string>()
  let managedTeams: { id: string; name: string }[] = []
  let managedTeamMembers: { team_id: string; employee_id: string }[] = []

  if (myTeamIds.length > 0) {
    const [{ data: teamsData }, { data: membersData }] = await Promise.all([
      supabase.from('teams').select('id, name').in('id', myTeamIds).order('name'),
      supabase.from('team_members').select('team_id, employee_id').in('team_id', myTeamIds),
    ])
    managedTeams = teamsData ?? []
    managedTeamMembers = membersData ?? []
    priorityMemberIds = new Set((membersData ?? []).map(r => r.employee_id))
  }

  const hoursByEmployee = (allWorkHours ?? []).reduce((acc: Record<string, number>, r) => {
    acc[r.employee_id] = (acc[r.employee_id] ?? 0) + r.hours
    return acc
  }, {})

  const storeTeams = (allTeams ?? []).filter(t => t.type === 'store')
  const storeTeamIds = new Set(storeTeams.map(t => t.id))
  const storeTeamById = Object.fromEntries(storeTeams.map(t => [t.id, t.name]))
  const storeByEmployee: Record<string, string> = {}
  for (const m of allTeamMembersForStore ?? []) {
    if (storeTeamIds.has(m.team_id)) {
      storeByEmployee[m.employee_id] = storeTeamById[m.team_id]
    }
  }

  const empStatsMap: Record<string, { standardPct: number; totalSkills: number; storeName: string | null }> = {}
  for (const emp of employees ?? []) {
    const empProjectIds = (allEmployeeProjects ?? [])
      .filter(ep => ep.employee_id === emp.id)
      .map(ep => ep.project_id)
    const firstProjectId = empProjectIds[0] ?? null
    let standardPct = 0
    let totalSkills = 0
    if (firstProjectId) {
      const empPhases = (allProjectPhases ?? []).filter(p => p.project_id === firstProjectId)
      const empProjectSkills = (allProjectSkills ?? []).filter(ps => ps.project_id === firstProjectId)
      totalSkills = empProjectSkills.length
      const skillsByPhase: Record<string, number> = {}
      for (const ps of empProjectSkills) {
        const phase = empPhases.find(p => p.id === ps.project_phase_id)
        if (phase) skillsByPhase[phase.name] = (skillsByPhase[phase.name] ?? 0) + 1
      }
      standardPct = calcStandardPct(hoursByEmployee[emp.id] ?? 0, buildMilestoneMap(empPhases), skillsByPhase, totalSkills)
    }
    empStatsMap[emp.id] = { standardPct, totalSkills, storeName: storeByEmployee[emp.id] ?? null }
  }

  // 担当チームのメンバーの pending のみに絞る（他チームの申請はリーダーに見せない）
  const filteredAchievements = (achievements ?? []).filter(
    a => a.status !== 'pending' || priorityMemberIds.has(a.employee_id)
  )

  return (
    <>
      <TopBar title="スキル認定" />
      <TeamDashboard
        currentEmployee={currentEmployee}
        employees={employees ?? []}
        skills={skills ?? []}
        achievements={filteredAchievements}
        priorityMemberIds={priorityMemberIds}
        managedTeams={managedTeams}
        managedTeamMembers={managedTeamMembers}
        empStatsMap={empStatsMap}
      />
    </>
  )
}
