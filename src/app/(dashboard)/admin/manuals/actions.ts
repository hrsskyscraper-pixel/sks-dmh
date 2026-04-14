'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeForMatch, scoreManualForSkill } from '@/lib/manual-matching'
import { inferBrandsFromFolderPath, isBrandCompatible } from '@/lib/brand-inference'

/**
 * スキルのブランドを推論
 * skill → project_skills → project_teams → teams.brand_id
 * 複数プロジェクトに所属する場合はユニオン
 */
async function buildSkillBrandsMap(
  db: ReturnType<typeof createAdminClient>
): Promise<Record<string, string[]>> {
  const [{ data: projectSkills }, { data: projectTeams }, { data: teams }] = await Promise.all([
    db.from('project_skills').select('project_id, skill_id'),
    db.from('project_teams').select('project_id, team_id'),
    db.from('teams').select('id, brand_id'),
  ])
  const teamBrand: Record<string, string> = {}
  for (const t of teams ?? []) if (t.brand_id) teamBrand[t.id] = t.brand_id
  // project_id → brand_ids Set
  const projectBrands: Record<string, Set<string>> = {}
  for (const pt of projectTeams ?? []) {
    const b = teamBrand[pt.team_id]
    if (!b) continue
    if (!projectBrands[pt.project_id]) projectBrands[pt.project_id] = new Set()
    projectBrands[pt.project_id].add(b)
  }
  // skill_id → brand_ids Set
  const skillBrands: Record<string, Set<string>> = {}
  for (const ps of projectSkills ?? []) {
    const pb = projectBrands[ps.project_id]
    if (!pb) continue
    if (!skillBrands[ps.skill_id]) skillBrands[ps.skill_id] = new Set()
    for (const b of pb) skillBrands[ps.skill_id].add(b)
  }
  const result: Record<string, string[]> = {}
  for (const sid in skillBrands) result[sid] = [...skillBrands[sid]]
  return result
}

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

  // ブランド一覧取得（フォルダから推定するために必要）
  const { data: brandRows } = await db.from('brands').select('id, code, name').order('sort_order')
  const brands = brandRows ?? []

  // 既存マニュアル一覧取得（ブランド設定も取得）
  const { data: existing } = await db.from('manual_library').select('id, teachme_manual_id, title, url, access_count, brand_ids')
  const existingByTid: Record<string, { id: string; title: string; url: string; access_count: number; brand_ids: string[] }> = {}
  for (const e of existing ?? []) existingByTid[e.teachme_manual_id] = { ...e, brand_ids: e.brand_ids ?? [] }

  const csvTids = new Set(rows.map(r => r.teachmeManualId))
  let inserted = 0, updated = 0, archived = 0

  for (const row of rows) {
    if (!row.teachmeManualId || !row.title || !row.url) {
      warnings.push(`スキップ: 必須項目不足 (${row.title ?? row.url ?? '?'})`)
      continue
    }
    const existingRow = existingByTid[row.teachmeManualId]
    const folderPath = row.folderPath.length > 0 ? row.folderPath : null

    // フォルダパスからブランドを推論
    const inferredBrands = inferBrandsFromFolderPath(folderPath, brands, 'cocoichi')

    const basePayload = {
      teachme_manual_id: row.teachmeManualId,
      title: row.title,
      url: row.url,
      folder_path: folderPath,
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
        ...basePayload,
        updated_at: new Date().toISOString(),
      }).eq('id', existingRow.id)
      if (error) warnings.push(`更新失敗 ${row.title}: ${error.message}`)
      else updated++
    } else {
      // 新規時のみブランドを自動設定
      const { error } = await db.from('manual_library').insert({
        ...basePayload,
        brand_ids: inferredBrands,
      })
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

  // 自動マッピング（ブランド互換性チェック付き）
  const { data: allSkills } = await db.from('skills').select('id, name')
  const { data: allManuals } = await db.from('manual_library')
    .select('id, title, folder_path, search_tags, access_count, views_within_a_year, archived, brand_ids')
    .eq('archived', false)
  const { data: existingLinks } = await db.from('skill_manuals').select('skill_id, manual_id')
  const linkedSet = new Set((existingLinks ?? []).map(l => `${l.skill_id}:${l.manual_id}`))
  const skillBrandsMap = await buildSkillBrandsMap(db)
  const manualById2 = Object.fromEntries((allManuals ?? []).map(m => [m.id, m]))

  const manualsByNormalizedTitle: Record<string, string[]> = {}
  for (const m of allManuals ?? []) {
    const key = normalizeForMatch(m.title)
    if (!key) continue
    if (!manualsByNormalizedTitle[key]) manualsByNormalizedTitle[key] = []
    manualsByNormalizedTitle[key].push(m.id)
  }

  let autoLinked = 0
  for (const skill of allSkills ?? []) {
    const skillBrands = skillBrandsMap[skill.id] ?? []
    const exactIds = manualsByNormalizedTitle[normalizeForMatch(skill.name)] ?? []
    for (const manualId of exactIds) {
      const key = `${skill.id}:${manualId}`
      if (linkedSet.has(key)) continue
      const m = manualById2[manualId]
      if (!m || !isBrandCompatible(skillBrands, m.brand_ids ?? [])) continue
      const { error } = await db.from('skill_manuals').insert({
        skill_id: skill.id, manual_id: manualId, is_primary: true, display_order: 0,
      })
      if (!error) { autoLinked++; linkedSet.add(key) }
    }

    const usedManualIds = new Set(exactIds)
    for (const m of (allManuals ?? []).filter(x => !usedManualIds.has(x.id))) {
      const key = `${skill.id}:${m.id}`
      if (linkedSet.has(key)) continue
      if (!isBrandCompatible(skillBrands, m.brand_ids ?? [])) continue
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

export interface PlannedLink {
  skillId: string
  skillName: string
  manualId: string
  manualTitle: string
  folderPath: string[]
  score: number
  isExact: boolean
}

/**
 * 全スキル × 全マニュアルを再評価して紐付け予定を計算
 * dryRun=true: 紐付けずに候補一覧を返す（プレビュー用）
 * dryRun=false: 実際に紐付けを実行
 */
export async function rerunAutoMapping(minScore: number = 50, dryRun: boolean = false): Promise<{
  error?: string
  exactLinked: number
  fuzzyLinked: number
  planned?: PlannedLink[]
}> {
  const check = await assertAdmin()
  if (check.error) return { error: check.error, exactLinked: 0, fuzzyLinked: 0 }
  const db = createAdminClient()

  const { data: allSkills } = await db.from('skills').select('id, name')
  const { data: allManuals } = await db.from('manual_library')
    .select('id, title, folder_path, search_tags, access_count, views_within_a_year, archived, brand_ids')
    .eq('archived', false)
  const { data: existingLinks } = await db.from('skill_manuals').select('skill_id, manual_id')
  const linkedSet = new Set((existingLinks ?? []).map(l => `${l.skill_id}:${l.manual_id}`))
  const skillBrandsMap = await buildSkillBrandsMap(db)

  const manualsByNormalizedTitle: Record<string, string[]> = {}
  for (const m of allManuals ?? []) {
    const key = normalizeForMatch(m.title)
    if (!key) continue
    if (!manualsByNormalizedTitle[key]) manualsByNormalizedTitle[key] = []
    manualsByNormalizedTitle[key].push(m.id)
  }
  const manualById = Object.fromEntries((allManuals ?? []).map(m => [m.id, m]))

  const planned: PlannedLink[] = []
  let exactLinked = 0, fuzzyLinked = 0

  for (const skill of allSkills ?? []) {
    const skillBrands = skillBrandsMap[skill.id] ?? []
    // 完全一致
    const exactIds = manualsByNormalizedTitle[normalizeForMatch(skill.name)] ?? []
    for (const manualId of exactIds) {
      const key = `${skill.id}:${manualId}`
      if (linkedSet.has(key)) continue
      const m = manualById[manualId]
      if (!m) continue
      if (!isBrandCompatible(skillBrands, m.brand_ids ?? [])) continue
      planned.push({
        skillId: skill.id, skillName: skill.name,
        manualId, manualTitle: m.title, folderPath: m.folder_path ?? [],
        score: 100, isExact: true,
      })
      if (!dryRun) {
        const { error } = await db.from('skill_manuals').insert({
          skill_id: skill.id, manual_id: manualId, is_primary: true, display_order: 0,
        })
        if (!error) { exactLinked++; linkedSet.add(key) }
      }
    }
    // 類似マッチ
    const usedManualIds = new Set(exactIds)
    for (const m of (allManuals ?? []).filter(x => !usedManualIds.has(x.id))) {
      const key = `${skill.id}:${m.id}`
      if (linkedSet.has(key)) continue
      if (!isBrandCompatible(skillBrands, m.brand_ids ?? [])) continue
      const score = scoreManualForSkill(skill.name, m)
      if (score >= minScore) {
        planned.push({
          skillId: skill.id, skillName: skill.name,
          manualId: m.id, manualTitle: m.title, folderPath: m.folder_path ?? [],
          score, isExact: false,
        })
        if (!dryRun) {
          const { error } = await db.from('skill_manuals').insert({
            skill_id: skill.id, manual_id: m.id, is_primary: false, display_order: 0,
          })
          if (!error) { fuzzyLinked++; linkedSet.add(key) }
        }
      }
    }
  }

  if (!dryRun) {
    revalidatePath('/admin/manuals')
    revalidatePath('/skills')
  }
  return { exactLinked, fuzzyLinked, planned: dryRun ? planned.sort((a, b) => b.score - a.score) : undefined }
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
