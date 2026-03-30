import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/admin/settings?line_error=${encodeURIComponent(error ?? 'no_code')}`)
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
    return NextResponse.redirect(`${baseUrl}/admin/settings?line_error=token_failed`)
  }

  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token

  // LINE プロフィールを取得して userId を得る
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!profileRes.ok) {
    return NextResponse.redirect(`${baseUrl}/admin/settings?line_error=profile_failed`)
  }

  const profile = await profileRes.json()
  const lineUserId = profile.userId

  // employees に line_user_id を保存
  const { error: updateError } = await db
    .from('employees')
    .update({ line_user_id: lineUserId })
    .eq('id', employee.id)

  if (updateError) {
    console.error('LINE userId 保存失敗:', updateError)
    return NextResponse.redirect(`${baseUrl}/admin/settings?line_error=save_failed`)
  }

  return NextResponse.redirect(`${baseUrl}/admin/settings?line_linked=true`)
}
