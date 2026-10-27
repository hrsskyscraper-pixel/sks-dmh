import type { Role, SystemPermission } from '@/types/database'

/** 役職の設定のうち、権限まわりで使うもの */
export type TitleSetting = { name: string; is_executive?: boolean | null; standard_permission?: SystemPermission | null }

const RANK: Record<SystemPermission, number> = { training_member: 0, training_leader: 1, ops_admin: 2, developer: 3 }

/** 2つの権限のうち広い方 */
export const widerPermission = (a: SystemPermission, b: SystemPermission): SystemPermission => (RANK[a] >= RANK[b] ? a : b)

/**
 * 役職から決まる「標準の承認の権限」（案B 2026-10-27）。付いている役職のうち、いちばん広いもの。
 * 役職が無い・どれも決めていないときはメンバー。
 */
export function standardPermissionOf(titles: TitleSetting[]): SystemPermission {
  return titles.reduce<SystemPermission>((acc, t) => (t.standard_permission ? widerPermission(acc, t.standard_permission) : acc), 'training_member')
}

/**
 * system_permission と役職から旧 role を導出する（dual-write 用）。
 * 役職（役員として扱う／店長）がついていればより具体的な role を選ぶ。
 */
export function deriveLegacyRole(permission: SystemPermission, titles: TitleSetting[]): Role {
  if (permission === 'developer') return 'admin'
  if (permission === 'ops_admin') return titles.some(t => t.is_executive || t.name === '役員') ? 'executive' : 'ops_manager'
  if (permission === 'training_leader') return titles.some(t => t.name === '店長') ? 'store_manager' : 'manager'
  return 'employee'
}
