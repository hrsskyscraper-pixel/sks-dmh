import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { isMilestoneBlocked, milestoneOf, prerequisiteNote, type MilestoneSkillLike } from '@/lib/milestones'

/**
 * 申請中の目標・最終目標について、前提（手前の目標・同じフェーズのスキル）が揃っているかをサーバー側で判定する（2026-10-25）。
 * 申請画面の判定はブラウザの中だけなので、承認する人が承認センターで「前提未認定」を見られるようにする。
 * - 目標が入っているカリキュラムのどれか1つで揃っていれば、揃っているとみなす
 * - 返すのは、揃っていない申請の id → 注記（例:「【手前の目標が未認定】接客３級審査合格」）
 */
export async function milestonePrereqNotes(
  db: SupabaseClient,
  rows: { id: string; employee_id: string; skill_id: string }[],
): Promise<Record<string, string>> {
  if (rows.length === 0) return {}
  const skills = await fetchAllRows<MilestoneSkillLike>((from, to) =>
    db.from('skills').select('id, name, category, order_index, milestone_kind, milestone_cert').order('id').range(from, to),
  )
  const milestoneIds = new Set(skills.filter(s => s.milestone_kind === 'grade' || s.milestone_kind === 'goal').map(s => s.id))
  const targets = rows.filter(r => milestoneIds.has(r.skill_id))
  if (targets.length === 0) return {}

  const { data: owners, error: ownersErr } = await db.from('project_skills').select('project_id').in('skill_id', [...new Set(targets.map(r => r.skill_id))])
  if (ownersErr) throw new Error(ownersErr.message)
  const projectIds = [...new Set((owners ?? []).map(o => o.project_id as string))]
  if (projectIds.length === 0) return {}
  // 申請者が多いと URL が長くなるので、100人ずつに分けて問い合わせる
  const employeeIds = [...new Set(targets.map(r => r.employee_id))]
  const chunks: string[][] = []
  for (let i = 0; i < employeeIds.length; i += 100) chunks.push(employeeIds.slice(i, i + 100))
  const [projectSkills, { data: phaseRows, error: phaseErr }, certifiedChunks] = await Promise.all([
    fetchAllRows<{ project_id: string; skill_id: string; project_phase_id: string | null }>((from, to) =>
      db.from('project_skills').select('project_id, skill_id, project_phase_id').in('project_id', projectIds)
        .order('project_id').order('skill_id').range(from, to),
    ),
    db.from('project_phases').select('id, project_id, order_index').in('project_id', projectIds),
    Promise.all(chunks.map(ids => fetchAllRows<{ id: string; employee_id: string; skill_id: string; status: string }>((from, to) =>
      db.from('achievements').select('id, employee_id, skill_id, status').eq('status', 'certified')
        .in('employee_id', ids).order('id').range(from, to),
    ))),
  ])
  if (phaseErr) throw new Error(phaseErr.message)
  const certified = certifiedChunks.flat()

  const mapByProject: Record<string, Record<string, string | null>> = {}
  for (const ps of projectSkills) (mapByProject[ps.project_id] ??= {})[ps.skill_id] = ps.project_phase_id
  const phasesByProject: Record<string, { id: string; order_index: number }[]> = {}
  for (const ph of phaseRows ?? []) (phasesByProject[ph.project_id as string] ??= []).push({ id: ph.id as string, order_index: ph.order_index as number })
  const certByEmployee: Record<string, { skill_id: string; status: string }[]> = {}
  for (const a of certified) (certByEmployee[a.employee_id] ??= []).push(a)

  const notes: Record<string, string> = {}
  for (const r of targets) {
    const results = projectIds
      .filter(p => Object.prototype.hasOwnProperty.call(mapByProject[p] ?? {}, r.skill_id))
      .map(p => milestoneOf(r.skill_id, skills, mapByProject[p], phasesByProject[p] ?? [], certByEmployee[r.employee_id] ?? []))
    if (results.length === 0 || results.some(m => !isMilestoneBlocked(m))) continue
    const note = prerequisiteNote(results[0])
    if (note) notes[r.id] = note
  }
  return notes
}
