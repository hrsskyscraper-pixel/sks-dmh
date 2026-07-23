export const dynamic = 'force-dynamic'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAuthUser, getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { BottomNav } from '@/components/layout/nav'
import { Toaster } from '@/components/ui/sonner'
import { ViewAsBanner } from '@/components/layout/view-as-banner'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { createAdminClient } from '@/lib/supabase/admin'
import { NavDataProvider } from '@/components/layout/nav-data-context'
import { CertRingProvider } from '@/components/layout/cert-ring-context'
import { getCertRanksByEmployee } from '@/lib/cert-ranks'
import { OnboardingDialog } from '@/components/onboarding/onboarding-dialog'
import { IntroGuideDialog } from '@/components/onboarding/intro-guide-dialog'
import { PendingScreen } from '@/components/onboarding/pending-screen'
import { InviteRequiredScreen } from '@/components/onboarding/invite-required-screen'
import { JoinCompletionBanner } from '@/components/onboarding/join-completion-banner'
import { canAdminister, isTrainingLeader } from '@/lib/permissions'
import { MemberLinkProvider } from '@/components/layout/member-link-context'
import { LineLinkFloatingButton } from '@/components/layout/line-link-floating-button'
import { FontScaleSync } from '@/components/layout/font-scale-sync'
import { normalizeFontScale } from '@/lib/font-scale'
import type { Role } from '@/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const employeeRaw = await getCurrentEmployee()

  // 初回登録は招待リンク経由のみ。レコードが無い＝未招待のログイン → アプリには入れない。
  // （招待リンクを開くと invite/[id] 側で承認待ちレコードが作成される）
  if (!employeeRaw) {
    return <InviteRequiredScreen email={user.email ?? ''} />
  }
  let employee = employeeRaw

  // 既存ユーザーでavatar_url未設定の場合、Googleの写真を自動設定
  if (!employee.avatar_url && user.user_metadata.avatar_url) {
    const adminDb = createAdminClient()
    const googleAvatar = user.user_metadata.avatar_url as string
    await adminDb.from('employees').update({ avatar_url: googleAvatar }).eq('id', employee.id)
    employee = { ...employee, avatar_url: googleAvatar }
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
    ? await db.from('employees').select('name, role, system_permission, notifications_read_at').eq('id', viewAsId).single()
    : { data: null }

  // BottomNav は viewAs 社員のロールで表示を切り替える
  const effectiveRole: Role = (viewAsEmployee?.role as Role | undefined) ?? role

  // 文字サイズは「自分の」表示設定なので、view-as 対象ではなくログイン本人の値を使う
  const fontScale = normalizeFontScale(employee.font_scale)

  // 「承認済みだが所属0」= 招待リンクで「参加する」を押さず離脱した人を検知し、
  // 参加完了を促すバナーを出す。運用管理者は店舗所属が無くても正常なので除外。
  let joinCompletionTeamName: string | null = null
  if (!canAdminister(employee) && employee.requested_team_id) {
    const [{ data: tmRows }, { data: tgRows }] = await Promise.all([
      db.from('team_members').select('team_id').eq('employee_id', employee.id).limit(1),
      db.from('team_managers').select('team_id').eq('employee_id', employee.id).limit(1),
    ])
    if ((tmRows ?? []).length === 0 && (tgRows ?? []).length === 0) {
      const { data: t } = await db.from('teams').select('name').eq('id', employee.requested_team_id).single()
      joinCompletionTeamName = t?.name ?? null
    }
  }

  // バッジ系のカウント（通知・承認待ち・遅れ等）はここでは取得しない。
  // 以前は毎遷移で 16〜23 クエリ＋RPC を直列実行してページ描画をブロックしていた。
  // NavDataProvider が描画後にクライアントから getNavCounts() を呼び、非同期で差し込む。
  const certRanks = await getCertRanksByEmployee()

  return (
    <NavDataProvider>
      <CertRingProvider ranks={certRanks}>
      <FontScaleSync scale={fontScale} />
      <div className="min-h-screen bg-gray-50" style={viewAsEmployee ? { '--banner-h': '2.5rem' } as React.CSSProperties : undefined}>
        {viewAsEmployee && <ViewAsBanner employeeName={viewAsEmployee.name} />}
        {joinCompletionTeamName && !viewAsEmployee && (
          <JoinCompletionBanner
            teamName={joinCompletionTeamName}
            defaultLastName={employee.last_name}
            defaultFirstName={employee.first_name}
            defaultNameKana={employee.name_kana}
          />
        )}
        <main className="pb-20 max-w-2xl mx-auto">
          <MemberLinkProvider canView={canAdminister(employee) || isTrainingLeader(employee)}>
            {children}
          </MemberLinkProvider>
        </main>
        <LineLinkFloatingButton isLinked={!!employee.line_user_id} friendLinked={employee.line_friend === true} />
        {employee.role !== 'testuser' && !viewAsEmployee && (
          <IntroGuideDialog employeeId={employee.id} dismissed={!!employee.intro_dismissed_at} />
        )}
        <BottomNav role={effectiveRole} avatarUrl={employee.avatar_url} employeeId={employee.id} employeeName={employee.name} fontScale={fontScale} />
        <Toaster position="top-center" richColors />
      </div>
      </CertRingProvider>
    </NavDataProvider>
  )
}
