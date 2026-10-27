import { createAdminClient } from '@/lib/supabase/admin'
import { isDeveloper, isOpsAdmin } from '@/lib/permissions'
import type { Role, SystemPermission } from '@/types/database'

// --- ステータス ---
export type ImprovementStatus =
  | 'submitted' // 申請済み（運営の確認待ち）
  | 'ops_approved' // 運営承認・改善案提案済み（役員承認待ち）
  | 'exec_approved' // 役員承認済み（開発着手待ち）
  | 'in_development' // 開発対応中
  | 'completed' // 完了
  | 'rejected' // 却下

export const STATUS_LABEL: Record<ImprovementStatus, string> = {
  submitted: '申請中（運営確認待ち）',
  ops_approved: '役員承認待ち',
  exec_approved: '開発待ち',
  in_development: '開発対応中',
  completed: '完了',
  rejected: '却下',
}

export const CATEGORY_OPTIONS = ['不具合', '改善', '新機能', 'その他'] as const

// --- 役割判定 ---
type EmpLike = { role?: Role | null; system_permission?: SystemPermission | null; business_role_ids?: string[] | null }

/**
 * 役員（意思決定者）として扱う役職の ID（キャッシュしない・呼び出し側で保持）。
 * 役職の設定「役員として扱う」（business_roles.is_executive）が付いたもの。会長・社長・常務取締役など（2026-10-27〜）
 */
export async function getExecRoleIds(): Promise<string[]> {
  const db = createAdminClient()
  const { data } = await db.from('business_roles').select('id').eq('is_executive', true)
  return (data ?? []).map(r => r.id)
}

/** 意思決定者（役員）か */
export function isExecEmp(emp: EmpLike, execRoleIds: string[]): boolean {
  return (emp.business_role_ids ?? []).some(id => execRoleIds.includes(id))
}

/** 運営管理者（運用管理者）か */
export function isOpsEmp(emp: EmpLike): boolean {
  return isOpsAdmin(emp)
}

/** 開発者か */
export function isDevEmp(emp: EmpLike): boolean {
  return isDeveloper(emp)
}

// --- 通知宛先の解決 ---
export interface Recipient {
  id: string
  name: string
  email: string | null
  line_user_id: string | null
}

/** 運営管理者（ops_admin）一覧 */
export async function getOpsAdmins(): Promise<Recipient[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('employees')
    .select('id, name, email, line_user_id')
    .eq('status', 'approved')
    .eq('system_permission', 'ops_admin')
  return (data ?? []) as Recipient[]
}

/** 開発者（developer）一覧 */
/**
 * 改善提案・Q&A の通知を届ける「運営チーム」。設定（app_settings.ops_team_recipient_ids）があればその人たち、
 * 未設定なら 運用管理者＋開発者（従来どおり）。
 */
export async function getOpsTeamRecipients(): Promise<Recipient[]> {
  const { getOpsTeamRecipientIds } = await import('@/lib/settings')
  const ids = await getOpsTeamRecipientIds()
  if (ids.length > 0) {
    const db = createAdminClient()
    const { data } = await db.from('employees').select('id, name, email, line_user_id').eq('status', 'approved').in('id', ids)
    if (data && data.length > 0) return data as Recipient[]
  }
  const [ops, devs] = await Promise.all([getOpsAdmins(), getDevelopers()])
  return [...ops, ...devs]
}

export async function getDevelopers(): Promise<Recipient[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('employees')
    .select('id, name, email, line_user_id')
    .eq('status', 'approved')
    .eq('system_permission', 'developer')
  return (data ?? []) as Recipient[]
}

/** 意思決定者（役員）一覧 */
export async function getExecs(): Promise<Recipient[]> {
  const execRoleIds = await getExecRoleIds()
  if (execRoleIds.length === 0) return []
  const db = createAdminClient()
  const { data } = await db
    .from('employees')
    .select('id, name, email, line_user_id')
    .eq('status', 'approved')
    .overlaps('business_role_ids', execRoleIds)
  return (data ?? []) as Recipient[]
}

/** 1人分を取得 */
export async function getEmployeeRecipient(id: string): Promise<Recipient | null> {
  const db = createAdminClient()
  const { data } = await db.from('employees').select('id, name, email, line_user_id').eq('id', id).maybeSingle()
  return (data as Recipient) ?? null
}
