'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessage } from '@/lib/notifications/line'
import { writeAuditLog } from '@/lib/audit'
import { canApprove, canAdminister } from '@/lib/permissions'

/** 付与権限チェック（canApprove かつ、リーダーの場合は管理チームメンバー限定） */
async function assertCanActOn(employeeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未認証' as const }
  const db = createAdminClient()
  const { data: actor } = await db
    .from('employees')
    .select('id, name, role, system_permission')
    .eq('auth_user_id', user.id)
    .single()
  if (!actor || !canApprove(actor)) return { error: '権限がありません' as const }
  if (!canAdminister(actor)) {
    const { data: myTeams } = await db.from('team_managers').select('team_id').eq('employee_id', actor.id)
    const myTeamIds = (myTeams ?? []).map(t => t.team_id)
    if (myTeamIds.length === 0) return { error: '管理するチームがありません' as const }
    const [{ data: memberRows }, { data: managerRows }] = await Promise.all([
      db.from('team_members').select('team_id').eq('employee_id', employeeId).in('team_id', myTeamIds),
      db.from('team_managers').select('team_id').eq('employee_id', employeeId).in('team_id', myTeamIds),
    ])
    if ((memberRows?.length ?? 0) === 0 && (managerRows?.length ?? 0) === 0) {
      return { error: 'このメンバーを操作する権限がありません' as const }
    }
  }
  return { actor, db }
}

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
  const check = await assertCanActOn(params.employeeId)
  if ('error' in check) return { error: check.error }
  const { actor: certifier, db } = check

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

/**
 * 付与済み認定を取り消す。achievement 行ごと削除（履歴も CASCADE 削除される）。
 * 代わりに admin_audit_log に before 値を保存して監査証跡を残す。
 */
export async function revokeCertification(params: {
  employeeId: string
  achievementId: string
  reason?: string
}): Promise<{ error?: string }> {
  const check = await assertCanActOn(params.employeeId)
  if ('error' in check) return { error: check.error }
  const { actor, db } = check

  // 対象取得（certified のみ取消可）
  const { data: ach } = await db
    .from('achievements')
    .select('id, employee_id, skill_id, status, certified_by, certified_at, certify_comment, achieved_at, skills(name), employees!achievements_employee_id_fkey(name, email, line_user_id)')
    .eq('id', params.achievementId)
    .single()
  if (!ach) return { error: '対象が見つかりません' }
  if (ach.employee_id !== params.employeeId) return { error: '対象社員が一致しません' }
  if (ach.status !== 'certified') return { error: '認定済みのスキルのみ取り消せます' }

  const skill = ach.skills as { name: string } | null
  const emp = ach.employees as { name: string; email: string; line_user_id: string | null } | null
  const reason = params.reason?.trim() || null

  // 監査ログ先行（DELETE 後は achievement_history もなくなるため before を保存）
  await writeAuditLog({
    action: 'revoke_certification',
    actorId: actor.id,
    targetId: params.employeeId,
    details: {
      achievement_id: ach.id,
      skill_id: ach.skill_id,
      skill_name: skill?.name ?? null,
      previous_certified_by: ach.certified_by,
      previous_certified_at: ach.certified_at,
      previous_certify_comment: ach.certify_comment,
      reason,
    },
  })

  const { error: delErr } = await db.from('achievements').delete().eq('id', params.achievementId)
  if (delErr) return { error: delErr.message }

  // 通知
  if (emp && skill) {
    const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
    const skillsUrl = `${systemUrl}/skills`
    await sendMail({
      to: emp.email,
      subject: `【Growth Driver】スキル認定が取り消されました: ${skill.name}`,
      body: [
        `${emp.name} 様`,
        '',
        `スキル「${skill.name}」の認定が取り消されました。`,
        '',
        `操作者: ${actor.name}`,
        ...(reason ? [`理由: ${reason}`] : []),
        '',
        `必要に応じて再度申請してください。`,
        skillsUrl,
      ].join('\n'),
    }).catch(err => console.error('認定取消メール送信失敗:', err))

    if (emp.line_user_id) {
      await sendLineMessage(
        emp.line_user_id,
        `【スキル認定 取り消し】\nスキル「${skill.name}」の認定が取り消されました。\n操作者: ${actor.name}\n${reason ? `理由: ${reason}\n` : ''}\n必要に応じて再度申請してください: ${skillsUrl}\nGrowth Driver`
      ).catch(err => console.error('認定取消LINE通知失敗:', err))
    }
  }

  revalidatePath(`/admin/employees/${params.employeeId}`)
  return {}
}
