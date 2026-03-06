import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { ProjectManager } from '@/components/admin/project-manager'
import type { Role } from '@/types/database'

export default async function ProjectsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee) redirect('/login')

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
    db.from('skill_projects').select('*').order('created_at'),
    db.from('project_phases').select('*').order('project_id').order('order_index'),
    db.from('project_skills').select('*'),
    db.from('employee_projects').select('*'),
    db.from('skills').select('*').order('order_index'),
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
