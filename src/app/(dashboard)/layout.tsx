export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { BottomNav } from '@/components/layout/nav'
import { Toaster } from '@/components/ui/sonner'
import { ViewAsBanner } from '@/components/layout/view-as-banner'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { createAdminClient } from '@/lib/supabase/admin'
import { NotificationCountProvider } from '@/components/layout/notification-context'
import { OnboardingDialog } from '@/components/onboarding/onboarding-dialog'
import { PendingScreen } from '@/components/onboarding/pending-screen'
import type { Database, Role } from '@/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  let employee = await getCurrentEmployee()

  // 初回ログイン時: employeesレコードがなければ自動作成（role=testuser）
  if (!employee) {
    const adminDb = createAdminClient()
    const insertData: Database['public']['Tables']['employees']['Insert'] = {
      auth_user_id: user.id,
      name: (user.user_metadata.full_name as string | undefined) ?? user.email ?? '未設定',
      email: user.email ?? '',
      role: 'employee',
      employment_type: '社員',
      avatar_url: (user.user_metadata.avatar_url as string | undefined) ?? null,
      status: 'pending',
    }
    const { error: insertError } = await adminDb.from('employees').insert(insertData)
    if (!insertError) {
      // RLS を回避するため admin client で再取得
      const { data: created } = await adminDb
        .from('employees')
        .select('id, name, name_kana, email, role, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, notifications_read_at, auth_user_id, created_at, updated_at')
        .eq('auth_user_id', user.id)
        .single()
      employee = created
    } else {
      await supabase.auth.signOut()
      redirect(`/login?error=${encodeURIComponent(insertError.message)}`)
    }
  }

  // 既存ユーザーでavatar_url未設定の場合、Googleの写真を自動設定
  if (employee && !employee.avatar_url && user.user_metadata.avatar_url) {
    const adminDb = createAdminClient()
    const googleAvatar = user.user_metadata.avatar_url as string
    await adminDb.from('employees').update({ avatar_url: googleAvatar }).eq('id', employee.id)
    employee = { ...employee, avatar_url: googleAvatar }
  }

  // それでも取得できなければサインアウトしてリダイレクト（ループ防止）
  if (!employee) {
    await supabase.auth.signOut()
    redirect('/login?error=employee_fetch_failed')
  }

  // pending ユーザーはダッシュボードを見せない
  if (employee.status === 'pending') {
    // まだ店舗未選択 → オンボーディングダイアログ表示
    if (!employee.requested_team_id) {
      const adminDb = createAdminClient()
      const { data: allTeams } = await adminDb
        .from('teams')
        .select('id, name, type, prefecture')
        .order('name')
      return (
        <OnboardingDialog
          employeeId={employee.id}
          email={employee.email}
          defaultName={employee.name}
          teams={allTeams ?? []}
        />
      )
    }
    // 店舗選択済み → 待機画面
    const adminDb = createAdminClient()
    const { data: team } = await adminDb.from('teams').select('name').eq('id', employee.requested_team_id).single()
    const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
    return (
      <PendingScreen
        email={employee.email}
        teamName={team?.name ?? '未設定'}
        systemUrl={systemUrl}
      />
    )
  }

  const role: Role = employee.role as Role

  // viewAs Cookie の処理（manager/admin のみ有効）
  const cookieStore = await cookies()
  const canViewAs = true // 全ロールでView-as可能（閲覧のみ）
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  // viewAs社員取得
  const db = createAdminClient()
  const { data: viewAsEmployee } = viewAsId
    ? await db.from('employees').select('name, role, notifications_read_at').eq('id', viewAsId).single()
    : { data: null }

  // 通知数は view-as 対象社員（なければ自分）で計算
  const notifTargetId = viewAsId ?? employee.id
  const notifReadAt = (viewAsId ? viewAsEmployee?.notifications_read_at : employee.notifications_read_at) ?? '1970-01-01T00:00:00Z'

  const { data: targetAchievements } = await db
    .from('achievements')
    .select('id')
    .eq('employee_id', notifTargetId)
    .eq('status', 'certified')
  const targetAchIds = (targetAchievements ?? []).map(a => a.id)

  const [unreadResult, { data: unreadReactions }, { data: unreadComments }] = await Promise.all([
    role === 'manager' && employee
      ? supabase.from('team_change_requests').select('*', { count: 'exact', head: true })
          .eq('requested_by', employee.id).in('status', ['approved', 'rejected']).is('applicant_read_at', null)
      : Promise.resolve({ count: 0 }),
    targetAchIds.length > 0
      ? db.from('achievement_reactions').select('achievement_id, employee_id')
          .in('achievement_id', targetAchIds).neq('employee_id', notifTargetId).gt('created_at', notifReadAt)
      : Promise.resolve({ data: [] }),
    targetAchIds.length > 0
      ? db.from('achievement_comments').select('achievement_id, employee_id')
          .in('achievement_id', targetAchIds).neq('employee_id', notifTargetId).gt('created_at', notifReadAt)
      : Promise.resolve({ data: [] }),
  ])
  const unreadRequestCount = (unreadResult as { count: number | null }).count ?? 0
  // 同じ achievement_id + employee_id をまとめてカウント
  const notifKeys = new Set<string>()
  for (const r of unreadReactions ?? []) notifKeys.add(`${r.employee_id}:${r.achievement_id}`)
  for (const c of unreadComments ?? []) notifKeys.add(`${c.employee_id}:${c.achievement_id}`)
  const unreadNotifCount = notifKeys.size

  // BottomNav は viewAs 社員のロールで表示を切り替える
  const effectiveRole: Role = (viewAsEmployee?.role as Role | undefined) ?? role

  // 差し戻しスキル件数
  const targetEmpId = viewAsId ?? employee.id
  const { count: rejectedSkillCount } = await createAdminClient()
    .from('achievements')
    .select('*', { count: 'exact', head: true })
    .eq('employee_id', targetEmpId)
    .eq('status', 'rejected')

  // 承認待ち合計（スキル認定 + チーム変更 + 参加許諾）
  // store_manager/manager は自分の管理チームのみ、admin以上は全件
  const approvalRoles: Role[] = ['store_manager', 'manager', 'admin', 'ops_manager', 'executive']
  let pendingApprovalCount = 0
  if (approvalRoles.includes(effectiveRole)) {
    const adminDb = createAdminClient()
    const isSystemAdmin = ['admin', 'ops_manager', 'executive'].includes(effectiveRole)
    const effectiveEmpId = viewAsId ?? employee.id

    if (isSystemAdmin) {
      const [skillCount, teamCount, joinCount] = await Promise.all([
        adminDb.from('achievements').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        adminDb.from('team_change_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        adminDb.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'pending').not('requested_team_id', 'is', null),
      ])
      pendingApprovalCount = (skillCount.count ?? 0) + (teamCount.count ?? 0) + (joinCount.count ?? 0)
    } else {
      // store_manager / manager: 管理チームのメンバーのみ
      const { data: managed } = await adminDb.from('team_managers').select('team_id').eq('employee_id', effectiveEmpId)
      const managedTeamIds = (managed ?? []).map(m => m.team_id)
      if (managedTeamIds.length > 0) {
        const { data: members } = await adminDb.from('team_members').select('employee_id').in('team_id', managedTeamIds)
        const managedMemberIds = [...new Set((members ?? []).map(m => m.employee_id))]
        if (managedMemberIds.length > 0) {
          const [skillCount, teamCount, joinCount] = await Promise.all([
            adminDb.from('achievements').select('*', { count: 'exact', head: true }).eq('status', 'pending').in('employee_id', managedMemberIds),
            adminDb.from('team_change_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending').in('team_id', managedTeamIds),
            adminDb.from('employees').select('*', { count: 'exact', head: true }).eq('status', 'pending').not('requested_team_id', 'is', null).in('requested_team_id', managedTeamIds),
          ])
          pendingApprovalCount = (skillCount.count ?? 0) + (teamCount.count ?? 0) + (joinCount.count ?? 0)
        }
      }
    }
  }

  // ダッシュボードバッジ: 遅れスキル / 次のステップ
  let dashboardBadge: { count: number; color: 'red' | 'blue' } | null = null
  {
    const targetId = viewAsId ?? employee.id
    const adminDb = createAdminClient()

    // 社員が参加するプロジェクト取得（project_teams経由）
    const { data: tRows } = await adminDb.from('team_members').select('team_id').eq('employee_id', targetId)
    const { data: mRows } = await adminDb.from('team_managers').select('team_id').eq('employee_id', targetId)
    const tIds = [...new Set([...(tRows ?? []).map(r => r.team_id), ...(mRows ?? []).map(r => r.team_id)])]
    if (tIds.length > 0) {
      const { data: ptRows } = await adminDb.from('project_teams').select('project_id').in('team_id', tIds)
      const projIds = [...new Set((ptRows ?? []).map(r => r.project_id))]
      if (projIds.length > 0) {
        const firstProjId = projIds[0]
        const [{ data: phases }, { data: pSkills }, { data: certAch }, whResult] = await Promise.all([
          adminDb.from('project_phases').select('id, name, order_index, end_hours').eq('project_id', firstProjId).order('order_index'),
          adminDb.from('project_skills').select('skill_id, project_phase_id').eq('project_id', firstProjId),
          adminDb.from('achievements').select('skill_id').eq('employee_id', targetId).eq('status', 'certified'),
          adminDb.rpc('get_employee_cumulative_hours', { p_employee_id: targetId, p_as_of_date: new Date().toISOString().split('T')[0] }),
        ])
        const cumHours = (whResult as { data: number | null }).data ?? 0
        const certifiedSkillIds = new Set((certAch ?? []).map(a => a.skill_id))
        const phaseById = Object.fromEntries((phases ?? []).map(p => [p.id, p]))

        // 遅れスキル: フェーズ目標時間 <= 累計勤務 なのに未取得
        let delayedCount = 0
        let nextCount = 0
        // 現在のフェーズ（累計勤務がまだ到達していないフェーズ）
        const sortedPhases = [...(phases ?? [])].sort((a, b) => a.order_index - b.order_index)
        const currentPhaseIdx = sortedPhases.findIndex(p => cumHours < p.end_hours)

        for (const ps of pSkills ?? []) {
          if (certifiedSkillIds.has(ps.skill_id)) continue
          const phase = phaseById[ps.project_phase_id ?? '']
          if (!phase) continue
          const phaseIdx = sortedPhases.findIndex(p => p.id === phase.id)
          if (cumHours >= phase.end_hours) {
            delayedCount++
          } else if (phaseIdx <= currentPhaseIdx) {
            nextCount++
          }
        }

        if (delayedCount > 0) {
          dashboardBadge = { count: delayedCount, color: 'red' }
        } else if (nextCount > 0) {
          dashboardBadge = { count: nextCount, color: 'blue' }
        }
      }
    }
  }

  return (
    <NotificationCountProvider count={unreadNotifCount}>
      <div className="min-h-screen bg-gray-50" style={viewAsEmployee ? { '--banner-h': '2.5rem' } as React.CSSProperties : undefined}>
        {viewAsEmployee && <ViewAsBanner employeeName={viewAsEmployee.name} />}
        <main className="pb-20 max-w-2xl mx-auto">
          {children}
        </main>
        <BottomNav role={effectiveRole} unreadRequestCount={unreadRequestCount} pendingApprovalCount={pendingApprovalCount} dashboardBadge={dashboardBadge} avatarUrl={employee.avatar_url} employeeId={employee.id} employeeName={employee.name} rejectedSkillCount={rejectedSkillCount ?? 0} />
        <Toaster position="top-center" richColors />
      </div>
    </NotificationCountProvider>
  )
}
