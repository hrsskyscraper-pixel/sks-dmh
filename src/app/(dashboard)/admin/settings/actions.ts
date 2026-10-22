'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { setEmailNotificationsEnabled, setGradeWageUps, setLineNotificationsEnabled, setOpsTeamRecipientIds, setQaModeratorIds } from '@/lib/settings'
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

/** 級ごとの上がる金額（時給アップの演出。2026-10-22 原島さん確定）。システム管理者のみ。キーは社内資格のマスタにある名前だけ */
export async function saveGradeWageUps(input: Record<string, number>): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: '入力が正しくありません' }
  const { data: certs } = await createAdminClient().from('certifications').select('name')
  const names = new Set((certs ?? []).map(c => c.name))
  const clean: Record<string, number> = {}
  for (const [k, v] of Object.entries(input)) {
    if (!names.has(k)) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10000) return { error: `${k} の金額は 0〜10,000 円で入力してください` }
    if (Math.round(v) > 0) clean[k] = Math.round(v)
  }
  const { error } = await setGradeWageUps(clean, me.id)
  if (error) return { error: '設定の保存に失敗しました' }
  await writeAuditLog({ action: 'grade_wage_ups_updated', actorId: me.id, details: { map: clean } }).catch(console.error)
  revalidatePath('/admin/settings')
  return {}
}

