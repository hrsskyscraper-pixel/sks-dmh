import type { MilestoneMap, ProjectPhase } from '@/types/database'

/**
 * project_phases 配列から MilestoneMap を構築する
 * order_index 順にソートし、start/end を計算する
 */
export function buildMilestoneMap(
  phases: Pick<ProjectPhase, 'name' | 'order_index' | 'end_hours'>[]
): MilestoneMap {
  const sorted = [...phases].sort((a, b) => a.order_index - b.order_index)
  let prev = 0
  const map: MilestoneMap = {}
  for (const phase of sorted) {
    map[phase.name] = { start: prev, end: phase.end_hours }
    prev = phase.end_hours
  }
  return map
}

/**
 * 全体の標準進捗率(%)を計算する
 * フェーズごとの標準進捗 × スキル数比率の加重平均
 */
export function calcStandardPct(
  cumulativeHours: number,
  milestoneMap: MilestoneMap,
  skillsByPhase: Record<string, number>,
  totalSkills: number
): number {
  if (totalSkills === 0) return 0
  let expected = 0
  for (const [phaseName, m] of Object.entries(milestoneMap)) {
    if (!m || m.end <= m.start) continue
    const phasePct =
      cumulativeHours <= m.start ? 0
      : cumulativeHours >= m.end ? 100
      : Math.round((cumulativeHours - m.start) / (m.end - m.start) * 100)
    expected += Math.round(phasePct * (skillsByPhase[phaseName] ?? 0) / 100)
  }
  return Math.round((expected / totalSkills) * 100)
}

/**
 * 単一フェーズの標準進捗率(%)を計算する
 */
export function calcPhasePct(
  cumulativeHours: number,
  m: { start: number; end: number }
): number {
  if (m.end <= m.start) return 0
  if (cumulativeHours <= m.start) return 0
  if (cumulativeHours >= m.end) return 100
  return Math.round((cumulativeHours - m.start) / (m.end - m.start) * 100)
}
