import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { EmployeeCareerCard } from '@/components/admin/employee-career-card'

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ add?: string }> }) {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const { id } = await params
  const db = createAdminClient()
  const role = currentEmployee.role

  // アクセス権限チェック
  const isFullAccess = ['admin', 'ops_manager', 'executive', 'testuser'].includes(role)
  const isTeamAccess = ['manager', 'store_manager'].includes(role)
  const isSelfOnly = !isFullAccess && !isTeamAccess

  if (isSelfOnly && currentEmployee.id !== id) redirect('/')

  // マネジャー・店長: 自チーム/プロジェクトのメンバーのみ
  if (isTeamAccess && currentEmployee.id !== id) {
    const { data: myTeams } = await db.from('team_managers').select('team_id').eq('employee_id', currentEmployee.id)
    const myTeamIds = (myTeams ?? []).map(t => t.team_id)

    const { data: teamMembersAccess } = myTeamIds.length > 0
      ? await db.from('team_members').select('employee_id').in('team_id', myTeamIds)
      : { data: [] }

    const accessibleIds = new Set([
      ...(teamMembersAccess ?? []).map(m => m.employee_id),
      currentEmployee.id,
    ])
    if (!accessibleIds.has(id)) redirect('/admin/employees')
  }

  const canEdit = isFullAccess || isTeamAccess

  const [
    { data: employee },
    { data: careerRecords },
    { data: allEmployees },
    { data: memberTeamRows },
    { data: allTeams },
    { data: goals },
    { data: certs },
  ] = await Promise.all([
    db.from('employees').select('id, name, name_kana, email, role, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, line_user_id').eq('id', id).single(),
    db.from('career_records').select('*').eq('employee_id', id).order('occurred_at', { ascending: false }),
    db.from('employees').select('id, name, avatar_url').order('name'),
    db.from('team_members').select('team_id').eq('employee_id', id),
    db.from('teams').select('id, name, type, prefecture').order('name'),
    db.from('goals').select('id, content, deadline, set_at').eq('employee_id', id).order('created_at', { ascending: false }).limit(1),
    db.from('certifications').select('id, name, icon, color').eq('is_active', true).order('order_index'),
  ])

  if (!employee) redirect('/admin/employees')

  const employeeMap = Object.fromEntries((allEmployees ?? []).map(e => [e.id, e]))
  const memberTeamIds = (memberTeamRows ?? []).map(m => m.team_id)

  return (
    <>
      <TopBar title="メンバーキャリア" />
      <EmployeeCareerCard
        employee={employee}
        careerRecords={careerRecords ?? []}
        employeeMap={employeeMap}
        allEmployees={allEmployees ?? []}
        canEdit={canEdit}
        memberTeamIds={memberTeamIds}
        allTeams={(allTeams ?? []) as { id: string; name: string; type: 'store' | 'project' | 'department'; prefecture: string | null }[]}
        goal={(goals ?? [])[0] ?? null}
        certifications={(certs ?? []) as { id: string; name: string; icon: 'award' | 'star'; color: string }[]}
        autoAddType={(await (searchParams ?? Promise.resolve({})) as { add?: string })?.add ?? undefined}
      />
    </>
  )
}
