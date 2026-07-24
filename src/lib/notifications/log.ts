import { createAdminClient } from '@/lib/supabase/admin'

export type NotificationChannel = 'email' | 'line'
export type NotificationStatus = 'success' | 'failed'

/**
 * 通知（メール・LINE）の送信結果を notification_log に記録する。
 * 失敗の可視化用。ログ書き込み自体の失敗は握りつぶす（通知処理を止めない）。
 */
export async function logNotification(params: {
  category: string
  channel: NotificationChannel
  recipient: string
  subject?: string
  status: NotificationStatus
  error?: string
}): Promise<void> {
  try {
    const db = createAdminClient()
    await db.from('notification_log').insert({
      category: params.category,
      channel: params.channel,
      recipient: params.recipient,
      subject: params.subject ?? null,
      status: params.status,
      error: params.error ?? null,
    })
  } catch (e) {
    console.error('[通知ログ] 記録失敗:', e)
  }
}
