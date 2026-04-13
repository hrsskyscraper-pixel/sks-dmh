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

  // 処理済みスキル認定（承認権限者全員が閲覧可能・直近30件）
  const { data: recentAchievements } = await db
    .from('achievements')
    .select('id, employee_id, skill_id, status, certified_by, certified_at, certify_comment, created_at, skills(name), employees!achievements_employee_id_fkey(name, avatar_url), certifier:employees!achievements_certified_by_fkey(name, avatar_url)')
    .in('status', ['certified', 'rejected'])
    .not('certified_at', 'is', null)
    .order('certified_at', { ascending: false })
    .limit(30)

  // 処理済みチーム変更（直近30件）
  const { data: recentTeamRequests } = await db
    .from('team_change_requests')
    .select('id, requested_by, request_type, team_id, payload, status, reviewed_by, reviewed_at, review_comment, created_at, employees!team_change_requests_requested_by_fkey(name, avatar_url)')
    .in('status', ['approved', 'rejected'])
    .not('reviewed_at', 'is', null)
    .order('reviewed_at', { ascending: false })
    .limit(30)

  // 処理済み参加許諾（approved_atがある社員・直近30件）
  const { data: recentJoins } = await db
    .from('employees')
    .select('id, name, email, avatar_url, requested_team_id, requested_project_team_id, status, approved_by, approved_at, created_at, updated_at')
    .eq('status', 'approved')
    .not('approved_at', 'is', null)
    .order('approved_at', { ascending: false })
    .limit(30)

  // 処理済み履歴の承認者名マップ
  const reviewerIds = new Set<string>()
  for (const a of recentAchievements ?? []) if (a.certified_by) reviewerIds.add(a.certified_by)
  for (const r of recentTeamRequests ?? []) if (r.reviewed_by) reviewerIds.add(r.reviewed_by)
  for (const j of recentJoins ?? []) if (j.approved_by) reviewerIds.add(j.approved_by)
  const { data: reviewerEmployees } = reviewerIds.size > 0
    ? await db.from('employees').select('id, name, avatar_url').in('id', [...reviewerIds])
    : { data: [] }
  const reviewerMap = Object.fromEntries((reviewerEmployees ?? []).map(e => [e.id, e]))

  // 監査ログ（ロール変更等）
  const { data: auditLogs } = await db
    .from('admin_audit_log')
    .select('id, action, actor_id, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  // 監査ログの関係者名を追加
  const auditPersonIds = new Set<string>()
  for (const log of auditLogs ?? []) {
    auditPersonIds.add(log.actor_id)
    if (log.target_id) auditPersonIds.add(log.target_id)
  }
  // reviewerMapに不足分を追加
  const missingIds = [...auditPersonIds].filter(id => !reviewerMap[id])
  if (missingIds.length > 0) {
    const { data: extra } = await db.from('employees').select('id, name, avatar_url').in('id', missingIds)
    for (const e of extra ?? []) reviewerMap[e.id] = e
  }

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
    .select('id, name, email, avatar_url, requested_team_id, requested_project_team_id, created_at')
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
        recentAchievements={(recentAchievements ?? []) as any[]}
        recentTeamRequests={(recentTeamRequests ?? []) as any[]}
        recentJoins={(recentJoins ?? []) as any[]}
        reviewerMap={reviewerMap as Record<string, { id: string; name: string; avatar_url: string | null }>}
        auditLogs={(auditLogs ?? []) as any[]}
      />
    </>
  )
}
