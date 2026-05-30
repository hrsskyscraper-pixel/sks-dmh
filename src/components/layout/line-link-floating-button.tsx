'use client'

import { useState, useEffect, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { buildLineLoginAuthorizeUrl, LINE_OA_FRIEND_ADD_URL } from '@/lib/line-login'
import { recheckLineFriendship } from '@/app/(dashboard)/line-actions'
import { useLineFriendAutoRecheck } from '@/lib/use-line-friend-auto-recheck'

/**
 * LineLinkBanner と同じ sessionStorage キーを使い、状態を共有する。
 * ホームで「LINEで友達追加」をタップ → 別ページに移動しても、戻ってきた floating も「確認する」状態になる。
 */
const STORAGE_KEY = 'line-friend-add-attempted'

/**
 * LINE通知を受け取れていないユーザー向けの常時表示ボタン（下部ナビの上に浮かぶ）。
 *
 * ホーム画面 `/` では LineLinkBanner が同じCTAを出すので、こちらは出さない（重複表示の防止）。
 *
 * 挙動の分岐:
 * - 未連携 (`!isLinked`): OAuth フロー（bot_prompt 付き）
 * - 連携済み・友だち未追加 (`isLinked && !friendLinked`): 1段階1ボタンの状態機械
 *   - 初期: 「LINEで友達追加する」→ 公式アカウントURLを開く
 *   - 戻ってきた後: 「友達追加成功を確認する」→ Messaging API で再確認（OAuth 不要）
 */
export function LineLinkFloatingButton({
  isLinked,
  friendLinked = true,
}: {
  isLinked: boolean
  friendLinked?: boolean
}) {
  const pathname = usePathname()
  const [hidden, setHidden] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') {
      setAttempted(true)
    }
  }, [])

  // 連携済みだが友だち未確認のとき、マウント時にセッション1回だけ自動再判定する。
  // 友だち追加済みなら自動で line_friend=true になり、このボタンは消える。
  // （hooks は早期 return より前に呼ぶ必要があるため、ここで条件を算出して渡す）
  useLineFriendAutoRecheck(isLinked && !friendLinked)

  // ホームではバナーで案内するので、フローティングは出さない（同じCTAの二重表示を回避）
  if (pathname === '/') return null
  if (isLinked && friendLinked) return null
  if (hidden) return null

  const needsFriend = isLinked && !friendLinked

  const handleConnect = () => {
    const url = buildLineLoginAuthorizeUrl(window.location.origin)
    if (!url) {
      alert('LINE Login が設定されていません')
      return
    }
    window.location.href = url
  }

  const handleOpenAdd = () => {
    sessionStorage.setItem(STORAGE_KEY, '1')
    setAttempted(true)
    window.open(LINE_OA_FRIEND_ADD_URL, '_blank', 'noopener,noreferrer')
  }

  const handleConfirm = () => {
    startTransition(async () => {
      const res = await recheckLineFriendship()
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.friend) {
        sessionStorage.removeItem(STORAGE_KEY)
        toast.success('LINE通知の準備が整いました', {
          description: '今後はGrowth Driverの通知がLINEに届きます。',
          duration: 6000,
        })
      } else {
        toast.warning('まだ友達追加が確認できません', {
          description: '公式アカウント「Growth Driver」を友達追加してから、もう一度このボタンをタップしてください。',
          duration: 14000,
          action: {
            label: 'LINEで開く',
            onClick: () => window.open(LINE_OA_FRIEND_ADD_URL, '_blank', 'noopener,noreferrer'),
          },
        })
      }
    })
  }

  const handleTap = () => {
    if (!needsFriend) return handleConnect()
    return attempted ? handleConfirm() : handleOpenAdd()
  }

  const buttonText = !needsFriend
    ? 'LINE連携で通知を受け取る'
    : attempted
      ? (isPending ? '確認中…' : '友達追加成功を確認する')
      : 'LINEで友達追加する'

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
          {buttonText}
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
