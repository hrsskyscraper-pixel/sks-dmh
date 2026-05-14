import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Messaging API の `GET /v2/bot/profile/{userId}` で友だち追加状態を判定する。
 * - 200: 友だち（プロフィール取得可）→ true
 * - 404: 未追加/ブロック → false
 * - その他 / トークン未設定: 判定不能 → null
 */
async function checkFriendship(lineUserId: string): Promise<boolean | null> {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN
  if (!token) return null
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) return true
    if (res.status === 404) return false
    console.error('[LINE] friendship check 想定外レスポンス:', res.status, await res.text().catch(() => ''))
    return null
  } catch (err) {
    console.error('[LINE] friendship check 失敗:', err)
    return null
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  // baseUrl はリクエスト元のオリジンを使う。
  // - LINE 仕様で、token 交換時の redirect_uri は authorize 時と完全一致が必要
  // - 連携元（クライアント）は window.location.origin で authorize した
  // - したがって callback も同じオリジンを使うのが正解
  // NEXT_PUBLIC_APP_URL（本番URL固定）を使うと preview デプロイで不一致になり 400 になる
  const baseUrl = url.origin

  if (error || !code) {
    console.error('LINE callback error:', error)
    return NextResponse.redirect(`${baseUrl}/?line_error=${encodeURIComponent(error ?? 'no_code')}`)
  }

  // 現在ログイン中の社員を確認
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${baseUrl}/login`)
  }

  const db = createAdminClient()
  const { data: employee } = await db
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()
  if (!employee) {
    return NextResponse.redirect(`${baseUrl}/login`)
  }

  // LINE Login でアクセストークンを取得
  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${baseUrl}/auth/line/callback`,
      client_id: process.env.LINE_LOGIN_CHANNEL_ID ?? '',
      client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET ?? '',
    }),
  })

  if (!tokenRes.ok) {
    const err = await tokenRes.text()
    console.error('LINE token error:', err)
    return NextResponse.redirect(`${baseUrl}/?line_error=token_failed`)
  }

  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token

  // LINE プロフィールを取得して userId を得る
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!profileRes.ok) {
    console.error('LINE profile error:', await profileRes.text())
    return NextResponse.redirect(`${baseUrl}/?line_error=profile_failed`)
  }

  const profile = await profileRes.json()
  const lineUserId = profile.userId

  // 公式アカウントの友だち追加状態を確認（通知が届くかの判定）
  const isFriend = await checkFriendship(lineUserId)

  // employees に line_user_id / line_friend を保存
  const { error: updateError } = await db
    .from('employees')
    .update({ line_user_id: lineUserId, line_friend: isFriend })
    .eq('id', employee.id)

  if (updateError) {
    console.error('LINE userId 保存失敗:', updateError)
    return NextResponse.redirect(`${baseUrl}/?line_error=save_failed`)
  }

  // 友だち未追加（false）なら、友だち追加が必要な旨を案内するパラメータを付ける。
  // isFriend が null（判定不能）の場合は従来通り「連携完了」とだけ伝える。
  const linkedParam = isFriend === false ? 'nofriend' : 'true'
  return NextResponse.redirect(`${baseUrl}/?line_linked=${linkedParam}`)
}
