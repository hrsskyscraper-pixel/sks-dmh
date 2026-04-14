import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/'
  // オープンリダイレクト防止: 相対パス（/abc）のみ許可、//evil.com など外部URLは弾く
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    const msg = encodeURIComponent(error.message ?? 'unknown')
    return NextResponse.redirect(`${origin}/login?error=${msg}`)
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
