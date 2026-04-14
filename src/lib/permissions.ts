import type { Role, SystemPermission } from '@/types/database'

/**
 * 権限判定ヘルパー
 *
 * system_permission（新モデル）を優先し、未設定の場合のみ旧 role から推定する。
 * Phase 1 移行で全レコードに system_permission は埋まっているが、安全網として
 * フォールバックを残す。Phase 5（旧 role 廃止）でフォールバックも削除する。
 */

type EmpLike = {
  role?: Role | null
  system_permission?: SystemPermission | null
}

/** 旧 role → system_permission の推定（フォールバック用） */
function inferFromRole(role: Role | null | undefined): SystemPermission {
  switch (role) {
    case 'admin':
    case 'testuser':
      return 'developer'
    case 'executive':
    case 'ops_manager':
      return 'ops_admin'
    case 'manager':
    case 'store_manager':
      return 'training_leader'
    default:
      return 'training_member'
  }
}

/** Employee から実効システム権限を取得 */
export function getSystemPermission(emp: EmpLike | null | undefined): SystemPermission {
  if (!emp) return 'training_member'
  return emp.system_permission ?? inferFromRole(emp.role)
}

/** 開発者 */
export function isDeveloper(emp: EmpLike | null | undefined): boolean {
  return getSystemPermission(emp) === 'developer'
}

/** 運用管理者 */
export function isOpsAdmin(emp: EmpLike | null | undefined): boolean {
  return getSystemPermission(emp) === 'ops_admin'
}

/** リーダー（リーダー権限ちょうど） */
export function isTrainingLeader(emp: EmpLike | null | undefined): boolean {
  return getSystemPermission(emp) === 'training_leader'
}

/** メンバー */
export function isTrainingMember(emp: EmpLike | null | undefined): boolean {
  return getSystemPermission(emp) === 'training_member'
}

/**
 * システム管理者（開発者 + 運用管理者）
 * 旧 ADMIN_ROLES = ['admin','ops_manager','executive','testuser'] 相当
 */
export function canAdminister(emp: EmpLike | null | undefined): boolean {
  const p = getSystemPermission(emp)
  return p === 'developer' || p === 'ops_admin'
}

/**
 * 承認・育成リーダー以上（リーダー以上）
 * 旧 APPROVAL_ROLES = ['store_manager','manager','admin','ops_manager','executive'] 相当
 * （testuser はプレビュー用に旧定義に含まれていなかったが、新モデルでは developer なので含まれる）
 */
export function canApprove(emp: EmpLike | null | undefined): boolean {
  const p = getSystemPermission(emp)
  return p !== 'training_member'
}

/**
 * 業務役職・システム権限・チーム編集など、運用管理レベルの操作可否。
 * 現状は canAdminister と同義だが、意味的に分けたい場面用にエイリアスを提供。
 */
export const canManageRoles = canAdminister
