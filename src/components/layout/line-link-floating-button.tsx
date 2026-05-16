'use client'

import { useState, useTransition } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { buildLineLoginAuthorizeUrl, LINE_OA_FRIEND_ADD_URL } from '@/lib/line-login'
import { recheckLineFriendship } from '@/app/(dashboard)/line-actions'

/**
 * LINE通知を受け取れていないユーザー向けの常時表示ボタン（下部ナビの上に浮かぶ）。
 *
 * 挙動の分岐:
 * - **未連携** (`!isLinked`): OAuth フロー（bot_prompt付き、連携と友だち追加を一度にやる）
 * - **連携済みだが公式アカウント未追加** (`isLinked && !friendLinked`):
 *   まず recheck で「もう友だち追加してたパターン」を拾い、その結果に応じて
 *   友だち追加URLを案内するトーストを出す（toast の action から LINE OA を開ける）。
 *   OAuth は使わない（code 2重消費で token_failed になりやすいため）。
 */
export function LineLinkFloatingButton({
  isLinked,
  friendLinked = true,
}: {
  isLinked: boolean
  friendLinked?: boolean
}) {
  const [hidden, setHidden] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (isLinked && friendLinked) return null
  if (hidden) return null

  const needsFriend = isLinked && !friendLinked

  const handleTap = () => {
    if (needsFriend) {
      startTransition(async () => {
        const res = await recheckLineFriendship()
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        if (res.friend) {
          toast.success('LINE通知の準備が整いました', {
            description: '今後はGrowth Driverの通知がLINEに届きます。',
            duration: 6000,
          })
        } else {
          toast.warning('まだ友だち追加が確認できません', {
            description: '下のボタンから公式アカウント Growth Driver を友だち追加してから、もう一度このボタンをタップしてください。',
            duration: 14000,
            action: {
              label: 'LINEで友だち追加',
              onClick: () => window.open(LINE_OA_FRIEND_ADD_URL, '_blank', 'noopener,noreferrer'),
            },
          })
        }
      })
      return
    }

    // 未連携: OAuth フロー
    const baseUrl = window.location.origin
    const url = buildLineLoginAuthorizeUrl(baseUrl)
    if (!url) {
      alert('LINE Login が設定されていません')
      return
    }
    window.location.href = url
  }

  return (
    <div
      className="fixed z-40 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 bottom-20"
    >
      <div className="flex items-center gap-2 bg-green-500 text-white rounded-full shadow-lg px-3 py-2 mx-auto max-w-[24rem]">
        <MessageCircle className="w-5 h-5 flex-shrink-0" />
        <button
          onClick={handleTap}
          disabled={isPending}
          className="flex-1 text-left text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {needsFriend
            ? (isPending ? '確認中...' : '友だち追加したら、ここをタップ')
            : 'LINE連携で通知を受け取る'}
        </button>
        <button
          onClick={() => setHidden(true)}
          className="flex-shrink-0 w-6 h-6 rounded-full hover:bg-white/20 flex items-center justify-center"
          aria-label="閉じる"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
