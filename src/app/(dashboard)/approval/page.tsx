import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { ApprovalManager } from '@/components/approval/approval-manager'
import type { Role } from '@/types/database'

const APPROVAL_ROLES: Role[] = ['store_manager', 'manager', 'admin', 'ops_manager', 'executive']

export default async function ApprovalPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect('/login')

  const role = employee.role as Role
  if (!APPROVAL_ROLES.includes(role)) redirect('/')

  const db = createAdminClient()

  // この管理者が所属するチーム（store_manager は自分の店舗のみ）
  const isSystemAdmin = ['admin', 'ops_manager', 'executive'].includes(role)

  let managedTeamIds: string[] = []
  if (!isSystemAdmin) {
    // store_manager / manager は team_managers に登録されているチームのみ
    const { data: managed } = await db
      .from('team_managers')
      .select('team_id')
      .eq('employee_id', employee.id)
    managedTeamIds = (managed ?? []).map(m => m.team_id)
  }

  // pending 社員取得
  const pendingQuery = db
    .from('employees')
    .select('id, name, email, avatar_url, requested_team_id, created_at')
    .eq('status', 'pending')
    .not('requested_team_id', 'is', null)
    .order('created_at')

  const { data: pendingEmployees } = await pendingQuery

  // システム管理者でなければ自分の管理チームの依頼のみ表示
  const filtered = isSystemAdmin
    ? (pendingEmployees ?? [])
    : (pendingEmployees ?? []).filter(e => managedTeamIds.includes(e.requested_team_id!))

  // チーム情報取得
  const { data: teams } = await db.from('teams').select('id, name, type').eq('type', 'store').order('name')

  // プロジェクト情報取得
  const { data: projects } = await db.from('skill_projects').select('id, name').eq('is_active', true)

  return (
    <>
      <TopBar title="参加許諾管理" />
      <div className="px-4 py-4">
        <ApprovalManager
          pendingEmployees={filtered}
          teams={teams ?? []}
          projects={projects ?? []}
          currentEmployeeId={employee.id}
          isSystemAdmin={isSystemAdmin}
          approverRole={role}
        />
      </div>
    </>
  )
}
