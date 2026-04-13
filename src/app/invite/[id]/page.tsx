import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, AlertCircle, CheckCircle } from 'lucide-react'
import { AcceptInvitationButton } from './accept-button'
import { InAppBrowserWarning } from '@/components/layout/in-app-browser-warning'
import { WelcomeContent } from './welcome-content'

export const dynamic = 'force-dynamic'

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ preview?: string }>
}) {
  const { id } = await params
  const sp = searchParams ? await searchParams : undefined
  const isPreview = sp?.preview === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const db = createAdminClient()

  // 招待取得
  const { data: inv } = await db
    .from('team_invitations')
    .select('id, team_id, project_team_id, invited_by, target_employee_id, custom_message, expires_at, used_at, as_manager')
    .eq('id', id)
    .maybeSingle()

  // 自分のemployeeレコード取得（未ログイン時は null）
  type MeRow = { id: string; name: string; last_name: string; first_name: string; status: 'pending' | 'approved' }
  let me: MeRow | null = null
  if (user) {
    const { data } = await db
      .from('employees')
      .select('id, name, last_name, first_name, status')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    me = (data ?? null) as MeRow | null
  }

  const errorScreen = (message: string) => (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-2">
            <AlertCircle className="w-6 h-6 text-red-500" />
          </div>
          <CardTitle className="text-lg">招待を開けませんでした</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-600 text-center">{message}</p>
          <Link href="/">
            <Button className="w-full">ホームへ戻る</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )

  if (!inv) return errorScreen('招待が見つかりません。URLをご確認ください。')
  if (inv.used_at) return errorScreen('この招待は既に使用済みです。')
  if (new Date(inv.expires_at) < new Date()) return errorScreen('この招待は期限切れです。')

  // 未ログイン または プレビューモード: ウェルカムページを表示
  if (!user || isPreview) {
    const [welcomeTeamRes, welcomeProjectTeamRes, welcomeInviterRes] = await Promise.all([
      db.from('teams').select('id, name, type').eq('id', inv.team_id).single(),
      inv.project_team_id
        ? db.from('teams').select('name').eq('id', inv.project_team_id).single()
        : Promise.resolve({ data: null }),
      db.from('employees').select('name').eq('id', inv.invited_by).single(),
    ])
    const welcomeTeam = welcomeTeamRes.data
    if (!welcomeTeam) return errorScreen('招待先のチーム情報が取得できませんでした。')
    return (
      <>
        <InAppBrowserWarning />
        <WelcomeContent
          invitationId={id}
          inviterName={welcomeInviterRes.data?.name ?? '管理者'}
          teamName={welcomeTeam.name}
          projectTeamName={welcomeProjectTeamRes.data?.name ?? undefined}
          customMessage={inv.custom_message ?? undefined}
          asManager={inv.as_manager}
          previewMode={isPreview}
        />
      </>
    )
  }

  // フェーズ1（特定メンバー宛）: 他人が開いた場合は拒否
  if (inv.target_employee_id && me && inv.target_employee_id !== me.id) {
    return errorScreen('この招待はあなた宛ではありません。')
  }
  // target_employee_id 付き招待は未登録者のリンク流用を防ぐため、employees レコード必須
  if (inv.target_employee_id && !me) {
    return errorScreen('この招待はあなた宛ではありません。')
  }

  // 未アプリ参加者 or pending ユーザーを自動承認（フェーズ2: target_employee_id なしの招待）
  if (!me) {
    // employees レコード未作成 → Googleメタデータから自動作成（status=approved）
    const fullName = (user.user_metadata.full_name as string | undefined) ?? user.email ?? '未設定'
    const nameParts = fullName.split(' ')
    const { data: created, error: createError } = await db
      .from('employees')
      .insert({
        auth_user_id: user.id,
        last_name: nameParts[0],
        first_name: nameParts.slice(1).join(' ') || '',
        email: user.email ?? '',
        role: 'employee',
        employment_type: '社員',
        avatar_url: (user.user_metadata.avatar_url as string | undefined) ?? null,
        status: 'approved',
        requested_team_id: inv.team_id,
        requested_project_team_id: inv.project_team_id,
        approved_by: inv.invited_by,
        approved_at: new Date().toISOString(),
      })
      .select('id, name, last_name, first_name, status')
      .single()
    if (createError || !created) return errorScreen('アカウント作成に失敗しました: ' + (createError?.message ?? ''))
    me = created
  } else if (me.status === 'pending') {
    // 既にレコードあるが pending → 自動承認
    const { data: updated } = await db
      .from('employees')
      .update({
        status: 'approved',
        requested_team_id: inv.team_id,
        requested_project_team_id: inv.project_team_id,
        approved_by: inv.invited_by,
        approved_at: new Date().toISOString(),
      })
      .eq('id', me.id)
      .select('id, name, last_name, first_name, status')
      .single()
    if (updated) me = updated
  }

  if (!me) return errorScreen('ユーザー情報の取得・作成に失敗しました')

  // チーム・招待者情報
  const [teamRes, projectTeamRes, inviterRes] = await Promise.all([
    db.from('teams').select('id, name, type').eq('id', inv.team_id).single(),
    inv.project_team_id
      ? db.from('teams').select('id, name').eq('id', inv.project_team_id).single()
      : Promise.resolve({ data: null }),
    db.from('employees').select('id, name').eq('id', inv.invited_by).single(),
  ])
  const team = teamRes.data
  const projectTeam = projectTeamRes.data
  const inviter = inviterRes.data

  if (!team) return errorScreen('招待先のチーム情報が取得できませんでした。')

  // 既に所属？
  const [{ data: existingMember }, { data: existingManager }] = await Promise.all([
    db.from('team_members').select('team_id').eq('team_id', inv.team_id).eq('employee_id', me.id).maybeSingle(),
    db.from('team_managers').select('team_id').eq('team_id', inv.team_id).eq('employee_id', me.id).maybeSingle(),
  ])
  // リーダー招待: 既にリーダー登録済みなら「既に所属」。メンバーに留まっている場合は昇格できるので false
  // メンバー招待: メンバーでもリーダーでも「既に所属」扱い
  const alreadyJoined = inv.as_manager
    ? !!existingManager
    : !!(existingMember || existingManager)

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <InAppBrowserWarning />
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <Mail className="w-6 h-6 text-orange-500" />
          </div>
          <CardTitle className="text-lg">
            チーム{inv.as_manager ? 'リーダー' : '参加'}の招待
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <span className="font-medium">{inviter?.name ?? '管理者'}</span>さんから、
              以下のチームへの
              <span className="font-medium text-orange-600">
                {inv.as_manager ? 'リーダー（副）' : 'メンバー'}
              </span>
              参加依頼が届いています。
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1">
            <p className="text-[10px] text-orange-600 font-medium">
              参加先（{inv.as_manager ? 'リーダー（副）' : 'メンバー'}として）
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {team.type === 'store' ? '🏢' : team.type === 'department' ? '🏛️' : '👥'} {team.name}
            </p>
            {projectTeam && (
              <p className="text-xs text-gray-600">チーム: {projectTeam.name}</p>
            )}
          </div>

          {inv.custom_message && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] text-gray-500 font-medium mb-1">メッセージ</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{inv.custom_message}</p>
            </div>
          )}

          {alreadyJoined ? (
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">既にこのチームに所属しています</span>
            </div>
          ) : (
            <AcceptInvitationButton
              invitationId={id}
              asManager={inv.as_manager}
              initialLastName={me.last_name}
              initialFirstName={me.first_name}
            />
          )}

          <Link href="/">
            <Button variant="outline" className="w-full">ホームへ戻る</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
