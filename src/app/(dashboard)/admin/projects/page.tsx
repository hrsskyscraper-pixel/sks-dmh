import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { ProjectManager } from '@/components/admin/project-manager'
import type { Role } from '@/types/database'

export default async function ProjectsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const supabase = await createClient()

  const effectiveRole: Role = currentEmployee.role
  if (!['admin', 'ops_manager', 'testuser'].includes(effectiveRole)) redirect('/')

  const db = currentEmployee.role === 'testuser' ? createAdminClient() : supabase

  const [
    { data: projects },
    { data: phases },
    { data: projectSkills },
    { data: employeeProjects },
    { data: allSkills },
    { data: employees },
  ] = await Promise.all([
    db.from('skill_projects').select('id, name, description, is_active, created_at').order('created_at'),
    db.from('project_phases').select('id, project_id, name, order_index, end_hours, created_at').order('project_id').order('order_index'),
    db.from('project_skills').select('project_id, skill_id, project_phase_id'),
    db.from('employee_projects').select('project_id, employee_id, joined_at'),
    db.from('skills').select('id, name, phase, category, order_index, target_date_hint, standard_hours, created_at').order('order_index'),
    db.from('employees').select('id, name, employment_type, hire_date').order('name'),
  ])

  return (
    <>
      <TopBar title="プロジェクト管理" />
      <ProjectManager
        projects={projects ?? []}
        phases={phases ?? []}
        projectSkills={projectSkills ?? []}
        employeeProjects={employeeProjects ?? []}
        allSkills={allSkills ?? []}
        employees={employees ?? []}
      />
    </>
  )
}
