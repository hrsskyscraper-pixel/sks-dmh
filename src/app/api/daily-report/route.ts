import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRankingExcludedIds } from '@/lib/test-data'
import { ensureDailyReportAnnouncement } from '@/lib/daily-report'

export const dynamic = 'force-dynamic'

/**
 * 毎朝7:00(JST)に Vercel Cron から呼ばれ、前日のデイリーレポートを投稿する。
 * 1日1件の重複防止つき（何度呼ばれても安全）。CRON_SECRET を設定した場合のみ認証を要求する。
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
  }
  const db = createAdminClient()
  const excluded = await getRankingExcludedIds()
  const res = await ensureDailyReportAnnouncement(db, excluded, new Date())
  return NextResponse.json({ ok: true, ...res })
}
