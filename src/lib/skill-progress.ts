import type { MilestoneMap } from '@/types/database'

type SkillLike = { id: string; order_index: number }
type PhaseLike = { id: string; name: string }

/**
 * スキルの「目安習得時間」を、所属フェーズのマイルストーン（start/end 時間）と
 * フェーズ内の並び順から補間して算出する。ホーム／スキルページ／ナビ件数で共通利用。
 */
export function calcSkillTargetHours(
  skillId: string,
  allSkills: SkillLike[],
  skillPhaseMap: Record<string, string | null>,
  projectPhases: PhaseLike[],
  milestones: MilestoneMap,
): number {
  const phaseId = skillPhaseMap[skillId]
  const phase = projectPhases.find(p => p.id === phaseId)
  if (!phase) return 0
  const m = milestones[phase.name]
  if (!m || m.end <= m.start) return 0
  const phaseSkills = allSkills.filter(s => skillPhaseMap[s.id] === phaseId).sort((a, b) => a.order_index - b.order_index)
  const rank = phaseSkills.findIndex(s => s.id === skillId) + 1
  const total = phaseSkills.length
  if (total === 0) return 0
  return Math.round(m.start + (rank / total) * (m.end - m.start))
}

/**
 * 遅延スキル数 = 目安時間を累計勤務時間が過ぎているのに、未認定かつ未申請のスキル数。
 */
export function countOverdueSkills(
  skills: SkillLike[],
  certifiedIds: Set<string>,
  pendingIds: Set<string>,
  skillPhaseMap: Record<string, string | null>,
  projectPhases: PhaseLike[],
  milestones: MilestoneMap,
  cumulativeHours: number,
): number {
  let n = 0
  for (const s of skills) {
    const t = calcSkillTargetHours(s.id, skills, skillPhaseMap, projectPhases, milestones)
    if (t > 0 && t <= cumulativeHours && !certifiedIds.has(s.id) && !pendingIds.has(s.id)) n++
  }
  return n
}
