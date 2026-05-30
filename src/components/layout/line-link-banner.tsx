'use client'

import { useState, useEffect, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { buildLineLoginAuthorizeUrl, LINE_OA_FRIEND_ADD_URL } from '@/lib/line-login'
import { recheckLineFriendship } from '@/app/(dashboard)/line-actions'
import { useLineFriendAutoRecheck } from '@/lib/use-line-friend-auto-recheck'

/**
 * セッション中、「ユーザーが LINE で友だち追加を試みたか」を覚えるキー。
 * sessionStorage を使うので、別タブには共有されず、タブを閉じれば消える。
 */
const STORAGE_KEY = 'line-friend-add-attempted'

/**
 * @param needsFriend true の場合、「連携済みだが公式アカウント未追加」向けに
 *   1段階1ボタンの UI を表示する。
 *   - 初期: 「LINEで友達追加する」だけ表示。タップで公式アカウントURLを開く。
 *   - タップ後（戻ってきた時）: 「友達追加成功を確認する」だけ表示。
 *     タップで Messaging API による友だち状態の再確認（OAuth は不要）。
 */
export function LineLinkBanner({ needsFriend = false }: { needsFriend?: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1') {
      setAttempted(true)
    }
  }, [])

  // 連携済みだが友だち未確認のとき、マウント時にセッション1回だけ自動再判定する。
  // 友だち追加済みなら自動で line_friend=true になり、このバナーは消える。
  useLineFriendAutoRecheck(needsFriend)

  if (dismissed) return null

  const handleConnect = () => {
    const url = buildLineLoginAuthorizeUrl(window.location.origin)
    if (!url) return
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
          description: '下の「LINEで開きなおす」から公式アカウントの追加を完了させてから、もう一度ボタンを押してください。',
          duration: 12000,
        })
      }
    })
  }

  if (needsFriend) {
    return (
      <div className="mx-4 mt-3 rounded-lg bg-green-50 border border-green-200 p-3">
        <div className="flex items-start gap-3 mb-3">
          <MessageCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800">あと一歩でLINE通知が届きます</p>
            <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
              {attempted
                ? '公式アカウント「Growth Driver」の友達追加が済んだら、下のボタンを押してください。'
                : '下のボタンから公式アカウント「Growth Driver」を友達追加してください。'}
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-green-400 hover:text-green-600 flex-shrink-0"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {attempted ? (
          <>
            <Button
              size="lg"
              onClick={handleConfirm}
              disabled={isPending}
              className="bg-green-500 hover:bg-green-600 w-full h-11 disabled:opacity-60"
            >
              {isPending ? '確認中…' : '友達追加成功を確認する'}
            </Button>
            <button
              onClick={handleOpenAdd}
              className="block w-full text-center text-xs text-green-700 mt-2 hover:underline"
            >
              うまくいかないときは LINEで開きなおす
            </button>
          </>
        ) : (
          <Button
            size="lg"
            onClick={handleOpenAdd}
            className="bg-green-500 hover:bg-green-600 w-full h-11"
          >
            LINEで友達追加する
          </Button>
        )}
      </div>
    )
  }

  // 未連携: 従来の1行UI（コンパクト）
  return (
    <div className="mx-4 mt-3 rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-3">
      <MessageCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-green-800">LINE通知を受け取れます</p>
        <p className="text-xs text-green-600 mt-0.5">LINEアカウントを連携すると、通知をLINEで受け取れます。</p>
      </div>
      <Button size="sm" onClick={handleConnect} className="bg-green-500 hover:bg-green-600 flex-shrink-0 text-xs">
        連携する
      </Button>
      <button
        onClick={() => setDismissed(true)}
        className="text-green-400 hover:text-green-600 flex-shrink-0"
        aria-label="閉じる"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
