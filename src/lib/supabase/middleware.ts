import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // 未認証ユーザーをログインページへリダイレクト
  // 公開ページ（/privacy, /terms, /invite, /help）は除外
  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth') &&
    !pathname.startsWith('/privacy') &&
    !pathname.startsWith('/terms') &&
    !pathname.startsWith('/invite/')
  ) {
    const url = request.nextUrl.clone()
    // 元のパス（クエリ含む）を next として保持し、ログイン後に復帰できるようにする
    const next = pathname + (request.nextUrl.search || '')
    url.pathname = '/login'
    url.search = ''
    // ルート直下は復帰不要、また不正な値（外部URL等）は弾く
    if (next.startsWith('/') && !next.startsWith('//') && next !== '/') {
      url.searchParams.set('next', next)
    }
    return NextResponse.redirect(url)
  }

  // 認証済みユーザーがログインページにアクセスしたらトップへ
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
