/**
 * マイルストーン（級・全体ゴール）の到達状況を計算する。
 *
 * 数え方（2026-09-19 MTG 決定）:
 * - 級（milestone_kind = 'grade'）: 「調理3級まであと○項目」= 同じ区分（category）で、カリキュラム上その行より
 *   手前に並ぶスキルのうち、まだ認定されていない数。並びは「フェーズの順 → スキルの order_index」。
 * - 全体ゴール（milestone_kind = 'goal'）: カリキュラムの全スキル（自分自身を除く）のうち未認定の数。
 * - 級の行そのものは前提に含めない。前提が 0 になったら、その行を申請 → 認定で到達（認定操作を挟む）。
 */
export type MilestoneKind = 'grade' | 'goal'

/** certified: 到達済み / pending: 級の行を申請中 / ready: 前提が揃い、級の行を申請できる / in_progress: 前提が残っている */
export type MilestoneStatus = 'certified' | 'pending' | 'ready' | 'in_progress'

export interface MilestoneSkillLike {
  id: string
  name: string
  category: string
  order_index: number
  milestone_kind?: MilestoneKind | null
  milestone_cert?: string | null
}

export interface MilestoneProgress {
  skillId: string
  name: string
  kind: MilestoneKind
  /** 到達時に自動登録する社内資格名（null は到達表示のみ） */
  cert: string | null
  category: string
  /** 前提スキルの総数 */
  total: number
  /** 前提のうち認定済みの数 */
  done: number
  /** あと○項目 */
  remaining: number
  status: MilestoneStatus
  /** 未認定の前提（並び順）。画面で「次はこれ」を出すために先頭数件を使う */
  remainingSkills: { id: string; name: string }[]
}

/**
 * @param skills        全スキル（カリキュラム外を含んでよい。skillPhaseMap にあるものだけを対象にする）
 * @param skillPhaseMap カリキュラムに含まれるスキル → フェーズID（未設定は null）。キーの有無で「カリキュラム内」を判定
 * @param phases        カリキュラムのフェーズ（order_index で並び）
 * @param achievements  本人の申請（skill_id, status）
 */
export function computeMilestones(
  skills: MilestoneSkillLike[],
  skillPhaseMap: Record<string, string | null>,
  phases: { id: string; order_index: number }[],
  achievements: { skill_id: string; status: string }[],
): MilestoneProgress[] {
  const phaseOrder: Record<string, number> = Object.fromEntries(phases.map(p => [p.id, p.order_index]))
  const UNASSIGNED = 1_000_000
  const sortKey = (s: MilestoneSkillLike) => {
    const ph = skillPhaseMap[s.id]
    const po = ph ? (phaseOrder[ph] ?? UNASSIGNED) : UNASSIGNED
    return po * 100_000 + s.order_index
  }
  const inCurriculum = skills
    .filter(s => Object.prototype.hasOwnProperty.call(skillPhaseMap, s.id))
    .sort((a, b) => sortKey(a) - sortKey(b))

  const certified = new Set(achievements.filter(a => a.status === 'certified').map(a => a.skill_id))
  const pending = new Set(achievements.filter(a => a.status === 'pending').map(a => a.skill_id))

  const result: MilestoneProgress[] = []
  for (const m of inCurriculum) {
    if (m.milestone_kind !== 'grade' && m.milestone_kind !== 'goal') continue
    const key = sortKey(m)
    const prereq = m.milestone_kind === 'grade'
      ? inCurriculum.filter(s => s.id !== m.id && s.category === m.category && sortKey(s) < key)
      : inCurriculum.filter(s => s.id !== m.id)
    const remainingSkills = prereq.filter(s => !certified.has(s.id)).map(s => ({ id: s.id, name: s.name }))
    const status: MilestoneStatus = certified.has(m.id)
      ? 'certified'
      : pending.has(m.id)
        ? 'pending'
        : remainingSkills.length === 0
          ? 'ready'
          : 'in_progress'
    result.push({
      skillId: m.id,
      name: m.name,
      kind: m.milestone_kind,
      cert: m.milestone_cert ?? null,
      category: m.category,
      total: prereq.length,
      done: prereq.length - remainingSkills.length,
      remaining: remainingSkills.length,
      status,
      remainingSkills,
    })
  }
  return result
}

/** 全角・半角の数字を揃えて比較するための正規化（「調理3級」と「調理３級」を同一視） */
export function normalizeCertName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '')
}
