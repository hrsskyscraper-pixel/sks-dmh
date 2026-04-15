'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessage } from '@/lib/notifications/line'
import { canApprove, canAdminister } from '@/lib/permissions'

/**
 * リーダー・管理者がメンバーのスキルに対し直接「合格」を付与する。
 * 既存の achievement があれば certified に更新、なければ新規作成。
 * 既に certified なら何もせずエラー。
 */
export async function grantSkill(params: {
  employeeId: string
  skillId: string
  comment?: string
}): Promise<{ error?: string; achievementId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未認証' }

  const db = createAdminClient()
  const { data: certifier } = await db
    .from('employees')
    .select('id, name, role, system_permission')
    .eq('auth_user_id', user.id)
    .single()
  if (!certifier || !canApprove(certifier)) {
    return { error: '権限がありません' }
  }

  // リーダー（training_leader）は自分が管理するチームのメンバーのみ付与可
  if (!canAdminister(certifier)) {
    const { data: myTeams } = await db.from('team_managers').select('team_id').eq('employee_id', certifier.id)
    const myTeamIds = (myTeams ?? []).map(t => t.team_id)
    if (myTeamIds.length === 0) return { error: '管理するチームがありません' }
    const { data: memberRows } = await db.from('team_members').select('team_id').eq('employee_id', params.employeeId).in('team_id', myTeamIds)
    const { data: managerRows } = await db.from('team_managers').select('team_id').eq('employee_id', params.employeeId).in('team_id', myTeamIds)
    if ((memberRows?.length ?? 0) === 0 && (managerRows?.length ?? 0) === 0) {
      return { error: 'このメンバーに付与する権限がありません' }
    }
  }

  // 対象取得
  const { data: target } = await db
    .from('employees')
    .select('id, name, email, line_user_id')
    .eq('id', params.employeeId)
    .single()
  if (!target) return { error: '対象社員が見つかりません' }

  const { data: skill } = await db.from('skills').select('id, name').eq('id', params.skillId).single()
  if (!skill) return { error: 'スキルが見つかりません' }

  // 既存 achievement
  const { data: existing } = await db
    .from('achievements')
    .select('id, status')
    .eq('employee_id', params.employeeId)
    .eq('skill_id', params.skillId)
    .maybeSingle()

  const now = new Date().toISOString()
  const commentClean = params.comment?.trim() || null

  let achievementId: string
  if (existing) {
    if (existing.status === 'certified') {
      return { error: '既に認定済みです' }
    }
    const { error } = await db.from('achievements').update({
      status: 'certified',
      certified_by: certifier.id,
      certified_at: now,
      certify_comment: commentClean,
      is_read: false,
    }).eq('id', existing.id)
    if (error) return { error: error.message }
    achievementId = existing.id
  } else {
    const { data: inserted, error } = await db.from('achievements').insert({
      employee_id: params.employeeId,
      skill_id: params.skillId,
      status: 'certified',
      achieved_at: now,
      certified_by: certifier.id,
      certified_at: now,
      certify_comment: commentClean,
      is_read: false,
    }).select('id').single()
    if (error || !inserted) return { error: error?.message ?? '作成失敗' }
    achievementId = inserted.id
  }

  // 履歴
  await db.from('achievement_history').insert({
    achievement_id: achievementId,
    action: 'certify',
    actor_id: certifier.id,
    comment: commentClean,
  })

  // 通知
  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
  const skillsUrl = `${systemUrl}/skills?tab=certified`
  await sendMail({
    to: target.email,
    subject: `【Growth Driver】スキル認定: ${skill.name}`,
    body: [
      `${target.name} 様`,
      '',
      `スキル「${skill.name}」が認定されました。`,
      '',
      `認定者: ${certifier.name}`,
      ...(commentClean ? [`コメント: ${commentClean}`] : []),
      '',
      `詳細はこちらから確認できます。`,
      skillsUrl,
    ].join('\n'),
  }).catch(err => console.error('スキル付与メール送信失敗:', err))

  if (target.line_user_id) {
    await sendLineMessage(
      target.line_user_id,
      `【スキル認定】\nスキル「${skill.name}」が認定されました。\n認定者: ${certifier.name}\n${commentClean ? `コメント: ${commentClean}\n` : ''}\n確認: ${skillsUrl}\nGrowth Driver`
    ).catch(err => console.error('スキル付与LINE通知失敗:', err))
  }

  revalidatePath(`/admin/employees/${params.employeeId}`)
  return { achievementId }
}
