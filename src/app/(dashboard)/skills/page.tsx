import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { SkillList } from '@/components/skills/skill-list'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import type { MilestoneMap, Phase } from '@/types/database'

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

export default async function SkillsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee) redirect('/login')

  // viewAs Cookie から表示対象を決定
  const cookieStore = await cookies()
  const canViewAs = currentEmployee.role === 'manager' || currentEmployee.role === 'admin' || currentEmployee.role === 'ops_manager'
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  let employee = currentEmployee
  if (viewAsId) {
    const { data: targetEmployee } = await supabase
      .from('employees')
      .select('*')
      .eq('id', viewAsId)
      .single()
    if (targetEmployee) employee = targetEmployee
  }

  const { data: skills } = await supabase
    .from('skills')
    .select('*')
    .order('phase')
    .order('order_index')

  const { data: achievements } = await supabase
    .from('achievements')
    .select('*, certified_employee:employees!achievements_certified_by_fkey(name)')
    .eq('employee_id', employee.id)

  const employmentType = employee.employment_type ?? '社員'

  const [{ data: milestoneRows }, { data: cumulativeHours }] = await Promise.all([
    supabase
      .from('phase_milestones')
      .select('phase, end_hours')
      .eq('employment_type', employmentType),
    supabase.rpc('get_employee_cumulative_hours', {
      p_employee_id: employee.id,
      p_as_of_date: new Date().toISOString().split('T')[0],
    }),
  ])

  const milestones = buildMilestoneMap(milestoneRows ?? [], employmentType)

  return (
    <>
      <TopBar title="スキルチェックリスト" />
      <SkillList
        employeeId={employee.id}
        skills={skills ?? []}
        achievements={achievements ?? []}
        readOnly={false}
        hireDate={employee.hire_date}
        employmentType={employee.employment_type}
        cumulativeHours={cumulativeHours ?? 0}
        milestones={milestones}
      />
    </>
  )
}
