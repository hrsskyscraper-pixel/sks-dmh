'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { canAdminister } from '@/lib/permissions'
import type { SystemPermission, Role } from '@/types/database'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' as const }
  const { data: emp } = await supabase
    .from('employees')
    .select('id, role, system_permission')
    .eq('auth_user_id', user.id)
    .single()
  if (!canAdminister(emp)) return { error: '権限がありません' as const }
  return { ok: true as const, actorId: emp!.id }
}

/** 業務役職マスタ作成 */
export async function createBusinessRole(name: string): Promise<{ error?: string; id?: string }> {
  const check = await assertAdmin()
  if ('error' in check && check.error) return { error: check.error }
  if (!name.trim()) return { error: '名称を入力してください' }
  const db = createAdminClient()
  const { data: maxOrder } = await db.from('business_roles').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextOrder = (maxOrder?.sort_order ?? 0) + 10
  const { data, error } = await db.from('business_roles').insert({ name: name.trim(), sort_order: nextOrder }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/admin/business-roles')
  return { id: data.id }
}

/** 業務役職マスタ更新 */
export async function updateBusinessRole(id: string, patch: { name?: string; sort_order?: number }): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if ('error' in check && check.error) return { error: check.error }
  const db = createAdminClient()
  const { error } = await db.from('business_roles').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/business-roles')
  return {}
}

/** 業務役職マスタ削除（使用中ならエラー） */
export async function deleteBusinessRole(id: string): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if ('error' in check && check.error) return { error: check.error }
  const db = createAdminClient()
  const { data: inUse } = await db.from('employees').select('id').contains('business_role_ids', [id]).limit(1)
  if ((inUse?.length ?? 0) > 0) return { error: 'この役職を持つ社員がいるため削除できません' }
  const { error } = await db.from('business_roles').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/business-roles')
  return {}
}

/**
 * system_permission から旧 role への逆引き（dual-write 用）
 * 業務役職（役員/店長）がついていればより具体的な role を選ぶ。
 */
function deriveLegacyRole(
  permission: SystemPermission,
  businessRoleNames: string[],
): Role {
  if (permission === 'developer') return 'admin'
  if (permission === 'ops_admin') return businessRoleNames.includes('役員') ? 'executive' : 'ops_manager'
  if (permission === 'training_leader') return businessRoleNames.includes('店長') ? 'store_manager' : 'manager'
  return 'employee'
}

/** 社員の業務役職 + システム権限を更新（旧 role も dual-write） */
export async function updateEmployeePermission(params: {
  employeeId: string
  system_permission: SystemPermission
  business_role_ids: string[]
  employment_type?: '社員' | 'メイト'
}): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if ('error' in check && check.error) return { error: check.error }
  if (!('actorId' in check)) return { error: '権限がありません' }

  const db = createAdminClient()

  // 対象社員と現在値を取得
  const { data: target } = await db.from('employees').select('id, name, role, system_permission, business_role_ids, employment_type').eq('id', params.employeeId).single()
  if (!target) return { error: '対象社員が見つかりません' }

  // 業務役職名を取得（逆引きに使用）
  const { data: businessRoles } = await db.from('business_roles').select('id, name').in('id', params.business_role_ids.length > 0 ? params.business_role_ids : ['00000000-0000-0000-0000-000000000000'])
  const roleNames = (businessRoles ?? []).map(r => r.name)

  const legacyRole = deriveLegacyRole(params.system_permission, roleNames)
  const employmentType = params.employment_type ?? target.employment_type

  const { error } = await db.from('employees').update({
    system_permission: params.system_permission,
    business_role_ids: params.business_role_ids,
    role: legacyRole,
    employment_type: employmentType,
    updated_at: new Date().toISOString(),
  }).eq('id', params.employeeId)
  if (error) return { error: error.message }

  await writeAuditLog({
    action: 'update_employee_permission',
    actorId: check.actorId,
    targetId: params.employeeId,
    details: {
      name: target.name,
      before: {
        system_permission: target.system_permission,
        business_role_ids: target.business_role_ids,
        role: target.role,
      },
      after: {
        system_permission: params.system_permission,
        business_role_ids: params.business_role_ids,
        role: legacyRole,
      },
    },
  })

  revalidatePath(`/admin/employees/${params.employeeId}`)
  revalidatePath('/admin/employees')
  return {}
}
