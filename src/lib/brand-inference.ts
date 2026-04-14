/**
 * ブランド推論ロジック
 * - マニュアル: folder_path から推定
 * - スキル: 所属プロジェクトの参加チームから推定
 */

export interface BrandMeta {
  id: string
  code: string
  name: string
}

/**
 * フォルダパスからブランドを推定
 * - "ラーメン大戦争" を含む → ラーメンブランド
 * - それ以外で明確な判定ができない場合 → デフォルトブランド（通常 CoCo壱）
 * - "メンバー共通" 系はブランドなし（配列空）
 */
export function inferBrandsFromFolderPath(
  folderPath: string[] | null,
  brands: BrandMeta[],
  defaultBrandCode: string = 'cocoichi',
): string[] {
  if (!folderPath || folderPath.length === 0) {
    const d = brands.find(b => b.code === defaultBrandCode)
    return d ? [d.id] : []
  }
  // 共通フォルダは全ブランド共通（空配列）
  const commonMarkers = ['メンバー共通', 'サンプル', '共通', '共同編集者']
  if (folderPath.some(f => commonMarkers.some(c => f.includes(c)))) {
    return []
  }
  // ブランド名がフォルダ名に含まれるか
  const matched: string[] = []
  for (const b of brands) {
    // ブランドの名前を含む or 別名（code-based）
    const aliases = [b.name]
    // 特殊マッピング
    if (b.code === 'ramen_taisensou') aliases.push('ラーメン大戦争', 'ラーメン')
    if (b.code === 'cocoichi') aliases.push('CoCo壱', 'ココイチ', 'Nココ')
    if (b.code === 'flax_beauty') aliases.push('flax', 'FLAX', 'BEAUTY', 'サロン')
    if (folderPath.some(f => aliases.some(a => f.includes(a)))) {
      matched.push(b.id)
    }
  }
  if (matched.length > 0) return matched
  // マッチなし → デフォルトブランド
  const d = brands.find(b => b.code === defaultBrandCode)
  return d ? [d.id] : []
}

/**
 * ブランドの互換性チェック
 * skill のブランドと manual のブランドが互換か
 * - manual.brand_ids が空（共通） → 常に互換
 * - skill のブランド がない（全ブランド可） → 常に互換
 * - 両者に共通のブランドがある → 互換
 */
export function isBrandCompatible(
  skillBrandIds: string[],
  manualBrandIds: string[],
): boolean {
  if (manualBrandIds.length === 0) return true  // 共通マニュアル
  if (skillBrandIds.length === 0) return true   // ブランド制約なしのスキル
  return skillBrandIds.some(s => manualBrandIds.includes(s))
}
