'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeForMatch, scoreManualForSkill } from '@/lib/manual-matching'

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

  // 自動マッピング:
  // ① 正規化後のタイトル完全一致 → is_primary=true で紐付け
  // ② 高スコア（80以上）の類似マッチ → is_primary=false で紐付け
  // （既に紐付いているものはスキップ）
  const { data: allSkills } = await db.from('skills').select('id, name')
  const { data: allManuals } = await db.from('manual_library')
    .select('id, title, folder_path, search_tags, access_count, views_within_a_year, archived')
    .eq('archived', false)
  const { data: existingLinks } = await db.from('skill_manuals').select('skill_id, manual_id')
  const linkedSet = new Set((existingLinks ?? []).map(l => `${l.skill_id}:${l.manual_id}`))

  // 正規化後タイトル → マニュアルIDリスト（完全一致用）
  const manualsByNormalizedTitle: Record<string, string[]> = {}
  for (const m of allManuals ?? []) {
    const key = normalizeForMatch(m.title)
    if (!key) continue
    if (!manualsByNormalizedTitle[key]) manualsByNormalizedTitle[key] = []
    manualsByNormalizedTitle[key].push(m.id)
  }

  let autoLinked = 0
  for (const skill of allSkills ?? []) {
    // ① 正規化後の完全一致
    const exactIds = manualsByNormalizedTitle[normalizeForMatch(skill.name)] ?? []
    for (const manualId of exactIds) {
      const key = `${skill.id}:${manualId}`
      if (linkedSet.has(key)) continue
      const { error } = await db.from('skill_manuals').insert({
        skill_id: skill.id, manual_id: manualId, is_primary: true, display_order: 0,
      })
      if (!error) { autoLinked++; linkedSet.add(key) }
    }

    // ② 高スコア類似マッチ（完全一致で紐付け済みのマニュアルは除外）
    const usedManualIds = new Set(exactIds)
    const candidates = (allManuals ?? []).filter(m => !usedManualIds.has(m.id))
    for (const m of candidates) {
      const key = `${skill.id}:${m.id}`
      if (linkedSet.has(key)) continue
      const score = scoreManualForSkill(skill.name, m)
      if (score >= 80) {
        const { error } = await db.from('skill_manuals').insert({
          skill_id: skill.id, manual_id: m.id, is_primary: false, display_order: 0,
        })
        if (!error) { autoLinked++; linkedSet.add(key) }
      }
    }
  }

  revalidatePath('/admin/manuals')
  revalidatePath('/skills')
  return { inserted, updated, archived, autoLinked, warnings }
}

/**
 * 既にCSV取込済みの状態で、全スキル × 全マニュアル を再評価して
 * スコア閾値以上のものを自動紐付け（既存紐付けはそのまま保持）
 */
export async function rerunAutoMapping(minScore: number = 50): Promise<{
  error?: string
  exactLinked: number
  fuzzyLinked: number
}> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error, exactLinked: 0, fuzzyLinked: 0 }
  const db = createAdminClient()

  const { data: allSkills } = await db.from('skills').select('id, name')
  const { data: allManuals } = await db.from('manual_library')
    .select('id, title, folder_path, search_tags, access_count, views_within_a_year, archived')
    .eq('archived', false)
  const { data: existingLinks } = await db.from('skill_manuals').select('skill_id, manual_id')
  const linkedSet = new Set((existingLinks ?? []).map(l => `${l.skill_id}:${l.manual_id}`))

  const manualsByNormalizedTitle: Record<string, string[]> = {}
  for (const m of allManuals ?? []) {
    const key = normalizeForMatch(m.title)
    if (!key) continue
    if (!manualsByNormalizedTitle[key]) manualsByNormalizedTitle[key] = []
    manualsByNormalizedTitle[key].push(m.id)
  }

  let exactLinked = 0, fuzzyLinked = 0
  for (const skill of allSkills ?? []) {
    const exactIds = manualsByNormalizedTitle[normalizeForMatch(skill.name)] ?? []
    for (const manualId of exactIds) {
      const key = `${skill.id}:${manualId}`
      if (linkedSet.has(key)) continue
      const { error } = await db.from('skill_manuals').insert({
        skill_id: skill.id, manual_id: manualId, is_primary: true, display_order: 0,
      })
      if (!error) { exactLinked++; linkedSet.add(key) }
    }
    const usedManualIds = new Set(exactIds)
    for (const m of (allManuals ?? []).filter(x => !usedManualIds.has(x.id))) {
      const key = `${skill.id}:${m.id}`
      if (linkedSet.has(key)) continue
      const score = scoreManualForSkill(skill.name, m)
      if (score >= minScore) {
        const { error } = await db.from('skill_manuals').insert({
          skill_id: skill.id, manual_id: m.id, is_primary: false, display_order: 0,
        })
        if (!error) { fuzzyLinked++; linkedSet.add(key) }
      }
    }
  }

  revalidatePath('/admin/manuals')
  revalidatePath('/skills')
  return { exactLinked, fuzzyLinked }
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
