import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { ProjectManager } from '@/components/admin/project-manager'
import { canAdminister } from '@/lib/permissions'

export default async function ProjectsPage({ searchParams }: { searchParams?: Promise<{ project_id?: string }> }) {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  if (!canAdminister(currentEmployee)) redirect('/')

  const db = createAdminClient()

  const [
    { data: projects },
    { data: phases },
    { data: projectSkills },
    { data: projectTeams },
    { data: allSkills },
    { data: teams },
    { data: creatorEmployees },
  ] = await Promise.all([
    db.from('skill_projects').select('id, name, description, is_active, created_at, created_by').order('created_at'),
    db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at').order('project_id').order('order_index'),
    db.from('project_skills').select('project_id, skill_id, project_phase_id'),
    db.from('project_teams').select('project_id, team_id'),
    db.from('skills').select('id, name, phase, category, order_index, target_date_hint, standard_hours, is_checkpoint, created_at').order('order_index'),
    db.from('teams').select('id, name, type, prefecture').order('name'),
    db.from('employees').select('id, name'),
  ])

  // URL の ?project_id= で選択中の習得カリキュラムを復元する
  // （CSV取込完了後の再読み込みなどで、操作対象が先頭に戻らないようにする）
  const requestedProjectId = (await searchParams)?.project_id
  const initialSelectedProjectId =
    requestedProjectId && (projects ?? []).some(p => p.id === requestedProjectId)
      ? requestedProjectId
      : null

  return (
    <>
      <TopBar title="習得カリキュラム管理" />
      <ProjectManager
        initialSelectedProjectId={initialSelectedProjectId}
        projects={projects ?? []}
        phases={phases ?? []}
        projectSkills={projectSkills ?? []}
        projectTeams={projectTeams ?? []}
        allSkills={allSkills ?? []}
        teams={teams ?? []}
        currentEmployeeId={currentEmployee.id}
        employeeNameMap={Object.fromEntries((creatorEmployees ?? []).map(e => [e.id, e.name]))}
      />
    </>
  )
}
