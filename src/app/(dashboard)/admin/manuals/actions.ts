'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ADMIN_ROLES = ['admin', 'ops_manager', 'executive', 'testuser']

export interface CsvManualRow {
  folderPath: string[]
  title: string
  url: string
  publishStatus: string | null
  accessCount: number
  viewsWithinAYear: number
  searchTags: string[] | null
  archived: boolean
  sourceUpdatedAt: string | null
  teachmeManualId: string
}

export interface ManualImportResult {
  error?: string
  inserted: number
  updated: number
  archived: number
  autoLinked: number  // タイトル完全一致でスキルに自動紐付けた件数
  warnings: string[]
}

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' as const }
  const { data: emp } = await supabase.from('employees').select('role').eq('auth_user_id', user.id).single()
  if (!emp || !ADMIN_ROLES.includes(emp.role)) return { error: '権限がありません' as const }
  return { ok: true as const }
}

/**
 * CSVから差分取り込み
 * - 新規: insert
 * - 既存（teachme_manual_id 一致）: update（title/url/views 等を最新に）
 * - CSVに無いが DB にあるもの: archived=true にする（削除はせず履歴保持）
 * - 初回のみ: タイトル完全一致するスキルに自動で紐付け
 */
export async function importManualsFromCsv(rows: CsvManualRow[]): Promise<ManualImportResult> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error, inserted: 0, updated: 0, archived: 0, autoLinked: 0, warnings: [] }

  const db = createAdminClient()
  const warnings: string[] = []

  // 既存マニュアル一覧取得
  const { data: existing } = await db.from('manual_library').select('id, teachme_manual_id, title, url, access_count')
  const existingByTid: Record<string, { id: string; title: string; url: string; access_count: number }> = {}
  for (const e of existing ?? []) existingByTid[e.teachme_manual_id] = e

  const csvTids = new Set(rows.map(r => r.teachmeManualId))
  let inserted = 0, updated = 0, archived = 0

  for (const row of rows) {
    if (!row.teachmeManualId || !row.title || !row.url) {
      warnings.push(`スキップ: 必須項目不足 (${row.title ?? row.url ?? '?'})`)
      continue
    }
    const existingRow = existingByTid[row.teachmeManualId]
    const payload = {
      teachme_manual_id: row.teachmeManualId,
      title: row.title,
      url: row.url,
      folder_path: row.folderPath.length > 0 ? row.folderPath : null,
      publish_status: row.publishStatus,
      access_count: row.accessCount,
      views_within_a_year: row.viewsWithinAYear,
      search_tags: row.searchTags,
      archived: row.archived,
      source_updated_at: row.sourceUpdatedAt,
      synced_at: new Date().toISOString(),
    }

    if (existingRow) {
      const { error } = await db.from('manual_library').update({
        ...payload,
        updated_at: new Date().toISOString(),
      }).eq('id', existingRow.id)
      if (error) warnings.push(`更新失敗 ${row.title}: ${error.message}`)
      else updated++
    } else {
      const { error } = await db.from('manual_library').insert(payload)
      if (error) warnings.push(`追加失敗 ${row.title}: ${error.message}`)
      else inserted++
    }
  }

  // CSVに無くなったものはアーカイブ扱い
  const tidsToArchive = Object.keys(existingByTid).filter(tid => !csvTids.has(tid))
  if (tidsToArchive.length > 0) {
    const { error } = await db.from('manual_library')
      .update({ archived: true, updated_at: new Date().toISOString() })
      .in('teachme_manual_id', tidsToArchive)
    if (!error) archived = tidsToArchive.length
  }

  // 初回の自動マッピング: タイトル完全一致するスキル ↔ マニュアルを紐付け
  // （既に紐付いているものはスキップ）
  const { data: allSkills } = await db.from('skills').select('id, name')
  const { data: allManuals } = await db.from('manual_library').select('id, title, archived').eq('archived', false)
  const { data: existingLinks } = await db.from('skill_manuals').select('skill_id, manual_id')
  const linkedSet = new Set((existingLinks ?? []).map(l => `${l.skill_id}:${l.manual_id}`))

  const manualsByTitle: Record<string, string[]> = {}  // title → manual_ids
  for (const m of allManuals ?? []) {
    const key = m.title.trim()
    if (!manualsByTitle[key]) manualsByTitle[key] = []
    manualsByTitle[key].push(m.id)
  }

  let autoLinked = 0
  for (const skill of allSkills ?? []) {
    const manualIds = manualsByTitle[skill.name.trim()] ?? []
    for (const manualId of manualIds) {
      const key = `${skill.id}:${manualId}`
      if (linkedSet.has(key)) continue
      const { error } = await db.from('skill_manuals').insert({
        skill_id: skill.id,
        manual_id: manualId,
        is_primary: true,
        display_order: 0,
      })
      if (!error) {
        autoLinked++
        linkedSet.add(key)
      }
    }
  }

  revalidatePath('/admin/manuals')
  revalidatePath('/skills')
  return { inserted, updated, archived, autoLinked, warnings }
}

export async function linkSkillManual(params: {
  skillId: string
  manualId: string
  isPrimary?: boolean
}): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error }
  const db = createAdminClient()
  const { error } = await db.from('skill_manuals').insert({
    skill_id: params.skillId,
    manual_id: params.manualId,
    is_primary: !!params.isPrimary,
    display_order: 0,
  })
  if (error) return { error: error.message }
  revalidatePath('/admin/manuals')
  revalidatePath('/skills')
  return {}
}

export async function unlinkSkillManual(params: {
  skillId: string
  manualId: string
}): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error }
  const db = createAdminClient()
  const { error } = await db.from('skill_manuals').delete()
    .eq('skill_id', params.skillId)
    .eq('manual_id', params.manualId)
  if (error) return { error: error.message }
  revalidatePath('/admin/manuals')
  revalidatePath('/skills')
  return {}
}

export async function toggleSkillManualPrimary(params: {
  skillId: string
  manualId: string
  isPrimary: boolean
}): Promise<{ error?: string }> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error }
  const db = createAdminClient()
  const { error } = await db.from('skill_manuals').update({ is_primary: params.isPrimary })
    .eq('skill_id', params.skillId)
    .eq('manual_id', params.manualId)
  if (error) return { error: error.message }
  revalidatePath('/admin/manuals')
  revalidatePath('/skills')
  return {}
}
