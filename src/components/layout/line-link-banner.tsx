'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { buildLineLoginAuthorizeUrl } from '@/lib/line-login'
import { recheckLineFriendship } from '@/app/(dashboard)/line-actions'

/**
 * @param needsFriend true の場合、「連携済みだが公式アカウント未追加」向けの文言を表示し、
 *                    ボタンは OAuth ではなく Messaging API による友だち状態 recheck を呼ぶ。
 */
export function LineLinkBanner({ needsFriend = false }: { needsFriend?: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (dismissed) return null

  const handleClick = () => {
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
            description: 'LINEアプリで「Growth Driver」を検索して友だち追加してから、もう一度ボタンをタップしてください。',
            duration: 10000,
          })
        }
      })
      return
    }

    const baseUrl = window.location.origin
    const url = buildLineLoginAuthorizeUrl(baseUrl)
    if (!url) return
    window.location.href = url
  }

  return (
    <div className="mx-4 mt-3 rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-3">
      <MessageCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-green-800">
          {needsFriend ? 'あと一歩でLINE通知が届きます' : 'LINE通知を受け取れます'}
        </p>
        <p className="text-xs text-green-600 mt-0.5">
          {needsFriend
            ? 'LINEで「Growth Driver」を検索して友だち追加してから、右のボタンをタップしてください。'
            : 'LINEアカウントを連携すると、通知をLINEで受け取れます。'}
        </p>
      </div>
      <Button
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="bg-green-500 hover:bg-green-600 flex-shrink-0 text-xs disabled:opacity-60"
      >
        {needsFriend ? (isPending ? '確認中…' : '確認する') : '連携する'}
      </Button>
      <button onClick={() => setDismissed(true)} className="text-green-400 hover:text-green-600 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
