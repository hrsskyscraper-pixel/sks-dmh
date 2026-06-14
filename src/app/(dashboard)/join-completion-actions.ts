'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canApprove, canAdminister } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export interface JoinCompletionProfile {
  lastName: string
  firstName: string
  nameKana?: string | null
  instagramUrl?: string | null
  lineUrl?: string | null
}

/**
 * 「承認済みだが所属0」の本人が、参加予定店舗（requested_team_id）への参加を完了する。
 * 招待リンクが手元になくても、記録済みの参加予定先を使って所属を確定できる。
 */
export async function completeTeamJoin(
  profile: JoinCompletionProfile
): Promise<{ error?: string; teamName?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const db = createAdminClient()
  const { data: me } = await db
    .from('employees')
    .select('id, status, requested_team_id, requested_project_team_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!me) return { error: 'ユーザー情報が取得できません' }
  if (me.status !== 'approved') return { error: 'アカウントが承認されていません' }
  if (!me.requested_team_id) return { error: '参加予定の所属が設定されていません' }

  const { data: team } = await db.from('teams').select('id, name').eq('id', me.requested_team_id).single()
  if (!team) return { error: '参加先が見つかりません' }

  await joinTeams(db, me.id, me.requested_team_id, me.requested_project_team_id)

  // 氏名・ふりがな・SNS を反映（非機微列なので admin client で更新）
  const update: Record<string, string | null> = {}
  if (profile.lastName?.trim()) update.last_name = profile.lastName.trim()
  if (profile.firstName?.trim()) update.first_name = profile.firstName.trim()
  if (profile.nameKana?.trim()) update.name_kana = profile.nameKana.trim()
  if (profile.instagramUrl) update.instagram_url = profile.instagramUrl
  if (profile.lineUrl) update.line_url = profile.lineUrl
  if (Object.keys(update).length > 0) {
    await db.from('employees').update(update).eq('id', me.id)
  }

  revalidatePath('/')
  revalidatePath('/team')
  return { teamName: team.name }
}

/**
 * 承認者（リーダー/管理者）が、未参加の人を参加予定店舗に手動で追加する。
 * 運用管理者は全員、それ以外は自分が管理するチームが参加予定先の人のみ。
 */
export async function adminCompleteJoin(
  employeeId: string
): Promise<{ error?: string; teamName?: string }> {
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
  if (!actor || !canApprove(actor)) return { error: '権限がありません' }

  const { data: target } = await db
    .from('employees')
    .select('id, status, requested_team_id, requested_project_team_id')
    .eq('id', employeeId)
    .single()
  if (!target) return { error: '対象が見つかりません' }
  if (target.status !== 'approved') return { error: 'この人はまだ承認されていません' }
  if (!target.requested_team_id) return { error: '参加予定の所属が設定されていません' }

  // 権限スコープ: 運用管理者は全員、それ以外は参加予定先を自分が管理しているか
  if (!canAdminister(actor)) {
    const { data: mgr } = await db
      .from('team_managers')
      .select('team_id')
      .eq('team_id', target.requested_team_id)
      .eq('employee_id', actor.id)
      .maybeSingle()
    if (!mgr) return { error: '権限がありません' }
  }

  const { data: team } = await db.from('teams').select('id, name').eq('id', target.requested_team_id).single()
  if (!team) return { error: '参加先が見つかりません' }

  await joinTeams(db, target.id, target.requested_team_id, target.requested_project_team_id)

  await writeAuditLog({
    action: 'complete_join',
    actorId: actor.id,
    targetId: target.id,
    details: { team_id: team.id, team_name: team.name },
  }).catch(() => {})

  revalidatePath('/approvals')
  revalidatePath('/team')
  return { teamName: team.name }
}

/**
 * team_members に追加（既に所属していればスキップ）。
 * リーダー登録済みの場合は重複追加しない。
 */
async function joinTeams(
  db: ReturnType<typeof createAdminClient>,
  employeeId: string,
  teamId: string,
  projectTeamId: string | null
) {
  const [{ data: existingMember }, { data: existingManager }] = await Promise.all([
    db.from('team_members').select('team_id').eq('team_id', teamId).eq('employee_id', employeeId).maybeSingle(),
    db.from('team_managers').select('team_id').eq('team_id', teamId).eq('employee_id', employeeId).maybeSingle(),
  ])
  if (!existingMember && !existingManager) {
    await db.from('team_members').insert({ team_id: teamId, employee_id: employeeId, sort_order: 999 })
  }

  if (projectTeamId) {
    const { data: ptMember } = await db
      .from('team_members')
      .select('team_id')
      .eq('team_id', projectTeamId)
      .eq('employee_id', employeeId)
      .maybeSingle()
    if (!ptMember) {
      await db.from('team_members').insert({ team_id: projectTeamId, employee_id: employeeId, sort_order: 999 })
    }
  }
}
