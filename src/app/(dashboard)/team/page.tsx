import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { TeamDashboard } from '@/components/dashboard/team-dashboard'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'

export default async function TeamPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee || !['store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'].includes(currentEmployee.role)) {
    redirect('/')
  }

  const supabase = await createClient()
  const db = currentEmployee.role === 'testuser' ? createAdminClient() : supabase

  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  let effectiveEmployeeId = currentEmployee.id
  if (viewAsId) {
    const { data: viewAsEmp } = await db
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
    db.from('employees').select('id, auth_user_id, name, email, role, employment_type, hire_date, avatar_url, instagram_url, notifications_read_at, created_at, updated_at').order('hire_date'),
    db.from('skills').select('id, name, phase, category, order_index, target_date_hint, standard_hours, created_at'),
    db.from('achievements')
      .select('id, status, employee_id, skill_id, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement, notes, apply_comment, certify_comment, is_read, created_at, skills(id, name, phase, category, order_index, target_date_hint, standard_hours, created_at), employees!achievements_employee_id_fkey(id, auth_user_id, name, email, role, employment_type, hire_date, avatar_url, instagram_url, notifications_read_at, created_at, updated_at)')
      .order('created_at', { ascending: false }),
    db.from('team_managers').select('team_id').eq('employee_id', effectiveEmployeeId),
    db.from('work_hours').select('employee_id, hours'),
    db.from('employee_projects').select('employee_id, project_id'),
    db.from('project_phases').select('id, project_id, name, order_index, end_hours'),
    db.from('project_skills').select('project_id, skill_id, project_phase_id'),
    db.from('teams').select('id, name, type'),
    db.from('team_members').select('employee_id, team_id'),
  ])

  const myTeamIds = (leaderTeamRows ?? []).map(r => r.team_id)

  let priorityMemberIds = new Set<string>()
  let managedTeams: { id: string; name: string }[] = []
  let managedTeamMembers: { team_id: string; employee_id: string }[] = []

  if (myTeamIds.length > 0) {
    const [{ data: teamsData }, { data: membersData }] = await Promise.all([
      db.from('teams').select('id, name').in('id', myTeamIds).order('name'),
      db.from('team_members').select('team_id, employee_id').in('team_id', myTeamIds),
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
  const pSkillsByProject: Record<string, typeof allProjectSkillsArr> = {}
  for (const ps of allProjectSkillsArr) {
    if (!pSkillsByProject[ps.project_id]) pSkillsByProject[ps.project_id] = []
    pSkillsByProject[ps.project_id].push(ps)
  }

  const projectCache: Record<string, { milestones: ReturnType<typeof buildMilestoneMap>; totalSkills: number; skillsByPhase: Record<string, number> }> = {}
  function getProjectStats(projectId: string) {
    if (projectCache[projectId]) return projectCache[projectId]
    const phases = phasesByProject[projectId] ?? []
    const skills = pSkillsByProject[projectId] ?? []
    const phaseById = Object.fromEntries(phases.map(p => [p.id, p]))
    const sbp: Record<string, number> = {}
    for (const ps of skills) {
      const phase = phaseById[ps.project_phase_id ?? '']
      if (phase) sbp[phase.name] = (sbp[phase.name] ?? 0) + 1
    }
    const result = { milestones: buildMilestoneMap(phases), totalSkills: skills.length, skillsByPhase: sbp }
    projectCache[projectId] = result
    return result
  }

  const empStatsMap: Record<string, { standardPct: number; totalSkills: number; storeName: string | null }> = {}
  for (const emp of employees ?? []) {
    const firstProjectId = empFirstProject[emp.id] ?? null
    let standardPct = 0
    let totalSkills = 0
    if (firstProjectId) {
      const stats = getProjectStats(firstProjectId)
      totalSkills = stats.totalSkills
      standardPct = calcStandardPct(hoursByEmployee[emp.id] ?? 0, stats.milestones, stats.skillsByPhase, totalSkills)
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
