/**
 * スキル名 × マニュアルの類似度スコアリング
 * タイトル・フォルダパス・検索タグを総合評価して関連度を数値化
 */

/**
 * 前処理: 番号プレフィックス除去、空白除去、小文字化
 * 例: "01.身だしなみ" → "身だしなみ"
 *     "1-2. 接客マナー" → "接客マナー"
 */
export function normalizeForMatch(s: string): string {
  if (!s) return ''
  return s
    // 先頭の番号プレフィックス ("01.", "1.", "3-1.", "第1章" など) を除去
    .replace(/^(第)?[\d０-９]+[-._)）章節]?\s*[\d０-９]*[-._)）章節]?\s*/, '')
    // 全角記号/空白の正規化
    .replace(/[\s　]/g, '')
    .replace(/[・.、。,/\\]/g, '')
    .toLowerCase()
}

/**
 * 文字列を2文字ずつのbigramセットに分解（日本語の類似度計算に有効）
 */
function bigrams(s: string): Set<string> {
  const set = new Set<string>()
  if (s.length < 2) {
    if (s) set.add(s)
    return set
  }
  for (let i = 0; i < s.length - 1; i++) {
    set.add(s.substring(i, i + 2))
  }
  return set
}

/**
 * Jaccard係数 (0〜1): 2つの文字列のbigramが重なる割合
 */
function bigramSimilarity(a: string, b: string): number {
  const aBi = bigrams(a)
  const bBi = bigrams(b)
  if (aBi.size === 0 || bBi.size === 0) return 0
  let intersection = 0
  for (const g of aBi) if (bBi.has(g)) intersection++
  const union = aBi.size + bBi.size - intersection
  return union === 0 ? 0 : intersection / union
}

export interface ManualForScore {
  id: string
  title: string
  folder_path: string[] | null
  search_tags: string[] | null
  access_count: number
  views_within_a_year: number
}

/**
 * スコア計算
 * - 0〜100+ のスケール
 * - 50 以上: かなり関連性が高い
 * - 20 以上: ある程度関連
 * - それ以下: 関連薄
 */
export function scoreManualForSkill(skillName: string, manual: ManualForScore): number {
  const skill = normalizeForMatch(skillName)
  const title = normalizeForMatch(manual.title)
  if (!skill || !title) return 0

  let score = 0

  // タイトル: 完全一致 / 包含 / bigram類似度
  if (skill === title) {
    score += 100
  } else if (title.includes(skill) && skill.length >= 2) {
    score += 60 + skill.length  // より長く一致すれば加点
  } else if (skill.includes(title) && title.length >= 2) {
    score += 45 + title.length
  } else {
    score += bigramSimilarity(skill, title) * 40
  }

  // フォルダパス: 含有 / 類似度
  for (const folder of manual.folder_path ?? []) {
    const f = normalizeForMatch(folder)
    if (!f) continue
    if (f === skill) score += 25
    else if (f.includes(skill) && skill.length >= 2) score += 15
    else if (skill.includes(f) && f.length >= 2) score += 10
    else score += bigramSimilarity(skill, f) * 15
  }

  // 検索タグ: 一致するほど加点
  for (const tag of manual.search_tags ?? []) {
    const t = normalizeForMatch(tag)
    if (!t) continue
    if (t === skill) score += 20
    else if (t.includes(skill) || skill.includes(t)) score += 10
    else score += bigramSimilarity(skill, t) * 8
  }

  // 人気度ブースト (小) — 同スコアの場合に閲覧数が多いマニュアルを優先
  score += Math.log10(Math.max(1, manual.access_count + 1)) * 0.5

  return score
}

export function rankManualsForSkill<T extends ManualForScore>(
  skillName: string,
  manuals: T[],
  options: { minScore?: number; limit?: number } = {},
): { manual: T; score: number }[] {
  const { minScore = 5, limit = 8 } = options
  return manuals
    .map(m => ({ manual: m, score: scoreManualForSkill(skillName, m) }))
    .filter(x => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}
