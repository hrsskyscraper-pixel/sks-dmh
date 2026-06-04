'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitationNotification } from '@/lib/notifications'
import { canApprove, canAdminister } from '@/lib/permissions'

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
    .select('id, role, system_permission')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!inviter || !canApprove(inviter)) {
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
    .select('id, name, role, system_permission')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!inviter || !canApprove(inviter)) {
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
  lastName?: string
  firstName?: string
  nameKana?: string | null
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

  // 自己選択型以外は team_id 必須
  if (!inv.team_id) return { error: 'この招待は参加先が設定されていません' }
  const teamId = inv.team_id

  // チーム情報取得
  const { data: team } = await db.from('teams').select('id, name').eq('id', teamId).single()
  if (!team) return { error: 'チームが見つかりません' }

  // 既に所属していないか確認
  const { data: existingMember } = await db
    .from('team_members')
    .select('team_id')
    .eq('team_id', teamId)
    .eq('employee_id', me.id)
    .maybeSingle()
  const { data: existingManager } = await db
    .from('team_managers')
    .select('team_id')
    .eq('team_id', teamId)
    .eq('employee_id', me.id)
    .maybeSingle()

  // リーダー招待: team_managers に secondary として追加（既にメンバーなら移動）
  // メンバー招待: team_members に追加
  if (inv.as_manager) {
    if (!existingManager) {
      const { error: mgrError } = await db
        .from('team_managers')
        .insert({ team_id: teamId, employee_id: me.id, role: 'secondary', sort_order: 999 })
      if (mgrError) return { error: mgrError.message }
      // 既にメンバーだった場合はメンバーから外す（リーダーに昇格の意図）
      if (existingMember) {
        await db
          .from('team_members')
          .delete()
          .eq('team_id', teamId)
          .eq('employee_id', me.id)
      }
    }
  } else {
    if (!existingMember && !existingManager) {
      const { error: memberError } = await db
        .from('team_members')
        .insert({ team_id: teamId, employee_id: me.id, sort_order: 999 })
      if (memberError) return { error: memberError.message }
    }
  }

  // 招待を使用済みにする
  await db
    .from('team_invitations')
    .update({ used_at: new Date().toISOString(), used_by: me.id })
    .eq('id', invitationId)

  // 氏名・プロフィール情報を employees に反映
  if (profile) {
    const update: Record<string, string | null> = {}
    if (profile.lastName && profile.lastName.trim()) update.last_name = profile.lastName.trim()
    if (profile.firstName && profile.firstName.trim()) update.first_name = profile.firstName.trim()
    if (profile.nameKana && profile.nameKana.trim()) update.name_kana = profile.nameKana.trim()
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

/**
 * 自己選択型の招待リンクを作成（共通1リンク）。
 * 参加者がリンクを開き、自分の所属（店舗/部署/チーム）を選んで参加する。
 * 再利用可能。運用管理者以上（canAdminister）のみ作成可。
 */
export async function createSelfSelectInviteLink(params: {
  asManager?: boolean
  allowedTypes?: string[] | null
  customMessage?: string
}): Promise<{ error?: string; invitationId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const db = createAdminClient()
  const { data: inviter } = await db
    .from('employees')
    .select('id, role, system_permission')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!inviter || !canAdminister(inviter)) {
    return { error: 'この操作は運用管理者以上のみ可能です' }
  }

  const { data: inv, error: insertError } = await db
    .from('team_invitations')
    .insert({
      team_id: null,
      invited_by: inviter.id,
      is_self_select: true,
      as_manager: params.asManager ?? true,
      allowed_team_types: params.allowedTypes ?? null,
      custom_message: params.customMessage?.trim() || null,
    })
    .select('id')
    .single()
  if (insertError || !inv) return { error: insertError?.message ?? '招待リンク作成に失敗しました' }

  revalidatePath('/admin/teams')
  return { invitationId: inv.id }
}

/**
 * 招待リンクを無効化（手動失効）。運用管理者以上のみ。
 */
export async function revokeInviteLink(invitationId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const db = createAdminClient()
  const { data: actor } = await db
    .from('employees')
    .select('id, role, system_permission')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!actor || !canAdminister(actor)) return { error: '権限がありません' }

  const { error } = await db
    .from('team_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
  if (error) return { error: error.message }

  revalidatePath('/admin/teams')
  return {}
}

/**
 * 自己選択型リンクを受諾して、選んだチームに参加する。
 * 再利用可能なため used_at では消費しない（revoked_at / expires_at で制御）。
 */
export async function acceptSelfSelectInvitation(
  invitationId: string,
  teamId: string,
  profile?: AcceptInvitationProfile
): Promise<{ error?: string; teamName?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const db = createAdminClient()

  const { data: me } = await db
    .from('employees')
    .select('id, name')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!me) return { error: 'ユーザー情報が取得できません' }

  const { data: inv } = await db
    .from('team_invitations')
    .select('id, is_self_select, allowed_team_types, expires_at, revoked_at, as_manager')
    .eq('id', invitationId)
    .single()
  if (!inv) return { error: '招待が見つかりません' }
  if (!inv.is_self_select) return { error: 'この招待リンクは所属選択型ではありません' }
  if (inv.revoked_at) return { error: 'この招待リンクは無効化されています' }
  if (new Date(inv.expires_at) < new Date()) return { error: 'この招待リンクは期限切れです' }

  // 参加先チームの検証
  const { data: team } = await db.from('teams').select('id, name, type').eq('id', teamId).single()
  if (!team) return { error: '参加先が見つかりません' }
  if (inv.allowed_team_types && inv.allowed_team_types.length > 0 && !inv.allowed_team_types.includes(team.type)) {
    return { error: 'この所属はこのリンクでは選べません' }
  }

  // 既存所属の確認
  const { data: existingMember } = await db
    .from('team_members').select('team_id').eq('team_id', teamId).eq('employee_id', me.id).maybeSingle()
  const { data: existingManager } = await db
    .from('team_managers').select('team_id').eq('team_id', teamId).eq('employee_id', me.id).maybeSingle()

  if (inv.as_manager) {
    if (!existingManager) {
      const { error: mgrError } = await db
        .from('team_managers')
        .insert({ team_id: teamId, employee_id: me.id, role: 'secondary', sort_order: 999 })
      if (mgrError) return { error: mgrError.message }
      if (existingMember) {
        await db.from('team_members').delete().eq('team_id', teamId).eq('employee_id', me.id)
      }
    }
  } else {
    if (!existingMember && !existingManager) {
      const { error: memberError } = await db
        .from('team_members')
        .insert({ team_id: teamId, employee_id: me.id, sort_order: 999 })
      if (memberError) return { error: memberError.message }
    }
  }

  // 氏名・プロフィール情報を反映（初回参加者向け）
  if (profile) {
    const update: Record<string, string | null> = {}
    if (profile.lastName && profile.lastName.trim()) update.last_name = profile.lastName.trim()
    if (profile.firstName && profile.firstName.trim()) update.first_name = profile.firstName.trim()
    if (profile.nameKana && profile.nameKana.trim()) update.name_kana = profile.nameKana.trim()
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
