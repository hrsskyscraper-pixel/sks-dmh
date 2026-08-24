'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { setEmailNotificationsEnabled } from '@/lib/settings'
import { writeAuditLog } from '@/lib/audit'

/**
 * メール通知の一括スイッチを切り替える。
 * システム管理者（運用管理者・開発者）のみ実行可能。誰がいつ切り替えたかは監査ログに残す。
 */
export async function toggleEmailNotifications(enabled: boolean): Promise<{ error?: string }> {
  const me = await getCurrentEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }

  const { error } = await setEmailNotificationsEnabled(enabled, me.id)
  if (error) return { error: '設定の保存に失敗しました' }

  await writeAuditLog({
    action: enabled ? 'email_notifications_enabled' : 'email_notifications_disabled',
    actorId: me.id,
    details: { enabled },
  }).catch(console.error)

  revalidatePath('/admin/settings')
  return {}
}
