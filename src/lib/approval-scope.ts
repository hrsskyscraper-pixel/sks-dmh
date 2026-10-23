import type { SupabaseClient } from '@supabase/supabase-js'
import { canAdminister } from '@/lib/permissions'
import { leaderIdsUnderUpperApprover } from '@/lib/upper-approvers'
import { getSeniorReview } from '@/lib/settings'
import { seniorApplicantIds } from '@/lib/senior-review'
import type { Role, SystemPermission } from '@/types/database'

/**
 * スキル認定の「誰の申請を処理できるか」をサーバー側で確かめる（2026-10-22。承認センターの画面と同じ範囲）。
 * - システム管理者（運用管理者・開発者）: 全社（これまでどおり）
 * - それ以外の承認者: 担当リーダーになっている店舗・チームのメンバーと、
 *   上の承認者に指定された店舗の担当リーダー（店長）だけ。処理できるのは「申請中」のものだけ
 * - 自分の申請はだれも処理できない
 * - 管理者（MG・AC・課長など。設定で決めた役職）の申請は、設定で選んだ人（部長・常務・社長）だけ。
 *   選ばれた人は担当の店舗に関係なく処理でき、ほかの運用管理者は処理できない（2026-10-23 B-④-3）
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

export const SENIOR_REVIEW_DENIED = '管理者（MG・AC・課長など）の方のスキルは、設定で決めた方（部長・常務・社長など）だけが承認・取り消しできます'

/**
 * 管理者の申請の確認（承認センター・API・社員詳細の直接合格と取り消しで共用）。
 * employeeIds に管理者の役職の方が含まれ、certifier が承認する人に選ばれていなければ error を返す。
 * seniorIds は含まれていた管理者の社員ID。設定が読めないときは例外（閉じる側）。
 */
export async function seniorReviewCheck(
  db: SupabaseClient,
  certifier: Certifier,
  employeeIds: string[],
): Promise<{ error: string | null; seniorIds: Set<string> }> {
  const senior = await getSeniorReview()
  const seniorIds = senior.active ? await seniorApplicantIds(db, employeeIds, senior.roleIds) : new Set<string>()
  const isSeniorApprover = canAdminister(certifier) && senior.approverIds.includes(certifier.id)
  return { error: seniorIds.size > 0 && !isSeniorApprover ? SENIOR_REVIEW_DENIED : null, seniorIds }
}

/** 処理してよければ null、だめなら利用者に見せる理由を返す */
export async function certifyScopeError(
  db: SupabaseClient,
  certifier: Certifier,
  targets: { employee_id: string; status: string }[],
): Promise<string | null> {
  if (targets.some(t => t.employee_id === certifier.id)) return '自分のスキル申請は承認できません'
  const { error: seniorErr, seniorIds } = await seniorReviewCheck(db, certifier, targets.map(t => t.employee_id))
  if (seniorErr) return seniorErr
  const rest = targets.filter(t => !seniorIds.has(t.employee_id))
  if (canAdminister(certifier)) return null
  if (targets.some(t => t.status !== 'pending')) return 'すでに処理された申請が含まれています。画面を開き直してください'
  if (rest.length === 0) return null
  const allowed = await approvableEmployeeIds(db, certifier.id)
  if (rest.some(t => !allowed.has(t.employee_id))) return '担当していない方の申請は承認できません'
  return null
}
