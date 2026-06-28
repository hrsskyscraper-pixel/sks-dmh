import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { ApprovalCenter } from '@/components/approvals/approval-center'
import { UnjoinedMembersCard } from '@/components/approvals/unjoined-members-card'
import { UnsetLeadersCard } from '@/components/approvals/unset-leaders-card'
import type { Role } from '@/types/database'
import { canAdminister, canApprove } from '@/lib/permissions'
import { maskEmails } from '@/lib/email-visibility'
import { getTestEmployeeIds } from '@/lib/test-data'
import { signSkillPhotoPaths } from '@/lib/skill-photos'
import { getAffiliationsAndCurricula } from '@/lib/affiliations'

export default async function ApprovalsPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect('/login')
  const role = employee.role as Role
  // 承認権限が無い人がメール内リンクから来た場合、以前は無言で / にリダイレクトしていたため
  // 「自分のプロフィールに飛ぶ」行き止まりに見えていた。理由が分かる画面を出す。
  if (!canApprove(employee)) {
    return (
      <>
        <TopBar title="承認センター" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-base font-bold text-gray-800">承認権限がありません</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            このアカウントには承認権限（リーダー権限）が設定されていないため、承認センターは利用できません。
            <br />
            メンバーの申請を承認する必要がある場合は、運用管理者（上長）にリーダー権限の付与をご依頼ください。
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
          >
            ホームに戻る
          </Link>
        </div>
      </>
    )
  }

  const db = createAdminClient()
  const isSystemAdmin = canAdminister(employee)
  const testEmpIds = await getTestEmployeeIds()

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
    .select('id, employee_id, skill_id, achieved_at, apply_comment, photo_paths, created_at, skills(name), employees!achievements_employee_id_fkey(name, avatar_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const filteredAchievementsBase = (pendingAchievements ?? [])
    .filter(a => !testEmpIds.has(a.employee_id))
    .filter(a => a.employee_id !== employee.id) // 自己承認の禁止: 自分の申請は承認キューに出さない
    .filter(a => isSystemAdmin || managedMemberIds.includes(a.employee_id))

  // 申請写真に署名付きURLを付与（非公開バケット）
  const pendingPhotoMap = await signSkillPhotoPaths(
    db,
    filteredAchievementsBase.flatMap(a => (a as { photo_paths?: string[] }).photo_paths ?? [])
  )
  const filteredAchievements = filteredAchievementsBase.map(a => {
    const pairs = ((a as { photo_paths?: string[] }).photo_paths ?? [])
      .map(p => ({ path: p, url: pendingPhotoMap[p] }))
      .filter(x => x.url)
    return { ...a, photo_urls: pairs.map(x => x.url), photo_paths: pairs.map(x => x.path) }
  })

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

  const filteredTeamRequests = (pendingTeamRequests ?? [])
    .filter(r => !r.requested_by || !testEmpIds.has(r.requested_by))
    .filter(r => isSystemAdmin || (r.team_id && managedTeamIds.includes(r.team_id)))

  // 3. 参加許諾待ち
  const { data: pendingJoins } = await db
    .from('employees')
    .select('id, name, email, avatar_url, requested_team_id, requested_project_team_id, created_at')
    .eq('status', 'pending')
    .not('requested_team_id', 'is', null)
    .order('created_at')

  const filteredJoins = (pendingJoins ?? [])
    .filter(e => !testEmpIds.has(e.id))
    .filter(e => isSystemAdmin || (e.requested_team_id && managedTeamIds.includes(e.requested_team_id)))

  // メールアドレスは本人とシステム管理者にのみ表示（個人情報保護）。
  // 承認者でもリーダーには参加者のメールを見せない。
  const filteredJoinsForClient = maskEmails(filteredJoins, employee)
  const recentJoinsForClient = maskEmails(recentJoins ?? [], employee)

  // 未参加（承認済みだが所属0）= 招待で「参加する」を押さず離脱した人。
  const { data: approvedWithReq } = await db
    .from('employees')
    .select('id, name, email, avatar_url, requested_team_id, requested_project_team_id, created_at')
    .eq('status', 'approved')
    .not('requested_team_id', 'is', null)
  const candidateIds = (approvedWithReq ?? []).map(e => e.id)
  let joinedIds = new Set<string>()
  if (candidateIds.length > 0) {
    const [{ data: tmJoined }, { data: tgJoined }] = await Promise.all([
      db.from('team_members').select('employee_id').in('employee_id', candidateIds),
      db.from('team_managers').select('employee_id').in('employee_id', candidateIds),
    ])
    joinedIds = new Set([
      ...(tmJoined ?? []).map(r => r.employee_id),
      ...(tgJoined ?? []).map(r => r.employee_id),
    ])
  }
  const unjoinedMembers = (approvedWithReq ?? [])
    .filter(e => !joinedIds.has(e.id))
    .filter(e => !testEmpIds.has(e.id))
    .filter(e => isSystemAdmin || (e.requested_team_id && managedTeamIds.includes(e.requested_team_id)))
  const unjoinedForClient = maskEmails(unjoinedMembers, employee)

  // 店舗・チーム名マップ
  const { data: allTeams } = await db.from('teams').select('id, name, type, prefecture').order('name')
  const teamMap = Object.fromEntries((allTeams ?? []).map(t => [t.id, t]))

  // 再発防止: チームのリーダー(team_managers)に登録済みなのに「メンバー権限」で承認できない人を検知。
  // 招待は全員メンバー権限で始まり、リーダー権限は手動付与のため、上げ忘れがここで顕在化する。
  // 権限付与は運用管理者のみ可能なので一覧もシステム管理者にのみ表示。
  let unsetLeaders: { id: string; name: string; avatar_url: string | null; teamNames: string[] }[] = []
  if (isSystemAdmin) {
    const { data: mgrRows } = await db.from('team_managers').select('employee_id, team_id')
    const mgrIds = [...new Set((mgrRows ?? []).map(m => m.employee_id))]
    if (mgrIds.length > 0) {
      const { data: mgrEmps } = await db
        .from('employees')
        .select('id, name, avatar_url, role, system_permission')
        .in('id', mgrIds)
      const unset = (mgrEmps ?? []).filter(e => !canApprove(e) && !testEmpIds.has(e.id))
      const teamsByEmp: Record<string, string[]> = {}
      for (const m of mgrRows ?? []) {
        (teamsByEmp[m.employee_id] ??= []).push(teamMap[m.team_id]?.name ?? '—')
      }
      unsetLeaders = unset.map(e => ({ id: e.id, name: e.name, avatar_url: e.avatar_url, teamNames: teamsByEmp[e.id] ?? [] }))
    }
  }

  // 習得カリキュラム（参加許諾用）
  const { data: projectTeams } = await db.from('teams').select('id, name').eq('type', 'project').order('name')

  // 承認待ちスキル申請の「所属」と「習得カリキュラム」を解決（カードに表示）
  const { affByEmployee: applicantAff, curriculaBySkill: applicantCurricula } = await getAffiliationsAndCurricula(
    db,
    filteredAchievements.map(a => a.employee_id),
    filteredAchievements.map(a => a.skill_id),
  )

  return (
    <>
      <TopBar title="承認センター" />
      {(unsetLeaders.length > 0 || unjoinedForClient.length > 0) && (
        <div className="px-4 pt-4 space-y-3">
          {unsetLeaders.length > 0 && <UnsetLeadersCard leaders={unsetLeaders} />}
          {unjoinedForClient.length > 0 && (
            <UnjoinedMembersCard members={unjoinedForClient as any[]} teamMap={teamMap} />
          )}
        </div>
      )}
      <ApprovalCenter
        pendingAchievements={filteredAchievements as any[]}
        applicantAff={applicantAff}
        applicantCurricula={applicantCurricula}
        pendingTeamRequests={filteredTeamRequests as any[]}
        pendingJoins={filteredJoinsForClient as any[]}
        teamMap={teamMap}
        projectTeams={projectTeams ?? []}
        currentEmployeeId={employee.id}
        isSystemAdmin={isSystemAdmin}
        approverRole={role}
        storeDeptTeams={(allTeams ?? []).filter(t => t.type === 'store' || t.type === 'department') as any[]}
        recentAchievements={(recentAchievements ?? []) as any[]}
        recentTeamRequests={(recentTeamRequests ?? []) as any[]}
        recentJoins={recentJoinsForClient as any[]}
        reviewerMap={reviewerMap as Record<string, { id: string; name: string; avatar_url: string | null }>}
        auditLogs={(auditLogs ?? []) as any[]}
      />
    </>
  )
}
