import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { TeamDashboard } from '@/components/dashboard/team-dashboard'

export default async function TeamPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee || !['manager', 'admin', 'ops_manager'].includes(currentEmployee.role)) {
    redirect('/')
  }

  // 全社員取得
  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .order('hire_date')

  // 全スキル取得
  const { data: skills } = await supabase
    .from('skills')
    .select('*')

  // 全achievements取得
  const { data: achievements } = await supabase
    .from('achievements')
    .select('*, skills(*), employees!achievements_employee_id_fkey(*)')
    .order('created_at', { ascending: false })

  // 担当チームのメンバー ID セットを構築
  const { data: myManagedTeams } = await supabase
    .from('team_managers')
    .select('team_id')
    .eq('employee_id', currentEmployee.id)

  const managedTeamIds = (myManagedTeams ?? []).map(r => r.team_id)

  let priorityMemberIds = new Set<string>()
  if (managedTeamIds.length > 0) {
    const { data: managedMembers } = await supabase
      .from('team_members')
      .select('employee_id')
      .in('team_id', managedTeamIds)
    priorityMemberIds = new Set((managedMembers ?? []).map(r => r.employee_id))
  }

  return (
    <>
      <TopBar title="チームダッシュボード" />
      <TeamDashboard
        currentEmployee={currentEmployee}
        employees={employees ?? []}
        skills={skills ?? []}
        achievements={achievements ?? []}
        priorityMemberIds={priorityMemberIds}
      />
    </>
  )
}
