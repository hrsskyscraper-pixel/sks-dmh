'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessages } from '@/lib/notifications/line'

/**
 * 習得カリキュラムのセットアップ依頼を、社内の運営管理者（ops_manager / executive）に通知する。
 * セットアップ未完了（フェーズ未設定）のカリキュラムが設定されたチームのリーダーが押す。
 */
export async function requestCurriculumSetup(
  teamName: string,
  curriculumName: string,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未認証' }

  const db = createAdminClient()
  const { data: me } = await db.from('employees').select('id, name').eq('auth_user_id', user.id).eq('status', 'approved').single()
  if (!me) return { error: 'ユーザー情報が取得できません' }

  const { data: ops } = await db
    .from('employees')
    .select('id, name, email, line_user_id')
    .eq('role', 'ops_manager')
    .eq('status', 'approved')
  const opsList = ops ?? []
  if (opsList.length === 0) return { error: '運営管理者が登録されていません。開発者にご連絡ください。' }

  const subject = `【セットアップ依頼】${teamName} の習得カリキュラム「${curriculumName}」`
  const body =
    `${me.name} さん（リーダー）から、習得カリキュラムのセットアップ依頼が届きました。\n\n` +
    `■ 所属（店舗／部署／PJチーム）: ${teamName}\n` +
    `■ 習得カリキュラム: ${curriculumName}\n\n` +
    `このカリキュラムはフェーズ（時間設定）が未設定のため、メンバーには「準備中」と表示されています。\n` +
    `「習得カリキュラム管理」からフェーズ・スキルのセットアップをお願いします。`

  const emails = opsList.map(o => o.email).filter((e): e is string => !!e)
  if (emails.length > 0) await sendMail({ to: emails, subject, body }).catch(console.error)

  const lineIds = opsList.map(o => o.line_user_id).filter((l): l is string => !!l)
  if (lineIds.length > 0) {
    await sendLineMessages(
      lineIds,
      `📋 セットアップ依頼\n${me.name}さんより\n所属: ${teamName}\nカリキュラム: ${curriculumName}\nフェーズ未設定のためセットアップをお願いします。`,
    ).catch(console.error)
  }

  return { ok: true }
}
