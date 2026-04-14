'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ops_manager', 'executive', 'testuser']

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' as const }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || !ADMIN_ROLES.includes(emp.role)) return { error: '権限がありません' as const }
  return { ok: true as const }
}

/** ブランド作成 */
export async function createBrand(data: { name: string; code: string; color?: string | null }): Promise<{ error?: string; id?: string }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error }
  const db = createAdminClient()
  const { data: maxOrder } = await db.from('brands').select('sort_order').order('sort_order', { ascending: false }).limit(1).single()
  const nextOrder = (maxOrder?.sort_order ?? 0) + 10
  const { data: created, error } = await db.from('brands').insert({
    name: data.name.trim(),
    code: data.code.trim(),
    color: data.color ?? null,
    sort_order: nextOrder,
  }).select('id').single()
  if (error) return { error: error.message }
  revalidatePath('/admin/brands')
  return { id: created.id }
}

/** ブランド更新 */
export async function updateBrand(id: string, data: { name?: string; code?: string; color?: string | null; sort_order?: number }): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error }
  const db = createAdminClient()
  const { error } = await db.from('brands').update({
    ...data,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/brands')
  revalidatePath('/admin/teams')
  revalidatePath('/admin/manuals')
  return {}
}

/** ブランド削除（使われていればエラー） */
export async function deleteBrand(id: string): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error }
  const db = createAdminClient()
  // 使用中チェック
  const { count: teamCount } = await db.from('teams').select('*', { count: 'exact', head: true }).eq('brand_id', id)
  if ((teamCount ?? 0) > 0) return { error: `${teamCount}店舗で使用中のため削除できません` }
  const { data: manuals } = await db.from('manual_library').select('id').contains('brand_ids', [id]).limit(1)
  if ((manuals?.length ?? 0) > 0) return { error: 'マニュアルで使用中のため削除できません' }
  const { error } = await db.from('brands').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/brands')
  return {}
}

/** 店舗のブランド設定 */
export async function setTeamBrand(teamId: string, brandId: string | null): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error }
  const db = createAdminClient()
  const { error } = await db.from('teams').update({ brand_id: brandId, updated_at: new Date().toISOString() }).eq('id', teamId)
  if (error) return { error: error.message }
  revalidatePath('/admin/teams')
  revalidatePath('/admin/brands')
  return {}
}

/** 複数店舗に一括でブランド設定 */
export async function setTeamsBrand(teamIds: string[], brandId: string | null): Promise<{ error?: string; updated: number }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error, updated: 0 }
  if (teamIds.length === 0) return { updated: 0 }
  const db = createAdminClient()
  const { error } = await db.from('teams').update({ brand_id: brandId, updated_at: new Date().toISOString() }).in('id', teamIds)
  if (error) return { error: error.message, updated: 0 }
  revalidatePath('/admin/teams')
  revalidatePath('/admin/brands')
  return { updated: teamIds.length }
}

/** 個別マニュアルのブランド設定 */
export async function setManualBrands(manualId: string, brandIds: string[]): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error }
  const db = createAdminClient()
  const { error } = await db.from('manual_library').update({
    brand_ids: brandIds,
    updated_at: new Date().toISOString(),
  }).eq('id', manualId)
  if (error) return { error: error.message }
  revalidatePath('/admin/manuals')
  return {}
}

/**
 * フォルダパスのパターンで一括ブランド設定
 * 例: folderPathContains='ラーメン大戦争', brandId=<ramen id>
 *     → folder_path に「ラーメン大戦争」を含むマニュアル全てを その brand に
 */
export async function bulkAssignBrandByFolder(params: {
  folderPathContains: string
  brandId: string
  /** true: 既存のbrand_idsを置き換え / false: 既存に追加 */
  replace?: boolean
}): Promise<{ error?: string; updated: number }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error, updated: 0 }
  const db = createAdminClient()

  const needle = params.folderPathContains.trim()
  if (!needle) return { error: 'フォルダパス文字列が空です', updated: 0 }

  const { data: manuals } = await db.from('manual_library').select('id, brand_ids, folder_path')
  const targets = (manuals ?? []).filter(m => (m.folder_path ?? []).some(f => f.includes(needle)))
  let updated = 0
  for (const m of targets) {
    const current: string[] = m.brand_ids ?? []
    const next = params.replace
      ? [params.brandId]
      : (current.includes(params.brandId) ? current : [...current, params.brandId])
    const { error } = await db.from('manual_library').update({
      brand_ids: next,
      updated_at: new Date().toISOString(),
    }).eq('id', m.id)
    if (!error) updated++
  }
  revalidatePath('/admin/manuals')
  return { updated }
}

/** デフォルトブランド一括設定（brand_idsが空のマニュアルに指定ブランドを設定） */
export async function bulkAssignDefaultBrand(brandId: string): Promise<{ error?: string; updated: number }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error, updated: 0 }
  const db = createAdminClient()

  const { data: manuals } = await db.from('manual_library').select('id, brand_ids')
  const targets = (manuals ?? []).filter(m => (m.brand_ids ?? []).length === 0)
  let updated = 0
  for (const m of targets) {
    const { error } = await db.from('manual_library').update({
      brand_ids: [brandId],
      updated_at: new Date().toISOString(),
    }).eq('id', m.id)
    if (!error) updated++
  }
  revalidatePath('/admin/manuals')
  return { updated }
}
