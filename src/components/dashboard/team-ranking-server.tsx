import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TeamRanking } from '@/components/dashboard/team-ranking'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'
import type { TeamMemberStat } from '@/components/dashboard/team-ranking'

interface Props {
  employeeId: string
  employeeRole: string
  selectedProjectId: string | null
}

export async function TeamRankingServer({ employeeId, employeeRole, selectedProjectId }: Props) {
  const db = employeeRole === 'testuser' ? createAdminClient() : await createClient()

  const [
    { data: allEmployees },
    { data: allCertified },
    { data: allWorkHours },
    { data: allEmployeeProjects },
    { data: allProjectPhases },
    { data: allProjectSkills },
    { data: allTeams },
    { data: allTeamMembers },
  ] = await Promise.all([
    db.from('employees').select('id, name, avatar_url, employment_type, hire_date').eq('role', 'employee').order('name'),
    db.from('achievements').select('employee_id, skill_id').eq('status', 'certified'),
    db.from('work_hours').select('employee_id, hours'),
    db.from('employee_projects').select('employee_id, project_id'),
    db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at'),
    db.from('project_skills').select('project_id, skill_id, project_phase_id'),
    db.from('teams').select('id, name, type'),
    db.from('team_members').select('employee_id, team_id'),
  ])

  // store名マッピング
  const storeTeams = (allTeams ?? []).filter(t => t.type === 'store')
  const storeTeamIds = new Set(storeTeams.map(t => t.id))
  const storeTeamById = Object.fromEntries(storeTeams.map(t => [t.id, t.name]))
  const storeByEmployee: Record<string, string> = {}
  for (const m of allTeamMembers ?? []) {
    if (storeTeamIds.has(m.team_id)) storeByEmployee[m.employee_id] = storeTeamById[m.team_id]
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

  const empFirstProject: Record<string, string> = {}
  for (const ep of allEmployeeProjects ?? []) {
    if (!empFirstProject[ep.employee_id]) empFirstProject[ep.employee_id] = ep.project_id
  }

  const certifiedSet = new Set(
    (allCertified ?? []).map(a => `${a.employee_id}:${a.skill_id}`)
  )

  // project別キャッシュ
  const allPhasesArr = allProjectPhases ?? []
  const phasesByProject: Record<string, typeof allPhasesArr> = {}
  for (const p of allPhasesArr) {
    if (!phasesByProject[p.project_id]) phasesByProject[p.project_id] = []
    phasesByProject[p.project_id].push(p)
  }
  const allSkillsArr = allProjectSkills ?? []
  const skillsByProject: Record<string, typeof allSkillsArr> = {}
  for (const ps of allSkillsArr) {
    if (!skillsByProject[ps.project_id]) skillsByProject[ps.project_id] = []
    skillsByProject[ps.project_id].push(ps)
  }

  const projectCache: Record<string, { milestones: ReturnType<typeof buildMilestoneMap>; totalSkills: number; skillsByPhase: Record<string, number> }> = {}
  function getProjectStats(projectId: string) {
    if (projectCache[projectId]) return projectCache[projectId]
    const phases = phasesByProject[projectId] ?? []
    const skills = skillsByProject[projectId] ?? []
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

  const teamStats: TeamMemberStat[] = (allEmployees ?? []).map(emp => {
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

    const stats = getProjectStats(firstProjectId)
    return {
      id: emp.id, name: emp.name, avatar_url: emp.avatar_url,
      employment_type: emp.employment_type, hire_date: emp.hire_date,
      store_name: storeByEmployee[emp.id] ?? null,
      certifiedCount: empCertifiedCount, totalSkills: stats.totalSkills,
      standardPct: calcStandardPct(hoursByEmployee[emp.id] ?? 0, stats.milestones, stats.skillsByPhase, stats.totalSkills),
    }
  })

  return <TeamRanking currentEmployeeId={employeeId} stats={teamStats} />
}
