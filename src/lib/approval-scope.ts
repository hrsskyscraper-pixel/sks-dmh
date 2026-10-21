import type { SupabaseClient } from '@supabase/supabase-js'
import { canAdminister } from '@/lib/permissions'
import { leaderIdsUnderUpperApprover } from '@/lib/upper-approvers'
import type { Role, SystemPermission } from '@/types/database'

/**
 * スキル認定の「誰の申請を処理できるか」をサーバー側で確かめる（2026-10-22。承認センターの画面と同じ範囲）。
 * - システム管理者（運用管理者・開発者）: 全社（これまでどおり）
 * - それ以外の承認者: 担当リーダーになっている店舗・チームのメンバーと、
 *   上の承認者に指定された店舗の担当リーダー（店長）だけ。処理できるのは「申請中」のものだけ
 * - 自分の申請はだれも処理できない
 */
type Certifier = { id: string; role?: Role | null; system_permission?: SystemPermission | null }

export async function approvableEmployeeIds(db: SupabaseClient, approverId: string): Promise<Set<string>> {
  const { data: managed } = await db.from('team_managers').select('team_id').eq('employee_id', approverId)
  const teamIds = (managed ?? []).map(m => m.team_id)
  const [{ data: members }, upperLeaders] = await Promise.all([
    teamIds.length > 0 ? db.from('team_members').select('employee_id').in('team_id', teamIds) : Promise.resolve({ data: [] as { employee_id: string }[] }),
    leaderIdsUnderUpperApprover(db, approverId),
  ])
  const ids = new Set([...(members ?? []).map(m => m.employee_id), ...upperLeaders])
  ids.delete(approverId)
  return ids
}

/** 処理してよければ null、だめなら利用者に見せる理由を返す */
export async function certifyScopeError(
  db: SupabaseClient,
  certifier: Certifier,
  targets: { employee_id: string; status: string }[],
): Promise<string | null> {
  if (targets.some(t => t.employee_id === certifier.id)) return '自分のスキル申請は承認できません'
  if (canAdminister(certifier)) return null
  if (targets.some(t => t.status !== 'pending')) return 'すでに処理された申請が含まれています。画面を開き直してください'
  const allowed = await approvableEmployeeIds(db, certifier.id)
  if (targets.some(t => !allowed.has(t.employee_id))) return '担当していない方の申請は承認できません'
  return null
}
