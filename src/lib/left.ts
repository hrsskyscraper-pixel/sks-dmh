/**
 * 退職日の判定（2026-09-20 決定: 退職日を過ぎたアカウントは使えない）。
 * 日付の区切りは JST。画面の入口（(dashboard)/layout.tsx）だけでなく、API・サーバーアクションでも同じ判定を使う。
 */

/** 今日の日付（JST, YYYY-MM-DD） */
export function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 退職日を迎えている（当日を含む） */
export function hasLeft(leftAt: string | null | undefined): boolean {
  return !!leftAt && leftAt <= todayJst()
}

/** PostgREST の .or() に渡す「まだ退職日を迎えていない」条件 */
export function notLeftFilter(): string {
  return `left_at.is.null,left_at.gt.${todayJst()}`
}
