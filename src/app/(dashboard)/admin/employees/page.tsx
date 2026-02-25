import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { EmployeeManager } from '@/components/admin/employee-manager'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import type { Role, MilestoneMap, Phase, Team, TeamMember } from '@/types/database'

const DEFAULT_MILESTONES: Record<string, MilestoneMap> = {
  '社員': {
    '4月':     { start: 0,   end: 500  },
    '5月〜6月': { start: 500, end: 900  },
    '7月〜8月': { start: 900, end: 1400 },
  },
  'メイト': {
    '4月':     { start: 0,   end: 200  },
    '5月〜6月': { start: 200, end: 400  },
    '7月〜8月': { start: 400, end: 700  },
  },
}

function buildMilestoneMap(rows: { phase: string; end_hours: number }[], employmentType: string): MilestoneMap {
  const phases: Phase[] = ['4月', '5月〜6月', '7月〜8月']
  const defaults = DEFAULT_MILESTONES[employmentType] ?? DEFAULT_MILESTONES['社員']
  let prev = 0
  const map = { ...defaults }
  for (const phase of phases) {
    const row = rows.find(r => r.phase === phase)
    if (row) {
      map[phase as Phase] = { start: prev, end: row.end_hours }
      prev = row.end_hours
    }
  }
  return map
}

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

  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  let effectiveRole: Role = currentEmployee.role

  if (viewAsId) {
    const { data: viewAsEmp } = await supabase
      .from('employees')
      .select('role')
      .eq('id', viewAsId)
      .single()
    if (viewAsEmp) effectiveRole = viewAsEmp.role as Role
  }

  const canEdit = ['admin', 'ops_manager'].includes(effectiveRole)

  const [
    { data: employees },
    { data: skills },
    { data: allCertified },
    { data: allWorkHours },
    { data: allMilestoneRows },
    { data: teams },
    { data: teamMembers },
  ] = await Promise.all([
    supabase.from('employees').select('*').order('created_at'),
    supabase.from('skills').select('id, phase'),
    supabase.from('achievements').select('employee_id').eq('status', 'certified'),
    supabase.from('work_hours').select('employee_id, hours'),
    supabase.from('phase_milestones').select('phase, employment_type, end_hours'),
    supabase.from('teams').select('*').order('type').order('name'),
    supabase.from('team_members').select('team_id, employee_id'),
  ])

  const totalSkills = skills?.length ?? 0
  const skillsByPhase = (skills ?? []).reduce((acc, s) => {
    acc[s.phase] = (acc[s.phase] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const certifiedByEmployee = (allCertified ?? []).reduce((acc, a) => {
    acc[a.employee_id] = (acc[a.employee_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const hoursByEmployee = (allWorkHours ?? []).reduce((acc, r) => {
    acc[r.employee_id] = (acc[r.employee_id] ?? 0) + r.hours
    return acc
  }, {} as Record<string, number>)

  const milestoneMapsByType: Record<string, MilestoneMap> = {}
  for (const type of ['社員', 'メイト'] as const) {
    const rows = (allMilestoneRows ?? []).filter(r => r.employment_type === type)
    milestoneMapsByType[type] = buildMilestoneMap(rows, type)
  }

  function calcStandardPct(cumulativeHours: number, mm: MilestoneMap): number {
    if (totalSkills === 0) return 0
    const phases: Phase[] = ['4月', '5月〜6月', '7月〜8月']
    let expected = 0
    for (const phase of phases) {
      const m = mm[phase]
      if (!m || m.end <= m.start) continue
      const phasePct =
        cumulativeHours <= m.start ? 0
        : cumulativeHours >= m.end ? 100
        : Math.round((cumulativeHours - m.start) / (m.end - m.start) * 100)
      expected += Math.round(phasePct * (skillsByPhase[phase] ?? 0) / 100)
    }
    return Math.round((expected / totalSkills) * 100)
  }

  const employeeStats: Record<string, { certifiedPct: number; standardPct: number }> = {}
  if (totalSkills > 0) {
    for (const emp of employees ?? []) {
      if (emp.role !== 'employee') continue
      const empType = emp.employment_type ?? '社員'
      const empMilestones = milestoneMapsByType[empType] ?? milestoneMapsByType['社員']
      const empHours = hoursByEmployee[emp.id] ?? 0
      employeeStats[emp.id] = {
        certifiedPct: Math.round(((certifiedByEmployee[emp.id] ?? 0) / totalSkills) * 100),
        standardPct: calcStandardPct(empHours, empMilestones),
      }
    }
  }

  return (
    <>
      <TopBar title="メンバー一覧" />
      <EmployeeManager
        employees={employees ?? []}
        canEdit={canEdit}
        employeeStats={employeeStats}
        teams={teams ?? []}
        teamMembers={teamMembers ?? []}
      />
    </>
  )
}
