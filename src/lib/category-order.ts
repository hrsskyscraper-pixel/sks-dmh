/**
 * カテゴリの表示順序
 * 新規カテゴリは「発注」と「事務」の間に挿入される
 */
const FIXED_ORDER = ['接客', '調理', '発注', /* 新規はここ */ '事務', '管理']

export function sortCategories(categories: string[]): string[] {
  return [...categories].sort((a, b) => {
    const idxA = FIXED_ORDER.indexOf(a)
    const idxB = FIXED_ORDER.indexOf(b)
    // 両方固定順にある
    if (idxA >= 0 && idxB >= 0) return idxA - idxB
    // aだけ固定順にない → 発注(idx=2)の後、事務(idx=3)の前 = 2.5扱い
    if (idxA < 0 && idxB >= 0) return (idxB <= 2 ? 1 : -1)
    if (idxA >= 0 && idxB < 0) return (idxA <= 2 ? -1 : 1)
    // 両方固定順にない → 名前順
    return a.localeCompare(b, 'ja')
  })
}
