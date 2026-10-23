'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { getGradeWageUps, setEmailNotificationsEnabled, setGradeWageUps, setLineNotificationsEnabled, setOpsTeamRecipientIds, setQaModeratorIds, setSeniorReview, getSeniorReviewSetting } from '@/lib/settings'
import { writeAuditLog } from '@/lib/audit'
import { notLeftFilter } from '@/lib/left'

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

/**
 * 管理者（MG・AC・課長など）の申請を承認する人（2026-10-23 原島さん確定 B-④-3）。システム管理者のみ。
 * roleIds は役職マスタにあるものだけ、approverIds は運用管理者・開発者だけを残す。
 */
export async function saveSeniorReview(roleIds: string[], approverIds: string[]): Promise<{ error?: string; roleIds?: string[]; approverIds?: string[] }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const ids = (xs: unknown) => Array.isArray(xs) ? [...new Set(xs.filter((x): x is string => typeof x === 'string' && UUID.test(x)).map(x => x.toLowerCase()))] : []
  const askedRoles = ids(roleIds)
  const askedApprovers = ids(approverIds)
  if (askedRoles.length > 50 || askedApprovers.length > 50) return { error: '選べるのは50件までです' }
  const db = createAdminClient()
  const [rolesRes, empsRes] = await Promise.all([
    askedRoles.length > 0 ? db.from('business_roles').select('id').in('id', askedRoles) : Promise.resolve({ data: [] as { id: string }[], error: null }),
    askedApprovers.length > 0
      ? db.from('employees').select('id').in('id', askedApprovers).eq('status', 'approved').in('system_permission', ['ops_admin', 'developer']).or(notLeftFilter())
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ])
  // 確かめられないまま保存すると、選んだ人が消えて制限が黙って外れる。失敗したら保存しない
  if (rolesRes.error || empsRes.error) return { error: '確認に失敗しました。時間をおいてもう一度お試しください' }
  const cleanRoles = askedRoles.filter(id => (rolesRes.data ?? []).some(r => r.id === id))
  const cleanApprovers = askedApprovers.filter(id => (empsRes.data ?? []).some(e => e.id === id))
  if (cleanRoles.length !== askedRoles.length || cleanApprovers.length !== askedApprovers.length) {
    return { error: '選べない役職か人が含まれています（運用管理者・開発者ではない、退職したなど）。画面を開き直してください' }
  }
  const before = await getSeniorReviewSetting()
  const { error } = await setSeniorReview(cleanRoles, cleanApprovers, me.id)
  if (error) return { error: '設定の保存に失敗しました' }
  await writeAuditLog({
    action: 'senior_review_updated',
    actorId: me.id,
    details: { roleIds: cleanRoles, approverIds: cleanApprovers, before: { roleIds: before.roleIds, approverIds: before.approverIds } },
  }).catch(console.error)
  revalidatePath('/admin/settings')
  return { roleIds: cleanRoles, approverIds: cleanApprovers }
}

/** 級ごとの上がる金額（時給アップの演出。2026-10-22 原島さん確定）。システム管理者のみ。キーは社内資格のマスタにある名前だけ */
export async function saveGradeWageUps(input: Record<string, number>): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: '入力が正しくありません' }
  const { data: certs } = await createAdminClient().from('certifications').select('name')
  const names = new Set((certs ?? []).map(c => c.name))
  // 画面に出していない級（無効にした資格など）の金額は消さずに残す
  const current = await getGradeWageUps()
  const clean: Record<string, number> = Object.fromEntries(Object.entries(current).filter(([k]) => !(k in input)))
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

