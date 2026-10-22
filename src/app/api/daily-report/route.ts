import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRankingExcludedIds } from '@/lib/test-data'
import { ensureDailyReportAnnouncement } from '@/lib/daily-report'
import { getStalledApprovals } from '@/lib/stalled-approvals'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessage } from '@/lib/notifications/line'

export const dynamic = 'force-dynamic'

/**
 * 毎朝7:00(JST)に Vercel Cron から呼ばれ、前日のデイリーレポートを投稿する。
 * 1日1件の重複防止つき（何度呼ばれても安全）。CRON_SECRET を設定した場合のみ認証を要求する。
 *
 * 承認の滞留は、レポート本文（店舗ごと・承認者名つき）とアプリ内（ベルの要対応・ログイン時のモーダル）で知らせる。
 * 承認者本人へのメール・LINE のリマインドも送れる状態にしてあるが、運用は「設定 → メール通知／LINE通知」の
 * 一括スイッチで止めておく（2026-09-20 須貝さん決定。会議では通知は不要としたため）。スイッチが休止中なら送信側で止まる。
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

  // 承認者本人へのリマインド（メール・LINE）。デイリーレポートを投稿した日（1日1回）だけ＝何度呼ばれても二重送信しない。
  // 一括休止中は sendMail / sendLineMessage 側で送らずに終わる（notification_log に「送信せず」が残る）。
  let reminded = 0
  if (res.posted && stalled && stalled.byApprover.length > 0) {
    const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
    for (const a of stalled.byApprover) {
      const lines = a.items
        .sort((x, y) => y.days - x.days)
        .slice(0, 10)
        .map(it => `・${it.employeeName}さん「${it.skillName}」（${it.days}日経過）`)
      const more = a.items.length > 10 ? `\n・…ほか${a.items.length - 10}件` : ''
      const text = `${a.name} 様\n\n承認待ちの申請が ${a.count}件 あります（申請の翌日中に承認されていないもの）。\n${lines.join('\n')}${more}\n\n承認センター: ${systemUrl}/approvals?approver=${a.approverId}\n\nMission Board`
      if (a.email) {
        await sendMail({ to: a.email, subject: `【Mission Board】承認待ちの申請が ${a.count}件あります`, body: text }).catch(err => console.error('滞留リマインドメール失敗:', err))
      }
      if (a.lineUserId) {
        await sendLineMessage(a.lineUserId, `【承認のお願い】\n${text}`).catch(err => console.error('滞留リマインドLINE失敗:', err))
      }
      reminded++
    }
  }
  return NextResponse.json({ ok: true, ...res, stalled: stalled?.total ?? 0, reminded })
}
