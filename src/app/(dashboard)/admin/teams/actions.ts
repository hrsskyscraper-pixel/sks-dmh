'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminister, isTrainingLeader } from '@/lib/permissions'

/**
 * チームのメンバー編集権限チェック（チーム単位）。
 *
 * team_members の RLS は admin/ops_manager の旧 role 限定のため、育成リーダーでは
 * クライアント直書きが拒否される。ここで権限を明示チェックしたうえで admin client
 * （service role）で書き込む（アプリの基本パターン）。
 *
 * 許可条件:
 *  - システム管理者（canAdminister）はすべてのチームを編集可
 *  - 育成リーダー（isTrainingLeader）は team_managers に自分が登録されたチームのみ編集可
 */
async function assertCanEditTeamMembers(teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未認証' as const }

  const db = createAdminClient()
  const { data: actor } = await db
    .from('employees')
    .select('id, name, role, system_permission')
    .eq('auth_user_id', user.id)
    .single()
  if (!actor) return { error: '権限がありません' as const }

  if (canAdminister(actor)) {
    return { actor, db }
  }

  if (isTrainingLeader(actor)) {
    const { data: mgrRow } = await db
      .from('team_managers')
      .select('team_id')
      .eq('employee_id', actor.id)
      .eq('team_id', teamId)
      .maybeSingle()
    if (mgrRow) return { actor, db }
  }

  return { error: 'このチームを編集する権限がありません' as const }
}

/** 直接実行の監査記録（team-manager.tsx の logDirectAction を踏襲） */
async function logDirectAction(
  db: ReturnType<typeof createAdminClient>,
  actorId: string,
  requestType: 'add_member' | 'remove_member',
  teamId: string,
  payload: Record<string, unknown>,
) {
  const now = new Date().toISOString()
  await db.from('team_change_requests').insert({
    requested_by: actorId,
    request_type: requestType,
    team_id: teamId,
    payload: payload as unknown as import('@/types/database').Json,
    status: 'approved' as const,
    reviewed_by: actorId,
    reviewed_at: now,
    review_comment: '直接実行',
  })
}

/**
 * チームにメンバーを追加する。権限チェック後 admin client で書き込み。
 * 追加した社員ごとに監査記録（add_member / status:approved / review_comment:'直接実行'）を残す。
 */
export async function addTeamMembers(teamId: string, employeeIds: string[]): Promise<{ error?: string }> {
  if (employeeIds.length === 0) return {}
  const check = await assertCanEditTeamMembers(teamId)
  if ('error' in check) return { error: check.error }
  const { actor, db } = check

  const { error } = await db
    .from('team_members')
    .insert(employeeIds.map(id => ({ team_id: teamId, employee_id: id, sort_order: 999 })))
  if (error && error.code !== '23505') {
    // 23505（unique 制約違反 = 既に所属）は成功扱い
    console.error('[addTeamMembers]', error)
    return { error: '追加に失敗しました' }
  }

  // 監査記録用にチーム名・社員名を取得（失敗してもメイン処理は成功扱い）
  const { data: team } = await db.from('teams').select('name').eq('id', teamId).maybeSingle()
  const { data: emps } = await db.from('employees').select('id, name').in('id', employeeIds)
  const nameById = new Map((emps ?? []).map(e => [e.id, e.name]))
  for (const empId of employeeIds) {
    await logDirectAction(db, actor.id, 'add_member', teamId, {
      team_name: team?.name,
      employee_id: empId,
      employee_name: nameById.get(empId),
    })
  }

  revalidatePath('/admin/teams')
  return {}
}

/**
 * チームからメンバーを 1 名削除する。権限チェック後 admin client で削除。
 * 監査記録（remove_member / status:approved / review_comment:'直接実行'）を残す。
 */
export async function removeTeamMember(teamId: string, employeeId: string): Promise<{ error?: string }> {
  const check = await assertCanEditTeamMembers(teamId)
  if ('error' in check) return { error: check.error }
  const { actor, db } = check

  const { error } = await db
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('employee_id', employeeId)
  if (error) {
    console.error('[removeTeamMember]', error)
    return { error: '削除に失敗しました' }
  }

  const { data: team } = await db.from('teams').select('name').eq('id', teamId).maybeSingle()
  const { data: emp } = await db.from('employees').select('name').eq('id', employeeId).maybeSingle()
  await logDirectAction(db, actor.id, 'remove_member', teamId, {
    team_name: team?.name,
    employee_id: employeeId,
    employee_name: emp?.name,
  })

  revalidatePath('/admin/teams')
  return {}
}

/**
 * チーム内メンバーの並び順を更新する。権限チェック後 admin client で sort_order を更新。
 * 並び替えは現状監査記録を残さない（直接実行と同じ扱い）。
 */
export async function reorderTeamMembers(teamId: string, orderedEmployeeIds: string[]): Promise<{ error?: string }> {
  const check = await assertCanEditTeamMembers(teamId)
  if ('error' in check) return { error: check.error }
  const { db } = check

  for (let i = 0; i < orderedEmployeeIds.length; i++) {
    const { error } = await db
      .from('team_members')
      .update({ sort_order: i })
      .eq('team_id', teamId)
      .eq('employee_id', orderedEmployeeIds[i])
    if (error) {
      console.error('[reorderTeamMembers]', error)
      return { error: '並び替えに失敗しました' }
    }
  }

  revalidatePath('/admin/teams')
  return {}
}
