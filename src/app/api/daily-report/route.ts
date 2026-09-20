import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRankingExcludedIds } from '@/lib/test-data'
import { ensureDailyReportAnnouncement } from '@/lib/daily-report'
import { getStalledApprovals } from '@/lib/stalled-approvals'

export const dynamic = 'force-dynamic'

/**
 * 毎朝7:00(JST)に Vercel Cron から呼ばれ、前日のデイリーレポートを投稿する。
 * 1日1件の重複防止つき（何度呼ばれても安全）。CRON_SECRET を設定した場合のみ認証を要求する。
 *
 * 承認の滞留は、レポート本文（店舗ごと・承認者名つき）とアプリ内（ベルの要対応・ログイン時のモーダル）で知らせる。
 * メール・LINE のリマインドは送らない（2026-09-19 MTG 決定: 申請・未承認・承認完了の通知は不要。
 * 毎日 MB を開く習慣を目指す。LINE の無料枠（月200通）を承認者数×日数で使い切る実害もある）。
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
  const now = new Date()
  const stalled = await getStalledApprovals(db, now, excluded).catch(err => { console.error('滞留集計に失敗:', err); return null })
  const res = await ensureDailyReportAnnouncement(db, excluded, now, stalled ?? undefined)
  return NextResponse.json({ ok: true, ...res, stalled: stalled?.total ?? 0 })
}
