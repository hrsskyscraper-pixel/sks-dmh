'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminister } from '@/lib/permissions'

export interface CsvSkillRow {
  name: string
  category: string
  phase?: string
  standard_hours?: number | null
  is_checkpoint?: boolean
  target_date_hint?: string | null
}

export interface CsvImportResult {
  error?: string
  created: number
  assigned: number
  warnings: string[]
}

/**
 * CSVからスキルを一括作成し、指定プロジェクトに割り当てる
 */
export async function importSkillsFromCsv(params: {
  projectId: string
  rows: CsvSkillRow[]
}): Promise<CsvImportResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー', created: 0, assigned: 0, warnings: [] }

  const { data: emp } = await supabase.from('employees').select('role, system_permission').eq('auth_user_id', user.id).single()
  if (!emp || !canAdminister(emp)) {
    return { error: '権限がありません', created: 0, assigned: 0, warnings: [] }
  }

  const db = createAdminClient()

  // プロジェクト & フェーズ確認
  const { data: project } = await db.from('skill_projects').select('id').eq('id', params.projectId).single()
  if (!project) return { error: 'プロジェクトが見つかりません', created: 0, assigned: 0, warnings: [] }

  const { data: phases } = await db.from('project_phases').select('id, name').eq('project_id', params.projectId)
  const phaseByName: Record<string, string> = {}
  for (const p of phases ?? []) phaseByName[p.name.trim()] = p.id

  // 既存スキル一覧（重複検出用）
  const { data: existingSkills } = await db.from('skills').select('id, name')
  const skillByName: Record<string, string> = {}
  for (const s of existingSkills ?? []) skillByName[s.name.trim()] = s.id

  // 最大 order_index
  const { data: maxOrder } = await db.from('skills')
    .select('order_index').order('order_index', { ascending: false }).limit(1).single()
  let nextOrder = (maxOrder?.order_index ?? 0) + 1

  const warnings: string[] = []
  let created = 0
  let assigned = 0

  for (let i = 0; i < params.rows.length; i++) {
    const row = params.rows[i]
    const lineNo = i + 2 // ヘッダー+1
    if (!row.name || !row.name.trim()) {
      warnings.push(`${lineNo}行目: スキル名が空のためスキップ`)
      continue
    }
    if (!row.category || !row.category.trim()) {
      warnings.push(`${lineNo}行目: カテゴリが空のためスキップ（${row.name}）`)
      continue
    }

    const trimName = row.name.trim()
    let skillId = skillByName[trimName]

    // 新規作成（既存スキル名と重複する場合は再利用）
    if (!skillId) {
      const { data: createdSkill, error: createErr } = await db.from('skills').insert({
        name: trimName,
        category: row.category.trim(),
        order_index: nextOrder++,
        standard_hours: row.standard_hours ?? null,
        is_checkpoint: !!row.is_checkpoint,
        target_date_hint: row.target_date_hint ?? null,
      }).select('id').single()
      if (createErr || !createdSkill) {
        warnings.push(`${lineNo}行目: スキル作成失敗 ${trimName}: ${createErr?.message ?? 'unknown'}`)
        continue
      }
      skillId = createdSkill.id
      skillByName[trimName] = skillId
      created++
    } else {
      warnings.push(`${lineNo}行目: 既存スキル「${trimName}」を再利用`)
    }

    // フェーズ解決
    let phaseId: string | null = null
    if (row.phase && row.phase.trim()) {
      phaseId = phaseByName[row.phase.trim()] ?? null
      if (!phaseId) {
        warnings.push(`${lineNo}行目: フェーズ「${row.phase}」が見つかりません。未設定として登録`)
      }
    }

    // 既にこのプロジェクトに割り当て済みか？
    const { data: existingAssignment } = await db
      .from('project_skills')
      .select('skill_id')
      .eq('project_id', params.projectId)
      .eq('skill_id', skillId)
      .maybeSingle()

    if (existingAssignment) {
      // フェーズだけ更新
      if (phaseId) {
        await db.from('project_skills')
          .update({ project_phase_id: phaseId })
          .eq('project_id', params.projectId)
          .eq('skill_id', skillId)
      }
    } else {
      const { error: asgnErr } = await db.from('project_skills').insert({
        project_id: params.projectId,
        skill_id: skillId,
        project_phase_id: phaseId,
      })
      if (asgnErr) {
        warnings.push(`${lineNo}行目: プロジェクト割当失敗 ${trimName}: ${asgnErr.message}`)
        continue
      }
      assigned++
    }
  }

  revalidatePath('/admin/projects')
  return { created, assigned, warnings }
}
