import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { TeamDashboard } from '@/components/dashboard/team-dashboard'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { buildMilestoneMap, calcStandardPct } from '@/lib/milestone'
import { canApprove, canAdminister } from '@/lib/permissions'
import { getTestEmployeeIds } from '@/lib/test-data'
import { signSkillPhotoPaths } from '@/lib/skill-photos'

export default async function TeamPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee || !canApprove(currentEmployee)) {
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
    db.from('employees').select('id, auth_user_id, name, last_name, first_name, name_kana, email, role, business_role_ids, system_permission, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, line_friend, approved_by, approved_at, invited_by, invitation_id, notifications_read_at, font_scale, intro_dismissed_at, is_test, created_at, updated_at').order('hire_date'),
    db.from('skills').select('id, name, phase, category, order_index, target_date_hint, standard_hours, is_checkpoint, created_at'),
    db.from('achievements')
      .select('id, status, employee_id, skill_id, achieved_at, certified_by, certified_at, cumulative_hours_at_achievement, notes, apply_comment, certify_comment, is_read, photo_paths, created_at, skills(id, name, phase, category, order_index, target_date_hint, standard_hours, is_checkpoint, created_at), employees!achievements_employee_id_fkey(id, auth_user_id, name, last_name, first_name, name_kana, email, role, business_role_ids, system_permission, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, line_friend, approved_by, approved_at, invited_by, invitation_id, notifications_read_at, font_scale, intro_dismissed_at, is_test, created_at, updated_at)')
      .order('created_at', { ascending: false }),
    db.from('team_managers').select('team_id').eq('employee_id', effectiveEmployeeId),
    db.from('work_hours').select('employee_id, hours'),
    (async () => {
      const { getEmployeeProjectMapping } = await import('@/lib/project-members')
      // 育成対象＝チームの「メンバー」。リーダー(team_managers)は対象に含めない
      return { data: await getEmployeeProjectMapping(db, { membersOnly: true }) }
    })(),
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

  // employee→project マッピング（複数所属あり）を事前構築
  const empProjects: Record<string, string[]> = {}
  for (const ep of allEmployeeProjects ?? []) {
    (empProjects[ep.employee_id] ??= []).push(ep.project_id)
  }
  // 認定済みスキル集合（習得カリキュラム選択の判定用）
  const certifiedSet = new Set<string>()
  for (const a of achievements ?? []) {
    if (a.status === 'certified') certifiedSet.add(`${a.employee_id}:${a.skill_id}`)
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
    // 所属習得カリキュラムのうち空でないものから、本人の認定が最も多いものを採用
    // （空習得カリキュラムの誤選択で 0% になるのを防ぐ）
    let best: { standardPct: number; totalSkills: number; certifiedCount: number } | null = null
    for (const pid of empProjects[emp.id] ?? []) {
      const skills = pSkillsByProject[pid] ?? []
      if (skills.length === 0) continue
      let cc = 0
      for (const ps of skills) {
        if (certifiedSet.has(`${emp.id}:${ps.skill_id}`)) cc++
      }
      const stats = getProjectStats(pid)
      const sp = calcStandardPct(hoursByEmployee[emp.id] ?? 0, stats.milestones, stats.skillsByPhase, stats.totalSkills)
      const cand = { standardPct: sp, totalSkills: stats.totalSkills, certifiedCount: cc }
      if (!best || cand.certifiedCount > best.certifiedCount || (cand.certifiedCount === best.certifiedCount && cand.standardPct > best.standardPct)) {
        best = cand
      }
    }
    empStatsMap[emp.id] = { standardPct: best?.standardPct ?? 0, totalSkills: best?.totalSkills ?? 0, storeName: storeByEmployee[emp.id] ?? null }
  }

  // テスト社員は一覧・集計から除外
  const testEmpIds = await getTestEmployeeIds()
  const visibleEmployees = (employees ?? []).filter(e => !testEmpIds.has(e.id))

  // 担当チームのメンバーの pending のみに絞る（他チームの申請はリーダーに見せない）＋テスト社員除外。
  // 自己承認の禁止: 自分自身の pending は承認キューに出さない（認定済み等の表示には影響しない）。
  const filteredAchievements = (achievements ?? []).filter(
    a => (a.status !== 'pending' || (priorityMemberIds.has(a.employee_id) && a.employee_id !== effectiveEmployeeId)) && !testEmpIds.has(a.employee_id)
  )

  // 申請写真に署名付きURLを付与（非公開バケットのため service-role で署名）
  const adminDb = createAdminClient()
  const teamPhotoMap = await signSkillPhotoPaths(
    adminDb,
    filteredAchievements.flatMap(a => (a as { photo_paths?: string[] }).photo_paths ?? [])
  )
  const achievementsWithPhotos = filteredAchievements.map(a => {
    const pairs = ((a as { photo_paths?: string[] }).photo_paths ?? [])
      .map(p => ({ path: p, url: teamPhotoMap[p] }))
      .filter(x => x.url)
    return { ...a, photo_urls: pairs.map(x => x.url), photo_paths: pairs.map(x => x.path) }
  })

  return (
    <>
      <TopBar title="スキル認定" />
      <TeamDashboard
        currentEmployee={currentEmployee}
        employees={visibleEmployees}
        skills={skills ?? []}
        achievements={achievementsWithPhotos}
        canDeletePhotos={canAdminister(currentEmployee)}
        priorityMemberIds={priorityMemberIds}
        managedTeams={managedTeams}
        managedTeamMembers={managedTeamMembers}
        empStatsMap={empStatsMap}
        developmentTargetIds={Object.keys(empProjects)}
      />
    </>
  )
}
