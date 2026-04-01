import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { ApprovalCenter } from '@/components/approvals/approval-center'
import type { Role } from '@/types/database'

const APPROVAL_ROLES: Role[] = ['store_manager', 'manager', 'admin', 'ops_manager', 'executive']

export default async function ApprovalsPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect('/login')
  const role = employee.role as Role
  if (!APPROVAL_ROLES.includes(role)) redirect('/')

  const db = createAdminClient()
  const isSystemAdmin = ['admin', 'ops_manager', 'executive'].includes(role)

  // 管理するチームのメンバーID
  let managedMemberIds: string[] = []
  let managedTeamIds: string[] = []
  if (!isSystemAdmin) {
    const { data: managed } = await db.from('team_managers').select('team_id').eq('employee_id', employee.id)
    managedTeamIds = (managed ?? []).map(m => m.team_id)
    if (managedTeamIds.length > 0) {
      const { data: members } = await db.from('team_members').select('employee_id').in('team_id', managedTeamIds)
      managedMemberIds = [...new Set((members ?? []).map(m => m.employee_id))]
    }
  }

  // 1. スキル認定待ち
  const { data: pendingAchievements } = await db
    .from('achievements')
    .select('id, employee_id, skill_id, achieved_at, apply_comment, created_at, skills(name), employees!achievements_employee_id_fkey(name, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const filteredAchievements = isSystemAdmin
    ? (pendingAchievements ?? [])
    : (pendingAchievements ?? []).filter(a => managedMemberIds.includes(a.employee_id))

  // 2. チーム変更承認待ち
  const { data: pendingTeamRequests } = await db
    .from('team_change_requests')
    .select('id, requested_by, request_type, team_id, payload, created_at, employees!team_change_requests_requested_by_fkey(name, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const filteredTeamRequests = isSystemAdmin
    ? (pendingTeamRequests ?? [])
    : (pendingTeamRequests ?? []).filter(r => r.team_id && managedTeamIds.includes(r.team_id))

  // 3. 参加許諾待ち
  const { data: pendingJoins } = await db
    .from('employees')
    .select('id, name, email, avatar_url, requested_team_id, created_at')
    .eq('status', 'pending')
    .not('requested_team_id', 'is', null)
    .order('created_at')

  const filteredJoins = isSystemAdmin
    ? (pendingJoins ?? [])
    : (pendingJoins ?? []).filter(e => e.requested_team_id && managedTeamIds.includes(e.requested_team_id))

  // 店舗・チーム名マップ
  const { data: allTeams } = await db.from('teams').select('id, name, type, prefecture').order('name')
  const teamMap = Object.fromEntries((allTeams ?? []).map(t => [t.id, t]))

  // プロジェクト（参加許諾用）
  const { data: projectTeams } = await db.from('teams').select('id, name').eq('type', 'project').order('name')

  return (
    <>
      <TopBar title="承認センター" />
      <ApprovalCenter
        pendingAchievements={filteredAchievements as any[]}
        pendingTeamRequests={filteredTeamRequests as any[]}
        pendingJoins={filteredJoins as any[]}
        teamMap={teamMap}
        projectTeams={projectTeams ?? []}
        currentEmployeeId={employee.id}
        isSystemAdmin={isSystemAdmin}
        approverRole={role}
        storeDeptTeams={(allTeams ?? []).filter(t => t.type === 'store' || t.type === 'department') as any[]}
      />
    </>
  )
}
