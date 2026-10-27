import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, KeyRound } from 'lucide-react'
import { InAppBrowserWarning } from '@/components/layout/in-app-browser-warning'
import { alreadyRegisteredMessage, CLAIMABLE_PERMISSIONS, ISSUE_EMAIL_DOMAIN } from '@/lib/account-issue'
import { ClaimActions } from './claim-actions'

export const dynamic = 'force-dynamic'

/**
 * 本人用のログインリンク（2026-10-27）。運用管理者が発行した社員データに、本人の Google アカウントをつなぐ。
 * 内容（氏名・区分・店舗・役職）は発行した側が決めていて、本人は確かめて「この内容で参加します」を押すだけ。
 * 公開ページ（未ログインでも開ける）。表示するのは、そのリンクの宛先の氏名・区分・店舗・役職だけ。
 */
export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const db = createAdminClient()

  const shell = (title: string, body: React.ReactNode, icon: 'ok' | 'ng' = 'ng') => (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-red-50 flex items-center justify-center p-4">
      <InAppBrowserWarning />
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-2 ${icon === 'ok' ? 'bg-orange-100' : 'bg-red-100'}`}>
            {icon === 'ok' ? <KeyRound className="w-6 h-6 text-orange-500" /> : <AlertCircle className="w-6 h-6 text-red-500" />}
          </div>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">{body}</CardContent>
      </Card>
    </div>
  )
  const errorScreen = (message: string) => shell('このリンクは使えません', (
    <>
      <p className="text-sm text-gray-600 text-center">{message}</p>
      <Link href="/login"><Button variant="outline" className="w-full">アプリにログイン</Button></Link>
    </>
  ))

  // id は uuid の形でなければ問い合わせない
  if (!/^[0-9a-f-]{36}$/i.test(id)) return errorScreen('リンクが正しくありません。URL をご確認ください。')
  const { data: claim } = await db.from('account_claims').select('id, employee_id, expires_at, used_at, revoked_at').eq('id', id).maybeSingle()
  if (!claim || claim.revoked_at) return errorScreen('このリンクは使えなくなっています。運用管理者に、新しいリンクをお願いしてください。')
  if (claim.used_at) return errorScreen('このリンクは、すでに使われています。ご本人がログイン済みなら、下のボタンからログインしてください。')
  if (new Date(claim.expires_at) < new Date()) return errorScreen('このリンクは期限が切れています。運用管理者に、新しいリンクをお願いしてください。')

  const [{ data: target }, { data: memberRows }] = await Promise.all([
    db.from('employees').select('id, name, auth_user_id, email, system_permission, left_at, employment_type, business_role_ids').eq('id', claim.employee_id).maybeSingle(),
    db.from('team_members').select('team_id').eq('employee_id', claim.employee_id),
  ])
  if (!target) return errorScreen('リンクの宛先が見つかりません。運用管理者にお知らせください。')
  if (target.auth_user_id) return errorScreen('このアカウントは、すでに使われています。運用管理者にお知らせください。')
  // 発行した社員データ（仮のアドレス・開発者以外・在籍中）でなければ使わせない
  if (!target.email.endsWith(`@${ISSUE_EMAIL_DOMAIN}`) || !(CLAIMABLE_PERMISSIONS as readonly string[]).includes(target.system_permission) || target.left_at) {
    return errorScreen('このアカウントは使い始められない状態です。運用管理者にお知らせください。')
  }
  const teamIds = (memberRows ?? []).map(m => m.team_id)
  const roleIds = target.business_role_ids ?? []
  const [{ data: teamRows }, { data: roleRows }] = await Promise.all([
    teamIds.length ? db.from('teams').select('name').in('id', teamIds) : Promise.resolve({ data: [] as { name: string }[] }),
    roleIds.length ? db.from('business_roles').select('id, name, sort_order').in('id', roleIds).order('sort_order') : Promise.resolve({ data: [] as { id: string; name: string; sort_order: number }[] }),
  ])

  if (user) {
    const { data: mine } = await db.from('employees').select('status, left_at').eq('auth_user_id', user.id).maybeSingle()
    if (mine) return errorScreen(alreadyRegisteredMessage(mine) + '。分からないときは、運用管理者にお知らせください。')
  }

  return shell('Mission Board へようこそ', (
    <>
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1.5">
        <p className="text-[11px] text-orange-600 text-center">あなたのアカウント（運用管理者が登録しました）</p>
        <p className="text-base font-semibold text-gray-800 text-center">{target.name} さん</p>
        <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1 text-sm">
          <dt className="text-gray-500">区分</dt><dd className="text-gray-800">{target.employment_type}</dd>
          <dt className="text-gray-500">店舗・部署</dt><dd className="text-gray-800">{(teamRows ?? []).map(t => t.name).join('・') || '—'}</dd>
          <dt className="text-gray-500">役職</dt><dd className="text-gray-800">{(roleRows ?? []).map(r => r.name).join('・') || '—'}</dd>
        </dl>
      </div>
      <ClaimActions claimId={claim.id} name={target.name} loggedInEmail={user?.email ?? null} />
    </>
  ), 'ok')
}
