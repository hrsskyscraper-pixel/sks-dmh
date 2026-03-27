import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { TeamManager } from '@/components/admin/team-manager'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import type { Employee, Role } from '@/types/database'

export default async function AdminTeamsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const supabase = await createClient()
  const db = currentEmployee.role === 'testuser' ? createAdminClient() : supabase

  // view-as 中は表示ロールに合わせて権限を落とす
  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  let effectiveRole: Role = currentEmployee.role
  let effectiveEmployee: Employee = currentEmployee

  if (viewAsId) {
    const { data: viewAsEmp } = await db
      .from('employees')
      .select('id, auth_user_id, name, email, role, employment_type, hire_date, avatar_url, instagram_url, created_at, updated_at')
      .eq('id', viewAsId)
      .single()
    if (viewAsEmp) {
      effectiveRole = viewAsEmp.role as Role
      effectiveEmployee = viewAsEmp as Employee
    }
  }

  const [
    { data: teams },
    { data: teamMembers },
    { data: teamManagers },
    { data: employees },
    { data: changeRequests },
  ] = await Promise.all([
    db.from('teams').select('id, name, type, created_at, updated_at').order('name'),
    db.from('team_members').select('team_id, employee_id'),
    db.from('team_managers').select('team_id, employee_id, role'),
    db.from('employees').select('id, auth_user_id, name, email, role, employment_type, hire_date, avatar_url, instagram_url, created_at, updated_at').order('name'),
    db.from('team_change_requests')
      .select('id, status, request_type, team_id, payload, requested_by, reviewed_by, reviewed_at, review_comment, applicant_read_at, created_at')
      .order('created_at', { ascending: false }),
  ])

  return (
    <>
      <TopBar title="チーム一覧" />
      <TeamManager
        currentEmployee={currentEmployee}
        effectiveEmployee={effectiveEmployee}
        effectiveRole={effectiveRole}
        teams={teams ?? []}
        teamMembers={teamMembers ?? []}
        teamManagers={teamManagers ?? []}
        employees={employees ?? []}
        changeRequests={changeRequests ?? []}
      />
    </>
  )
}
