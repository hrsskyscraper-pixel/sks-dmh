'use client'

import { useEffect } from 'react'
import { recheckLineFriendship } from '@/app/(dashboard)/line-actions'

/**
 * 「LINE連携済みだが line_friend≠true」のユーザーがダッシュボードを開いたとき、
 * セッション中に1回だけ、サーバー側で友だち状態を自動再判定する。
 *
 * 背景: line_friend を true にする経路は (a) 連携時のコールバック判定、
 * (b) 「友達追加成功を確認する」ボタン、の2つしかなく、LINE webhook が無いため、
 * 「連携後に友だち追加した」ケースが自動反映されず、バナーが出続けていた。
 * マウント時に silent recheck することで、友だち追加済みなら自動でバナーが消える。
 *
 * - sessionStorage で1セッション1回に制限（API/DBへの過剰アクセス防止）。
 * - silent（トースト等は出さない）。friend=true になれば server action 側の
 *   revalidatePath によりレイアウトが再描画され、バナー/ボタンが自動的に消える。
 *
 * @param active 「連携済みだが友だち未確認」状態のときのみ true を渡す。
 */
const STORAGE_KEY = 'line-friend-auto-rechecked'

export function useLineFriendAutoRecheck(active: boolean) {
  useEffect(() => {
    if (!active) return
    if (typeof window === 'undefined') return
    if (sessionStorage.getItem(STORAGE_KEY) === '1') return
    sessionStorage.setItem(STORAGE_KEY, '1')
    // 失敗（ネットワーク/設定エラー等）は silent に握りつぶす。
    // 手動の「確認する」ボタンが従来通りのフォールバックになる。
    recheckLineFriendship().catch(() => {})
  }, [active])
}
