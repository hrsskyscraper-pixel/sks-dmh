import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { TeamManager } from '@/components/admin/team-manager'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import type { Employee, Role } from '@/types/database'

export default async function AdminTeamsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee) redirect('/login')

  // view-as 中は表示ロールに合わせて権限を落とす
  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null
  let effectiveRole: Role = currentEmployee.role
  let effectiveEmployee: Employee = currentEmployee

  if (viewAsId) {
    const { data: viewAsEmp } = await supabase
      .from('employees')
      .select('*')
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
    supabase.from('teams').select('*').order('name'),
    supabase.from('team_members').select('*'),
    supabase.from('team_managers').select('*'),
    supabase.from('employees').select('*').order('name'),
    supabase
      .from('team_change_requests')
      .select('*')
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
