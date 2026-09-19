import { NextResponse } from 'next/server'

/**
 * Supabase の自動停止よけ（keepalive）
 *
 * 無料プランの Supabase は 1週間アクセスが無いと一時停止するため、Vercel Cron から 1日1回、
 * 対象プロジェクトに軽い読み取りを 1本ずつ流す。対象は「このアプリ自身の DB」と、
 * 環境変数で渡されたステージング DB（未設定なら黙って飛ばす）。
 *
 * - publishable（anon）キーだけを使う。RLS があるので匿名では中身は返らない
 * - レスポンスは成否と HTTP ステータスのみ（データは出さない）
 * - CRON_SECRET が設定されていれば Authorization を検証する（未設定でも動く）
 */
export const dynamic = 'force-dynamic'

type Target = { name: string; url?: string; key?: string }

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const targets: Target[] = [
    { name: 'self', url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    { name: 'staging', url: process.env.STAGING_SUPABASE_URL, key: process.env.STAGING_SUPABASE_ANON_KEY },
  ]

  const checked: { name: string; ok: boolean; status?: number }[] = []
  for (const t of targets) {
    if (!t.url || !t.key) continue
    try {
      const res = await fetch(`${t.url.replace(/\/$/, '')}/rest/v1/skills?select=id&limit=1`, {
        headers: { apikey: t.key, Authorization: `Bearer ${t.key}` },
        cache: 'no-store',
      })
      // 2xx でも 4xx（RLS で拒否）でも、リクエストがプロジェクトに届いていれば停止よけの目的は果たす
      checked.push({ name: t.name, ok: res.status < 500, status: res.status })
    } catch {
      checked.push({ name: t.name, ok: false })
    }
  }

  return NextResponse.json({ ok: checked.every(c => c.ok), checked })
}
