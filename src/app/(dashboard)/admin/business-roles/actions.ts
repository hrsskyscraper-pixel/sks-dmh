'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit'
import { canAdminister } from '@/lib/permissions'
import type { SystemPermission } from '@/types/database'
import { notLeftFilter } from '@/lib/left'
import { deriveLegacyRole, standardPermissionOf, widerPermission } from '@/lib/legacy-role'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' as const }
  const { data: emp } = await supabase
    .from('employees')
    .select('id, role, system_permission')
    .eq('auth_user_id', user.id).or(notLeftFilter())
    .single()
  if (!canAdminister(emp)) return { error: '権限がありません' as const }
  return { ok: true as const, actorId: emp!.id, actorPermission: emp!.system_permission as SystemPermission }
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
  if ('actorId' in check) await writeAuditLog({ action: 'create_business_role', actorId: check.actorId, targetId: data.id, details: { name: name.trim() } }).catch(() => {})
  revalidatePath('/admin/business-roles')
  return { id: data.id }
}

/** 社内役職マスタ更新（名前・正式名称・標準の承認の権限・役員として扱う） */
export async function updateBusinessRole(id: string, patch: {
  name?: string
  sort_order?: number
  full_name?: string | null
  standard_permission?: 'training_member' | 'training_leader' | 'ops_admin' | null
  is_executive?: boolean
}): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if ('error' in check && check.error) return { error: check.error }
  const clean: typeof patch = {}
  if (patch.name !== undefined) { if (!patch.name.trim() || patch.name.trim().length > 40) return { error: '名称は1〜40文字です' }; clean.name = patch.name.trim() }
  if (patch.sort_order !== undefined) clean.sort_order = patch.sort_order
  if (patch.full_name !== undefined) { const f = patch.full_name?.trim() || null; if (f && f.length > 80) return { error: '正式名称は80文字までです' }; clean.full_name = f }
  if (patch.standard_permission !== undefined) {
    if (patch.standard_permission !== null && !['training_member', 'training_leader', 'ops_admin'].includes(patch.standard_permission)) return { error: '標準の承認の権限を選び直してください' }
    clean.standard_permission = patch.standard_permission
  }
  if (patch.is_executive !== undefined) clean.is_executive = !!patch.is_executive
  const db = createAdminClient()
  const { data: beforeRow } = await db.from('business_roles').select('name, full_name, standard_permission, is_executive, sort_order').eq('id', id).maybeSingle()
  const { error } = await db.from('business_roles').update({ ...clean, updated_at: new Date().toISOString() }).eq('id', id)
  if (!error && 'actorId' in check) await writeAuditLog({ action: 'update_business_role', actorId: check.actorId, targetId: id, details: { from: beforeRow, to: clean } }).catch(() => {})
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
  const { data: beforeRow } = await db.from('business_roles').select('name').eq('id', id).maybeSingle()
  const { error } = await db.from('business_roles').delete().eq('id', id)
  if (error) return { error: error.message }
  if ('actorId' in check) await writeAuditLog({ action: 'delete_business_role', actorId: check.actorId, targetId: id, details: { name: beforeRow?.name ?? null } }).catch(() => {})
  revalidatePath('/admin/business-roles')
  return {}
}

/** 社員の業務役職 + システム権限を更新（旧 role も dual-write） */
export async function updateEmployeePermission(params: {
  employeeId: string
  system_permission: SystemPermission
  business_role_ids: string[]
  employment_type?: '社員' | 'メイト'
}): Promise<{ error?: string; system_permission?: SystemPermission }> {
  const check = await assertAdmin()
  if ('error' in check && check.error) return { error: check.error }
  if (!('actorId' in check)) return { error: '権限がありません' }

  const db = createAdminClient()

  // 対象社員と現在値を取得
  const { data: target } = await db.from('employees').select('id, name, role, system_permission, business_role_ids, employment_type').eq('id', params.employeeId).single()
  if (!target) return { error: '対象社員が見つかりません' }

  if (!['training_member', 'training_leader', 'ops_admin', 'developer'].includes(params.system_permission)) return { error: 'システム権限を選び直してください' }
  // 開発者の権限を付ける・開発者の権限を変えるのは、開発者だけ（2026-10-27 セキュリティ監査）
  if ((params.system_permission === 'developer' || target.system_permission === 'developer') && check.actorPermission !== 'developer') {
    return { error: '開発者の権限を変えられるのは、開発者だけです' }
  }

  // 役職の設定を取得（旧 role の逆引き・標準の承認の権限に使用）
  const { data: businessRoles } = await db.from('business_roles').select('id, name, is_executive, standard_permission').in('id', params.business_role_ids.length > 0 ? params.business_role_ids : ['00000000-0000-0000-0000-000000000000'])
  const titles = businessRoles ?? []
  // 役職を変えたときだけ、新しい役職の標準の承認の権限まで上げる（案B 2026-10-27。画面でも、役職を付けた時点で上げて見せている）。
  // 役職を変えずに保存したときは、選んだ権限のまま（黙って上げ下げしない）
  const before = new Set(target.business_role_ids ?? [])
  const titlesChanged = params.business_role_ids.length !== before.size || params.business_role_ids.some(id => !before.has(id))
  if (titlesChanged) {
    const added = titles.filter(t => !before.has(t.id))
    params = { ...params, system_permission: widerPermission(params.system_permission, standardPermissionOf(added)) }
  }

  const legacyRole = deriveLegacyRole(params.system_permission, titles)
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
  // 実際に付けた権限（役職の標準まで上げたときは、選んだ値と違う）を返す
  return { system_permission: params.system_permission }
}

/**
 * チームのリーダー(team_managers)に登録済みなのに「メンバー権限」のままの社員へ
 * 「リーダー権限(training_leader)」を付与する。再発防止UI（承認センターの未設定リーダー一覧）から呼ぶ。
 * 業務役職は変更しない（旧 role は deriveLegacyRole の規則で同期）。
 */
export async function grantLeaderPermission(employeeId: string): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if ('error' in check && check.error) return { error: check.error }
  if (!('actorId' in check)) return { error: '権限がありません' }

  const db = createAdminClient()
  const { data: target } = await db
    .from('employees')
    .select('id, name, role, system_permission, business_role_ids')
    .eq('id', employeeId)
    .single()
  if (!target) return { error: '対象社員が見つかりません' }
  if (target.system_permission !== 'training_member') return { error: '既にメンバー以上の権限です' }

  const { data: businessRoles } = await db
    .from('business_roles')
    .select('name, is_executive')
    .in('id', (target.business_role_ids ?? []).length > 0 ? target.business_role_ids : ['00000000-0000-0000-0000-000000000000'])
  const legacyRole = deriveLegacyRole('training_leader', businessRoles ?? [])

  const { error } = await db.from('employees').update({
    system_permission: 'training_leader',
    role: legacyRole,
    updated_at: new Date().toISOString(),
  }).eq('id', employeeId)
  if (error) return { error: error.message }

  await writeAuditLog({
    action: 'update_employee_permission',
    actorId: check.actorId,
    targetId: employeeId,
    details: {
      name: target.name,
      before: { system_permission: target.system_permission, role: target.role },
      after: { system_permission: 'training_leader', role: legacyRole },
      source: 'unset_leader_card',
    },
  })

  revalidatePath('/approvals')
  revalidatePath('/admin/employees')
  return {}
}
