'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitationNotification } from '@/lib/notifications'

const INVITER_ROLES = ['store_manager', 'manager', 'admin', 'ops_manager', 'executive']

/**
 * 招待リンク発行（フェーズ2: 未アプリ参加者 or 誰でも受諾可能）
 * target_employee_id なしで作成。通知は送らず、URL を返すだけ。
 */
export async function createInvitationLink(params: {
  teamId: string
  customMessage?: string
  asManager?: boolean
}): Promise<{ error?: string; invitationId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const db = createAdminClient()

  const { data: inviter } = await db
    .from('employees')
    .select('id, role')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!inviter || !INVITER_ROLES.includes(inviter.role)) {
    return { error: '招待権限がありません' }
  }

  const { data: team } = await db.from('teams').select('id, name').eq('id', params.teamId).single()
  if (!team) return { error: 'チームが見つかりません' }

  const { data: inv, error: insertError } = await db
    .from('team_invitations')
    .insert({
      team_id: params.teamId,
      invited_by: inviter.id,
      custom_message: params.customMessage?.trim() || null,
      as_manager: !!params.asManager,
    })
    .select('id')
    .single()
  if (insertError || !inv) return { error: insertError?.message ?? '招待作成に失敗しました' }

  return { invitationId: inv.id }
}

/**
 * 既存メンバーへのチーム招待を作成（フェーズ1）
 */
export async function createInvitation(params: {
  teamId: string
  targetEmployeeId: string
  customMessage?: string
  asManager?: boolean
}): Promise<{ error?: string; invitationId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const db = createAdminClient()

  // 招待者の権限チェック
  const { data: inviter } = await db
    .from('employees')
    .select('id, name, role')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!inviter || !INVITER_ROLES.includes(inviter.role)) {
    return { error: '招待権限がありません' }
  }

  // チーム存在確認
  const { data: team } = await db.from('teams').select('id, name, type').eq('id', params.teamId).single()
  if (!team) return { error: 'チームが見つかりません' }

  // 宛先メンバー存在確認
  const { data: target } = await db
    .from('employees')
    .select('id, name, email, line_user_id')
    .eq('id', params.targetEmployeeId)
    .eq('status', 'approved')
    .single()
  if (!target) return { error: '招待先メンバーが見つかりません' }

  // 既に所属しているか確認
  const { data: existingMember } = await db
    .from('team_members')
    .select('team_id')
    .eq('team_id', params.teamId)
    .eq('employee_id', params.targetEmployeeId)
    .maybeSingle()
  const { data: existingManager } = await db
    .from('team_managers')
    .select('team_id')
    .eq('team_id', params.teamId)
    .eq('employee_id', params.targetEmployeeId)
    .maybeSingle()
  if (existingMember || existingManager) {
    return { error: `${target.name}さんは既にこのチームに所属しています` }
  }

  // 招待レコード作成
  const { data: inv, error: insertError } = await db
    .from('team_invitations')
    .insert({
      team_id: params.teamId,
      invited_by: inviter.id,
      target_employee_id: target.id,
      target_email: target.email,
      custom_message: params.customMessage?.trim() || null,
      as_manager: !!params.asManager,
    })
    .select('id')
    .single()
  if (insertError || !inv) return { error: insertError?.message ?? '招待作成に失敗しました' }

  // 通知送信（非同期・失敗しても招待は残す）
  sendInvitationNotification({
    invitationId: inv.id,
    inviter: { name: inviter.name },
    target: { name: target.name, email: target.email, line_user_id: target.line_user_id },
    teamName: team.name,
    customMessage: params.customMessage,
  }).catch(err => console.error('招待通知送信失敗:', err))

  revalidatePath('/admin/teams')
  return { invitationId: inv.id }
}

export interface AcceptInvitationProfile {
  instagramUrl?: string | null
  lineUrl?: string | null
}

/**
 * 招待を受諾してチームに参加する
 */
export async function acceptInvitation(
  invitationId: string,
  profile?: AcceptInvitationProfile
): Promise<{ error?: string; teamName?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const db = createAdminClient()

  // 受諾者の employees レコード取得
  const { data: me } = await db
    .from('employees')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!me) return { error: 'ユーザー情報が取得できません' }

  // 招待取得
  const { data: inv } = await db
    .from('team_invitations')
    .select('id, team_id, project_team_id, target_employee_id, expires_at, used_at, as_manager')
    .eq('id', invitationId)
    .single()
  if (!inv) return { error: '招待が見つかりません' }
  if (inv.used_at) return { error: 'この招待は既に使用済みです' }
  if (new Date(inv.expires_at) < new Date()) return { error: 'この招待は期限切れです' }
  if (inv.target_employee_id && inv.target_employee_id !== me.id) {
    return { error: 'この招待はあなた宛ではありません' }
  }

  // チーム情報取得
  const { data: team } = await db.from('teams').select('id, name').eq('id', inv.team_id).single()
  if (!team) return { error: 'チームが見つかりません' }

  // 既に所属していないか確認
  const { data: existingMember } = await db
    .from('team_members')
    .select('team_id')
    .eq('team_id', inv.team_id)
    .eq('employee_id', me.id)
    .maybeSingle()
  const { data: existingManager } = await db
    .from('team_managers')
    .select('team_id')
    .eq('team_id', inv.team_id)
    .eq('employee_id', me.id)
    .maybeSingle()

  // リーダー招待: team_managers に secondary として追加（既にメンバーなら移動）
  // メンバー招待: team_members に追加
  if (inv.as_manager) {
    if (!existingManager) {
      const { error: mgrError } = await db
        .from('team_managers')
        .insert({ team_id: inv.team_id, employee_id: me.id, role: 'secondary', sort_order: 999 })
      if (mgrError) return { error: mgrError.message }
      // 既にメンバーだった場合はメンバーから外す（リーダーに昇格の意図）
      if (existingMember) {
        await db
          .from('team_members')
          .delete()
          .eq('team_id', inv.team_id)
          .eq('employee_id', me.id)
      }
    }
  } else {
    if (!existingMember && !existingManager) {
      const { error: memberError } = await db
        .from('team_members')
        .insert({ team_id: inv.team_id, employee_id: me.id, sort_order: 999 })
      if (memberError) return { error: memberError.message }
    }
  }

  // 招待を使用済みにする
  await db
    .from('team_invitations')
    .update({ used_at: new Date().toISOString(), used_by: me.id })
    .eq('id', invitationId)

  // プロフィール情報を employees に反映
  if (profile && (profile.instagramUrl || profile.lineUrl)) {
    const update: Record<string, string | null> = {}
    if (profile.instagramUrl) update.instagram_url = profile.instagramUrl
    if (profile.lineUrl) update.line_url = profile.lineUrl
    if (Object.keys(update).length > 0) {
      await db.from('employees').update(update).eq('id', me.id)
    }
  }

  revalidatePath('/admin/teams')
  revalidatePath('/team')
  return { teamName: team.name }
}
