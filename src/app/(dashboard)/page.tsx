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

  // 参加プロジェクト一覧
  const { data: employeeProjectRows } = await supabase
    .from('employee_projects')
    .select('project_id, skill_projects(id, name, is_active)')
    .eq('employee_id', employee.id)

  const employeeProjects = (employeeProjectRows ?? [])
    .map(r => r.skill_projects)
    .filter((p): p is NonNullable<typeof p> => p !== null && (p as { is_active: boolean }).is_active)

  // 選択中プロジェクト
  const params = await searchParams
  const requestedProjectId = params?.project_id
  const selectedProject = employeeProjects.find(p => p.id === requestedProjectId)
    ?? employeeProjects[0]
    ?? null

  // 選択PJのフェーズ
  const { data: projectPhaseRows } = selectedProject ? await supabase
    .from('project_phases')
    .select('*')
    .eq('project_id', selectedProject.id)
    .order('order_index') : { data: [] }

  const projectPhases = projectPhaseRows ?? []

  // 選択PJのスキル紐づけ (skill_id -> project_phase_id)
  const { data: projectSkillRows } = selectedProject ? await supabase
    .from('project_skills')
    .select('skill_id, project_phase_id')
    .eq('project_id', selectedProject.id) : { data: [] }

  const skillPhaseMap: Record<string, string | null> = {}
  for (const ps of projectSkillRows ?? []) {
    skillPhaseMap[ps.skill_id] = ps.project_phase_id
  }

  // 対象スキル（選択PJに紐づくもの）
  const projectSkillIds = new Set(Object.keys(skillPhaseMap))
  const { data: allSkills } = await supabase
    .from('skills')
    .select('*')
    .order('order_index')

  const skills = (allSkills ?? []).filter(s => projectSkillIds.has(s.id))

  const { data: achievements } = await supabase
    .from('achievements')
    .select('*, skills(*)')
    .eq('employee_id', employee.id)

  // 未読通知
  const unreadNotifications = viewAsId ? [] : await (async () => {
    const { data } = await supabase
      .from('achievements')
      .select('*, skills(*)')
      .eq('employee_id', currentEmployee.id)
      .eq('is_read', false)
      .in('status', ['certified', 'rejected'])
    return data ?? []
  })()

  // 対応待ち件数（view-as 中は表示対象の社員ロールで判定）
  const effectiveRole = employee.role
  let pendingAchievementsCount = 0
  let pendingTeamRequestsCount = 0
  if (['manager', 'admin', 'ops_manager'].includes(effectiveRole)) {
    if (effectiveRole === 'manager') {
      // 担当リーダーのチームのメンバーの申請のみをカウント
      const { data: leaderTeamRows } = await supabase
        .from('team_managers')
        .select('team_id')
        .eq('employee_id', employee.id)
      const myTeamIds = (leaderTeamRows ?? []).map(r => r.team_id)
      if (myTeamIds.length > 0) {
        const { data: myMembers } = await supabase
          .from('team_members')
          .select('employee_id')
          .in('team_id', myTeamIds)
        const myMemberIds = (myMembers ?? []).map(r => r.employee_id)
        if (myMemberIds.length > 0) {
          const { count } = await supabase
            .from('achievements')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending')
            .in('employee_id', myMemberIds)
          pendingAchievementsCount = count ?? 0
        }
      }
    } else {
      // admin / ops_manager は全件表示
      const { count } = await supabase
        .from('achievements')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      pendingAchievementsCount = count ?? 0
    }
  }
  if (['admin', 'ops_manager'].includes(effectiveRole)) {
    const { count } = await supabase
      .from('team_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
    pendingTeamRequestsCount = count ?? 0
  }

  // チームランキング用: 全社員
  const { data: allEmployees } = await supabase
    .from('employees')
    .select('id, name, avatar_url, employment_type, hire_date')
    .eq('role', 'employee')
    .order('name')

  const { data: allCertified } = await supabase
    .from('achievements')
    .select('employee_id, skill_id')
    .eq('status', 'certified')

  const { data: allWorkHours } = await supabase
    .from('work_hours')
    .select('employee_id, hours')

  // 全社員の参加PJ一覧（ランキング用）
  const { data: allEmployeeProjects } = await supabase
    .from('employee_projects')
    .select('employee_id, project_id')

  // 全PJのフェーズ・スキル（ランキング計算用）
  const { data: allProjectPhases } = await supabase
    .from('project_phases')
    .select('*')

  const { data: allProjectSkills } = await supabase
    .from('project_skills')
    .select('project_id, skill_id, project_phase_id')

  // 店舗情報（ランキング表示用）
  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name, type')

  const { data: allTeamMembersForStore } = await supabase
    .from('team_members')
    .select('employee_id, team_id')

  const { data: workHoursSum } = await supabase
    .rpc('get_employee_cumulative_hours', {
      p_employee_id: employee.id,
      p_as_of_date: new Date().toISOString().split('T')[0],
    })

  // 現在のプロジェクトのマイルストーンマップ
  const milestones = buildMilestoneMap(projectPhases)

  // フェーズ別スキル数（フェーズ名ベース）
  const skillsByPhase: Record<string, number> = {}
  for (const s of skills) {
    const phaseId = skillPhaseMap[s.id]
    const phase = projectPhases.find(p => p.id === phaseId)
    if (phase) {
      skillsByPhase[phase.name] = (skillsByPhase[phase.name] ?? 0) + 1
    }
  }

  const totalSkills = skills.length

  // 店舗チームの逆引きマップ
  const storeTeams = (allTeams ?? []).filter(t => t.type === 'store')
  const storeTeamIds = new Set(storeTeams.map(t => t.id))
  const storeTeamById = Object.fromEntries(storeTeams.map(t => [t.id, t.name]))
  const storeByEmployee: Record<string, string> = {}
  for (const m of allTeamMembersForStore ?? []) {
    if (storeTeamIds.has(m.team_id)) {
      storeByEmployee[m.employee_id] = storeTeamById[m.team_id]
    }
  }

  // 社員別累計時間
  const hoursByEmployee = (allWorkHours ?? []).reduce((acc, r) => {
    acc[r.employee_id] = (acc[r.employee_id] ?? 0) + r.hours
    return acc
  }, {} as Record<string, number>)

  // プロジェクト別スキルIDセット（teamStats で各社員自身のPJで認定数を計算するため）
  const projectSkillIdMap: Record<string, Set<string>> = {}
  for (const ps of allProjectSkills ?? []) {
    if (!projectSkillIdMap[ps.project_id]) projectSkillIdMap[ps.project_id] = new Set()
    projectSkillIdMap[ps.project_id].add(ps.skill_id)
  }

  // 社員ごとの標準進捗（最初の参加PJで計算）
  const teamStats = (allEmployees ?? []).map(emp => {
    const empProjectIds = (allEmployeeProjects ?? [])
      .filter(ep => ep.employee_id === emp.id)
      .map(ep => ep.project_id)

    const firstProjectId = empProjectIds[0] ?? null

    // 各社員自身のプロジェクトスキルで認定数を集計（選択PJに依存しない）
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

      // フェーズ別スキル数を再計算
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
        skills={skills}
        achievements={achievements ?? []}
        cumulativeHours={workHoursSum ?? 0}
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
