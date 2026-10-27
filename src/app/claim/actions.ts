'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { createWelcomeAnnouncement } from '@/lib/announcements'
import { alreadyRegisteredMessage, CLAIMABLE_PERMISSIONS, ISSUE_EMAIL_DOMAIN } from '@/lib/account-issue'

/**
 * 本人用のログインリンクで、ログイン中の Google アカウントを、運用管理者が発行した社員データにつなぐ（2026-10-27）。
 * - リンクは1回だけ。取り消し・期限切れ・使用済みは断る
 * - つなげるのは「発行した社員データ」（仮のアドレス・メンバーかリーダー・在籍中・まだだれにもつながっていない）だけ
 * - この Google アカウントが、すでに別の社員データにつながっていれば断る（アカウントの重複を作らない）
 */
export async function claimAccount(claimId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'ログインしてから、もう一度お試しください' }
  if (!user.email) return { error: 'Google アカウントのメールアドレスを読めませんでした' }

  const db = createAdminClient()
  const { data: claim } = await db.from('account_claims').select('id, employee_id, expires_at, used_at, revoked_at').eq('id', claimId).maybeSingle()
  if (!claim || claim.revoked_at) return { error: 'このリンクは使えません。運用管理者に、新しいリンクをお願いしてください' }
  if (claim.used_at) return { error: 'このリンクは、すでに使われています' }
  if (new Date(claim.expires_at) < new Date()) return { error: 'このリンクは期限が切れています。運用管理者に、新しいリンクをお願いしてください' }

  const [{ data: mine }, { data: sameEmail }] = await Promise.all([
    db.from('employees').select('id, status, left_at').eq('auth_user_id', user.id).maybeSingle(),
    db.from('employees').select('id').ilike('email', user.email.replace(/[\\%_]/g, c => '\\' + c)).neq('id', claim.employee_id).limit(1).maybeSingle(),
  ])
  if (mine) return { error: alreadyRegisteredMessage(mine) }
  if (sameEmail) return { error: 'このメールアドレスは、ほかの方の登録に使われています。運用管理者にお知らせください' }

  // 先にリンクを使用済みにする（同時に2回押されても、つなぐのは1回だけ）
  const now = new Date().toISOString()
  const { data: used } = await db.from('account_claims').update({ used_at: now })
    .eq('id', claim.id).is('used_at', null).is('revoked_at', null).gt('expires_at', now).select('id')
  if (!used || used.length === 0) return { error: 'このリンクは、すでに使われているか、期限が切れています' }

  const { data: linked, error } = await db.from('employees').update({
    auth_user_id: user.id,
    email: user.email,
    avatar_url: (user.user_metadata.avatar_url as string | undefined) ?? null,
    last_login_at: now,
    updated_at: now,
  }).eq('id', claim.employee_id).is('auth_user_id', null).is('left_at', null)
    .like('email', `%@${ISSUE_EMAIL_DOMAIN}`).in('system_permission', [...CLAIMABLE_PERMISSIONS]).select('id')
  if (error || !linked || linked.length === 0) {
    // つなげなかったので、自分が付けた使用済みの印だけを戻す
    await db.from('account_claims').update({ used_at: null }).eq('id', claim.id).eq('used_at', now)
    console.error('アカウントをつなげませんでした:', error?.message ?? '対象の社員データではない')
    return { error: error ? 'つなげませんでした。時間をおいてもう一度お試しください' : 'このアカウントは使い始められない状態です。運用管理者にお知らせください' }
  }
  await writeAuditLog({ action: 'claim_account', actorId: claim.employee_id, targetId: claim.employee_id, details: { claim_id: claim.id, auth_user_id: user.id } }).catch(() => {})
  // 「〇〇さんが仲間入り」をタイムラインとお知らせに（招待から参加したときと同じ）
  await createWelcomeAnnouncement(db, claim.employee_id).catch(e => console.error('歓迎投稿に失敗:', e))
  return {}
}

/**
 * 「内容が違う・私ではない」を押したとき、このリンクを止める（2026-10-27 セキュリティ監査）。
 * 違う方に渡った・内容が違うリンクが、そのあと使われないように。運用管理者は「作り直す」で正しいリンクを出し直す。
 */
export async function rejectClaim(claimId: string): Promise<{ error?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(claimId)) return { error: 'リンクが正しくありません' }
  const db = createAdminClient()
  const { data } = await db.from('account_claims').update({ revoked_at: new Date().toISOString() })
    .eq('id', claimId).is('used_at', null).is('revoked_at', null).select('employee_id')
  const row = data?.[0]
  if (row) await writeAuditLog({ action: 'reject_account_claim', actorId: row.employee_id, targetId: row.employee_id, details: { claim_id: claimId } }).catch(() => {})
  return {}
}
