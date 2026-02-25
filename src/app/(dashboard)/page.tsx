import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { DashboardContent } from '@/components/dashboard/dashboard-content'
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

export default async function DashboardPage() {
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
    .order('order_index')

  const { data: achievements } = await supabase
    .from('achievements')
    .select('*, skills(*)')
    .eq('employee_id', employee.id)

  // 未読通知: 自分の認定/差し戻し結果（viewAs時は非表示）
  const unreadNotifications = viewAsId ? [] : await (async () => {
    const { data } = await supabase
      .from('achievements')
      .select('*, skills(*)')
      .eq('employee_id', currentEmployee.id)
      .eq('is_read', false)
      .in('status', ['certified', 'rejected'])
    return data ?? []
  })()

  // 認定者・審査者向け: 対応待ち件数（viewAs 中は実際のログインユーザーのロールで判定）
  const effectiveRole = employee.role
  let pendingAchievementsCount = 0
  let pendingTeamRequestsCount = 0
  if (['manager', 'admin', 'ops_manager'].includes(effectiveRole)) {
    const { count } = await supabase
      .from('achievements')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingAchievementsCount = count ?? 0
  }
  if (['admin', 'ops_manager'].includes(effectiveRole)) {
    const { count } = await supabase
      .from('team_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingTeamRequestsCount = count ?? 0
  }

  // チームランキング用: 全社員・認定済み件数・勤務時間・全マイルストーン
  const { data: allEmployees } = await supabase
    .from('employees')
    .select('id, name, avatar_url, employment_type, hire_date')
    .eq('role', 'employee')
    .order('name')

  const { data: allCertified } = await supabase
    .from('achievements')
    .select('employee_id')
    .eq('status', 'certified')

  const { data: allWorkHours } = await supabase
    .from('work_hours')
    .select('employee_id, hours')

  const { data: allMilestoneRows } = await supabase
    .from('phase_milestones')
    .select('phase, employment_type, end_hours')

  const { data: workHoursSum } = await supabase
    .rpc('get_employee_cumulative_hours', {
      p_employee_id: employee.id,
      p_as_of_date: new Date().toISOString().split('T')[0],
    })

  const employmentType = employee.employment_type ?? '社員'
  const { data: milestoneRows } = await supabase
    .from('phase_milestones')
    .select('phase, end_hours')
    .eq('employment_type', employmentType)
  const milestones = buildMilestoneMap(milestoneRows ?? [], employmentType)

  const totalSkills = skills?.length ?? 0

  // フェーズ別スキル数
  const skillsByPhase = (skills ?? []).reduce((acc, s) => {
    acc[s.phase] = (acc[s.phase] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // 社員別累計時間
  const hoursByEmployee = (allWorkHours ?? []).reduce((acc, r) => {
    acc[r.employee_id] = (acc[r.employee_id] ?? 0) + r.hours
    return acc
  }, {} as Record<string, number>)

  // 雇用タイプ別マイルストーンマップ
  const milestoneMapsByType: Record<string, MilestoneMap> = {}
  for (const type of ['社員', 'メイト'] as const) {
    const rows = (allMilestoneRows ?? []).filter(r => r.employment_type === type)
    milestoneMapsByType[type] = buildMilestoneMap(rows, type)
  }

  // 標準進捗(全体%)を計算
  function calcStandardPctOverall(cumulativeHours: number, mm: MilestoneMap): number {
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

  const certifiedByEmployee = (allCertified ?? []).reduce((acc, a) => {
    acc[a.employee_id] = (acc[a.employee_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const teamStats = (allEmployees ?? []).map(emp => {
    const empType = emp.employment_type ?? '社員'
    const empMilestones = milestoneMapsByType[empType] ?? milestoneMapsByType['社員']
    const empHours = hoursByEmployee[emp.id] ?? 0
    return {
      id: emp.id,
      name: emp.name,
      avatar_url: emp.avatar_url,
      employment_type: emp.employment_type,
      hire_date: emp.hire_date,
      certifiedCount: certifiedByEmployee[emp.id] ?? 0,
      totalSkills,
      standardPct: calcStandardPctOverall(empHours, empMilestones),
    }
  })

  return (
    <>
      <TopBar
        title="できました表"
        right={
          <div className="flex items-end gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">標準完了</p>
              <p className="text-base font-bold text-gray-400">{milestones['7月〜8月']?.end ?? 0}h</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">8h換算</p>
              <p className="text-base font-bold text-gray-400">{Math.floor((milestones['7月〜8月']?.end ?? 0) / 8)}日</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">累計勤務</p>
              <p className="text-base font-bold text-orange-500">{workHoursSum ?? 0}h</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">8h換算</p>
              <p className="text-base font-bold text-gray-600">{Math.floor((workHoursSum ?? 0) / 8)}日</p>
            </div>
          </div>
        }
      />
      <DashboardContent
        employee={employee}
        skills={skills ?? []}
        achievements={achievements ?? []}
        cumulativeHours={workHoursSum ?? 0}
        milestones={milestones}
        teamStats={teamStats}
        unreadNotifications={unreadNotifications}
        pendingAchievementsCount={pendingAchievementsCount}
        pendingTeamRequestsCount={pendingTeamRequestsCount}
      />
    </>
  )
}
