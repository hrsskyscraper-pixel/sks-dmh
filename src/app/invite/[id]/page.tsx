import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Mail, AlertCircle, CheckCircle } from 'lucide-react'
import { AcceptInvitationButton } from './accept-button'

export const dynamic = 'force-dynamic'

export default async function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${id}`)}`)
  }

  const db = createAdminClient()

  // 招待取得
  const { data: inv } = await db
    .from('team_invitations')
    .select('id, team_id, project_team_id, invited_by, target_employee_id, custom_message, expires_at, used_at')
    .eq('id', id)
    .maybeSingle()

  // 自分のemployeeレコード取得
  const { data: me } = await db
    .from('employees')
    .select('id, name, status')
    .eq('auth_user_id', user.id)
    .maybeSingle()

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
  if (!me) return errorScreen('ユーザー情報が取得できません。')
  if (inv.used_at) return errorScreen('この招待は既に使用済みです。')
  if (new Date(inv.expires_at) < new Date()) return errorScreen('この招待は期限切れです。')
  if (inv.target_employee_id && inv.target_employee_id !== me.id) {
    return errorScreen('この招待はあなた宛ではありません。')
  }
  if (me.status !== 'approved') {
    return errorScreen('アカウントがまだ承認されていません。管理者の承認をお待ちください。')
  }

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
  const alreadyJoined = !!(existingMember || existingManager)

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <Mail className="w-6 h-6 text-orange-500" />
          </div>
          <CardTitle className="text-lg">チーム参加の招待</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-gray-700 space-y-2">
            <p>
              <span className="font-medium">{inviter?.name ?? '管理者'}</span>さんから、
              以下のチームへの参加依頼が届いています。
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1">
            <p className="text-[10px] text-orange-600 font-medium">参加先</p>
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
            <AcceptInvitationButton invitationId={id} />
          )}

          <Link href="/">
            <Button variant="outline" className="w-full">ホームへ戻る</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
