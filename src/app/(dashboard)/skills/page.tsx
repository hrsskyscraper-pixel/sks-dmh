import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { SkillList } from '@/components/skills/skill-list'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { SELECTED_PROJECT_COOKIE } from '@/lib/selected-project'
import { buildMilestoneMap } from '@/lib/milestone'
import type { ProjectPhase } from '@/types/database'

export default async function SkillsPage({
  searchParams,
}: {
  searchParams?: Promise<{ project_id?: string }>
}) {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const supabase = await createClient()

  const cookieStore = await cookies()
  const canViewAs = true // 全ロールでView-as可能（閲覧のみ）
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  const db = createAdminClient()

  // targetEmployee と searchParams を並列取得
  const [targetEmployeeResult, params] = await Promise.all([
    viewAsId
      ? db.from('employees').select('id, name, role, employment_type, hire_date, birth_date, avatar_url, auth_user_id').eq('id', viewAsId).single()
      : Promise.resolve({ data: null }),
    searchParams ?? Promise.resolve(undefined),
  ])
  const employee = (targetEmployeeResult as { data: typeof currentEmployee | null }).data ?? currentEmployee

  // 参加プロジェクト一覧（team_members と team_managers は並列取得）
  const [{ data: sMyTeams }, { data: sMyMgr }] = await Promise.all([
    db.from('team_members').select('team_id').eq('employee_id', employee.id),
    db.from('team_managers').select('team_id').eq('employee_id', employee.id),
  ])
  const sTeamIds = [...new Set([...(sMyTeams ?? []).map(r => r.team_id), ...(sMyMgr ?? []).map(r => r.team_id)])]
  const { data: sPtRows } = sTeamIds.length > 0 ? await db.from('project_teams').select('project_id').in('team_id', sTeamIds) : { data: [] }
  const sProjIds = [...new Set((sPtRows ?? []).map(r => r.project_id))]
  const { data: sProjects } = sProjIds.length > 0 ? await db.from('skill_projects').select('id, name, is_active').in('id', sProjIds).eq('is_active', true) : { data: [] }
  const employeeProjects = sProjects ?? []

  const requestedProjectId = (params as { project_id?: string } | undefined)?.project_id
  const cookieProjectId = cookieStore.get(SELECTED_PROJECT_COOKIE)?.value ?? null
  const selectedProject = employeeProjects.find(p => p.id === requestedProjectId)
    ?? employeeProjects.find(p => p.id === cookieProjectId)
    ?? employeeProjects[0]
    ?? null

  // selectedProject 確定後の全クエリを並列実行
  const [
    { data: projectPhaseRows },
    { data: projectSkillRows },
    { data: allSkills },
    { data: achievements },
    { data: cumulativeHours },
    { data: skillManualsRows },
    { data: manualsRows },
  ] = await Promise.all([
    selectedProject
      ? db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at').eq('project_id', selectedProject.id).order('order_index')
      : Promise.resolve({ data: null as ProjectPhase[] | null }),
    selectedProject
      ? db.from('project_skills').select('skill_id, project_phase_id').eq('project_id', selectedProject.id)
      : Promise.resolve({ data: null as { skill_id: string; project_phase_id: string | null }[] | null }),
    db.from('skills').select('id, name, phase, category, order_index, target_date_hint, standard_hours, is_checkpoint, created_at').order('order_index'),
    db.from('achievements')
      .select('*, certified_employee:employees!achievements_certified_by_fkey(name, avatar_url), skills(*)')
      .eq('employee_id', employee.id),
    db.rpc('get_employee_cumulative_hours', {
      p_employee_id: employee.id,
      p_as_of_date: new Date().toISOString().split('T')[0],
    }),
    db.from('skill_manuals').select('skill_id, manual_id, is_primary, display_order'),
    db.from('manual_library').select('id, title, url').eq('archived', false),
  ])

  const projectPhases: ProjectPhase[] = projectPhaseRows ?? []

  const skillPhaseMap: Record<string, string | null> = {}
  for (const ps of projectSkillRows ?? []) {
    skillPhaseMap[ps.skill_id] = ps.project_phase_id
  }

  const projectSkillIds = new Set(Object.keys(skillPhaseMap))
  const skills = (allSkills ?? []).filter(s => projectSkillIds.has(s.id))
  const milestones = buildMilestoneMap(projectPhases)

  // スキル→マニュアル マップ構築
  const manualById = Object.fromEntries((manualsRows ?? []).map(m => [m.id, m]))
  const skillManualsMap: Record<string, { id: string; title: string; url: string; isPrimary: boolean }[]> = {}
  for (const sm of skillManualsRows ?? []) {
    const m = manualById[sm.manual_id]
    if (!m) continue
    if (!skillManualsMap[sm.skill_id]) skillManualsMap[sm.skill_id] = []
    skillManualsMap[sm.skill_id].push({ id: m.id, title: m.title, url: m.url, isPrimary: sm.is_primary })
  }
  // 各スキルのマニュアルを is_primary 優先で並び替え
  for (const sid in skillManualsMap) {
    skillManualsMap[sid].sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1))
  }

  return (
    <>
      <TopBar title="スキルチェックリスト" />
      <SkillList
        employeeId={employee.id}
        skills={skills}
        achievements={achievements ?? []}
        readOnly={false}
        hireDate={employee.hire_date}
        phases={projectPhases}
        skillPhaseMap={skillPhaseMap}
        cumulativeHours={cumulativeHours ?? 0}
        milestones={milestones}
        skillManuals={skillManualsMap}
      />
    </>
  )
}
