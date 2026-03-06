import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { EmployeeManager } from '@/components/admin/employee-manager'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'
import type { Role, Team, TeamMember } from '@/types/database'

export default async function EmployeesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee) redirect('/login')

  const db = currentEmployee.role === 'testuser' ? createAdminClient() : supabase

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

  const canEdit = ['admin', 'ops_manager'].includes(effectiveRole)

  const [
    { data: employees },
    { data: allCertified },
    { data: allWorkHours },
    { data: allEmployeeProjects },
    { data: allProjectPhases },
    { data: allProjectSkills },
    { data: teams },
    { data: teamMembers },
  ] = await Promise.all([
    db.from('employees').select('*').order('created_at'),
    db.from('achievements').select('employee_id, skill_id').eq('status', 'certified'),
    db.from('work_hours').select('employee_id, hours'),
    db.from('employee_projects').select('employee_id, project_id'),
    db.from('project_phases').select('*'),
    db.from('project_skills').select('project_id, skill_id, project_phase_id'),
    db.from('teams').select('*').order('type').order('name'),
    db.from('team_members').select('team_id, employee_id'),
  ])

  const certifiedByEmployee = (allCertified ?? []).reduce((acc, a) => {
    acc[a.employee_id] = (acc[a.employee_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const hoursByEmployee = (allWorkHours ?? []).reduce((acc, r) => {
    acc[r.employee_id] = (acc[r.employee_id] ?? 0) + r.hours
    return acc
  }, {} as Record<string, number>)

  // 社員ごとの最初の参加PJで標準進捗を計算
  const employeeStats: Record<string, { certifiedPct: number; standardPct: number }> = {}

  for (const emp of employees ?? []) {
    if (emp.role !== 'employee') continue

    const empProjectId = (allEmployeeProjects ?? [])
      .find(ep => ep.employee_id === emp.id)?.project_id ?? null

    let totalSkills = 0
    let standardPct = 0

    if (empProjectId) {
      const empPhases = (allProjectPhases ?? []).filter(p => p.project_id === empProjectId)
      const empProjectSkills = (allProjectSkills ?? []).filter(ps => ps.project_id === empProjectId)
      totalSkills = empProjectSkills.length

      const empMilestones = buildMilestoneMap(empPhases)
      const empSkillsByPhase: Record<string, number> = {}
      for (const ps of empProjectSkills) {
        const phase = empPhases.find(p => p.id === ps.project_phase_id)
        if (phase) {
          empSkillsByPhase[phase.name] = (empSkillsByPhase[phase.name] ?? 0) + 1
        }
      }

      const empHours = hoursByEmployee[emp.id] ?? 0
      standardPct = calcStandardPct(empHours, empMilestones, empSkillsByPhase, totalSkills)
    }

    const certifiedCount = certifiedByEmployee[emp.id] ?? 0
    employeeStats[emp.id] = {
      certifiedPct: totalSkills > 0 ? Math.round((certifiedCount / totalSkills) * 100) : 0,
      standardPct,
    }
  }

  return (
    <>
      <TopBar title="メンバー一覧" />
      <EmployeeManager
        employees={employees ?? []}
        canEdit={canEdit}
        employeeStats={employeeStats}
        teams={teams as Team[] ?? []}
        teamMembers={teamMembers as TeamMember[] ?? []}
      />
    </>
  )
}
