import { createAdminClient } from '@/lib/supabase/admin'
import { TeamRanking } from '@/components/dashboard/team-ranking'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'
import type { TeamMemberStat, TeamAffiliation } from '@/components/dashboard/team-ranking'
import { getRankingExcludedIds } from '@/lib/test-data'

interface Props {
  employeeId: string
  employeeRole: string
  selectedProjectId: string | null
}

export async function TeamRankingServer({ employeeId, employeeRole, selectedProjectId }: Props) {
  const db = createAdminClient()

  const [
    { data: allEmployees },
    { data: allCertified },
    { data: allWorkHours },
    { data: allEmployeeProjects },
    { data: allProjectPhases },
    { data: allProjectSkills },
    { data: allTeams },
    { data: allTeamMembers },
    { data: allTeamManagers },
  ] = await Promise.all([
    db.from('employees').select('id, name, avatar_url, employment_type, hire_date').order('name'),
    db.from('achievements').select('employee_id, skill_id').eq('status', 'certified'),
    db.from('work_hours').select('employee_id, hours'),
    (async () => {
      const { getEmployeeProjectMapping } = await import('@/lib/project-members')
      // 育成対象＝チームの「メンバー」。リーダー(team_managers)は対象に含めない
      return { data: await getEmployeeProjectMapping(db, { membersOnly: true }) }
    })(),
    db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at'),
    db.from('project_skills').select('project_id, skill_id, project_phase_id'),
    db.from('teams').select('id, name, type'),
    db.from('team_members').select('employee_id, team_id'),
    db.from('team_managers').select('employee_id, team_id'),
  ])

  // テスト社員（is_test / testuser / テスト店舗所属）はランキングから除外
  const testEmpIds = await getRankingExcludedIds()

  // チーム情報（id → 名前・種別）
  const teamById = Object.fromEntries(
    (allTeams ?? []).map(t => [t.id, { name: t.name, type: t.type as TeamAffiliation['type'] }])
  )

  // 表示範囲の基準＝自分が「メンバー or リーダー」として所属するチーム
  const myTeamIds = new Set<string>()
  for (const m of allTeamMembers ?? []) if (m.employee_id === employeeId) myTeamIds.add(m.team_id)
  for (const m of allTeamManagers ?? []) if (m.employee_id === employeeId) myTeamIds.add(m.team_id)

  // 自分のチームを共有する人（メンバー or リーダー）だけを表示対象にする
  const visibleIds = new Set<string>()
  for (const m of allTeamMembers ?? []) if (myTeamIds.has(m.team_id)) visibleIds.add(m.employee_id)
  for (const m of allTeamManagers ?? []) if (myTeamIds.has(m.team_id)) visibleIds.add(m.employee_id)

  // 各社員のチーム所属（種別・役割つき）。同一チームでメンバー兼リーダーならリーダーを優先。
  const TYPE_ORDER: Record<string, number> = { store: 0, department: 1, project: 2 }
  const affByEmp: Record<string, Map<string, TeamAffiliation>> = {}
  const addAff = (empId: string, teamId: string, role: 'member' | 'leader') => {
    const t = teamById[teamId]
    if (!t) return
    const map = (affByEmp[empId] ??= new Map<string, TeamAffiliation>())
    if (map.get(teamId)?.role === 'leader') return // 既にリーダー登録済みなら据え置き
    map.set(teamId, { name: t.name, type: t.type, role, shared: myTeamIds.has(teamId) })
  }
  for (const m of allTeamMembers ?? []) addAff(m.employee_id, m.team_id, 'member')
  for (const m of allTeamManagers ?? []) addAff(m.employee_id, m.team_id, 'leader')
  const affListOf = (empId: string): TeamAffiliation[] =>
    [...(affByEmp[empId]?.values() ?? [])].sort(
      (a, b) => (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || a.name.localeCompare(b.name, 'ja')
    )

  const hoursByEmployee = (allWorkHours ?? []).reduce((acc, r) => {
    acc[r.employee_id] = (acc[r.employee_id] ?? 0) + r.hours
    return acc
  }, {} as Record<string, number>)

  const projectSkillIdMap: Record<string, Set<string>> = {}
  for (const ps of allProjectSkills ?? []) {
    if (!projectSkillIdMap[ps.project_id]) projectSkillIdMap[ps.project_id] = new Set()
    projectSkillIdMap[ps.project_id].add(ps.skill_id)
  }

  // 社員→所属習得カリキュラム一覧（複数所属あり）
  const empProjects: Record<string, string[]> = {}
  for (const ep of allEmployeeProjects ?? []) {
    (empProjects[ep.employee_id] ??= []).push(ep.project_id)
  }

  // 習得カリキュラム名（表示用）
  const allEmpProjIds = [...new Set((allEmployeeProjects ?? []).map(ep => ep.project_id))]
  const { data: skillProjectRows } = allEmpProjIds.length > 0
    ? await db.from('skill_projects').select('id, name').in('id', allEmpProjIds)
    : { data: [] as { id: string; name: string }[] }
  const projNameById: Record<string, string> = Object.fromEntries((skillProjectRows ?? []).map(p => [p.id, p.name]))

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

  // 育成対象＝習得カリキュラムに紐づくチームの「メンバー」になっている社員（テスト除外）のうち、
  // 自分のチーム（店舗・部署・PJチーム）を共有する人だけに絞る
  const teamStats: TeamMemberStat[] = (allEmployees ?? [])
    .filter(emp => !testEmpIds.has(emp.id) && visibleIds.has(emp.id) && (empProjects[emp.id]?.length ?? 0) > 0)
    .map(emp => {
    // 所属習得カリキュラムのうち「スキルが設定されている（空でない）」ものだけを対象に、
    // 本人の認定が最も多い習得カリキュラムを採用する（空習得カリキュラムの誤選択で0%になるのを防ぐ）。
    let best: { certifiedCount: number; totalSkills: number; standardPct: number } | null = null
    for (const pid of empProjects[emp.id] ?? []) {
      const skillSet = projectSkillIdMap[pid] ?? new Set<string>()
      if (skillSet.size === 0) continue
      let cc = 0
      for (const skillId of skillSet) {
        if (certifiedSet.has(`${emp.id}:${skillId}`)) cc++
      }
      const stats = getProjectStats(pid)
      const sp = calcStandardPct(hoursByEmployee[emp.id] ?? 0, stats.milestones, stats.skillsByPhase, stats.totalSkills)
      const cand = { certifiedCount: cc, totalSkills: stats.totalSkills, standardPct: sp }
      if (!best || cand.certifiedCount > best.certifiedCount || (cand.certifiedCount === best.certifiedCount && cand.standardPct > best.standardPct)) {
        best = cand
      }
    }
    return {
      id: emp.id, name: emp.name, avatar_url: emp.avatar_url,
      employment_type: emp.employment_type, hire_date: emp.hire_date,
      // 表示は「店舗／部署」のみ（PJチームは出さない）＋習得カリキュラム名
      teams: affListOf(emp.id).filter(a => a.type === 'store' || a.type === 'department'),
      curricula: [...new Set((empProjects[emp.id] ?? []).map(pid => projNameById[pid]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja')),
      certifiedCount: best?.certifiedCount ?? 0,
      totalSkills: best?.totalSkills ?? 0,
      standardPct: best?.standardPct ?? 0,
    }
  })

  return <TeamRanking currentEmployeeId={employeeId} stats={teamStats} />
}
