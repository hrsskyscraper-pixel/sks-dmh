'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { setEmailNotificationsEnabled, setLineNotificationsEnabled, setOpsTeamRecipientIds, setQaModeratorIds } from '@/lib/settings'
import { writeAuditLog } from '@/lib/audit'

/**
 * メール通知の一括スイッチを切り替える。
 * システム管理者（運用管理者・開発者）のみ実行可能。誰がいつ切り替えたかは監査ログに残す。
 */
export async function toggleEmailNotifications(enabled: boolean): Promise<{ error?: string }> {
  const me = await getRealEmployee()
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

/** LINE通知の一括スイッチ（メールと同じ扱い）。システム管理者のみ。監査ログに残す。 */
export async function toggleLineNotifications(enabled: boolean): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  const { error } = await setLineNotificationsEnabled(enabled, me.id)
  if (error) return { error: '設定の保存に失敗しました' }
  await writeAuditLog({
    action: enabled ? 'line_notifications_enabled' : 'line_notifications_disabled',
    actorId: me.id,
    details: { enabled },
  }).catch(console.error)
  revalidatePath('/admin/settings')
  return {}
}

/** 改善提案・Q&A の通知先（運営チーム）。システム管理者のみ。 */
export async function setOpsTeamRecipients(ids: string[]): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  // UUID の形で、承認済みの社員に当たる ID だけを残す（画面を通さずに呼ばれても、存在しない人・承認前の人を入れない）
  const asked = [...new Set(ids.filter(x => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)))].slice(0, 50)
  const { data: ok } = asked.length > 0
    ? await createAdminClient().from('employees').select('id').in('id', asked).eq('status', 'approved')
    : { data: [] as { id: string }[] }
  const clean = asked.filter(id => (ok ?? []).some(e => e.id === id))
  const { error } = await setOpsTeamRecipientIds(clean, me.id)
  if (error) return { error: '設定の保存に失敗しました' }
  await writeAuditLog({ action: 'ops_team_recipients_updated', actorId: me.id, details: { ids: clean } }).catch(console.error)
  revalidatePath('/admin/settings')
  return {}
}

/** Q&A の投稿を非表示にできる人（2026-10-21 原島さん確定 A-8）。システム管理者のみ。 */
export async function setQaModerators(ids: string[]): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  // 候補（運用管理者・開発者）に当たる ID だけを残す（画面を通さずに呼ばれても、権限のない人を入れない）
  const asked = [...new Set(ids.filter(x => typeof x === 'string' && /^[0-9a-f-]{36}$/.test(x)))].slice(0, 50)
  const { data: ok } = asked.length > 0
    ? await createAdminClient().from('employees').select('id').in('id', asked).eq('status', 'approved').in('system_permission', ['ops_admin', 'developer'])
    : { data: [] as { id: string }[] }
  const clean = asked.filter(id => (ok ?? []).some(e => e.id === id))
  const { error } = await setQaModeratorIds(clean, me.id)
  if (error) return { error: '設定の保存に失敗しました' }
  await writeAuditLog({ action: 'qa_moderators_updated', actorId: me.id, details: { ids: clean } }).catch(console.error)
  revalidatePath('/admin/settings')
  return {}
}
