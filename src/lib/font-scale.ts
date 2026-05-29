// ユーザーごとの文字サイズ設定（UI全体のスケール、単位 %）。
// employees.font_scale に保存し、<html> の font-size に % として適用する。
// SSR 時のチラつき（FOUC）防止のため、同名 Cookie をレンダリングキャッシュとして併用する。
// DB が正で、Cookie はあくまで高速読み出し用のミラー。

export const FONT_SCALE_COOKIE = 'font_scale'

export const DEFAULT_FONT_SCALE = 100

export const FONT_SCALE_OPTIONS = [
  { value: 88, label: '小' },
  { value: 100, label: '標準' },
  { value: 115, label: '大' },
  { value: 130, label: '特大' },
] as const

export type FontScale = (typeof FONT_SCALE_OPTIONS)[number]['value']

/** 許可された文字サイズ値かどうか */
export function isValidFontScale(n: number): n is FontScale {
  return FONT_SCALE_OPTIONS.some(o => o.value === n)
}

/** 任意の入力を有効な文字サイズへ正規化（不正値はデフォルト） */
export function normalizeFontScale(n: number | string | null | undefined): FontScale {
  const num = typeof n === 'string' ? Number(n) : n
  return typeof num === 'number' && isValidFontScale(num) ? num : DEFAULT_FONT_SCALE
}
