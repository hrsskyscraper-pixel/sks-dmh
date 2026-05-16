'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { MessageCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { buildLineLoginAuthorizeUrl, LINE_OA_FRIEND_ADD_URL } from '@/lib/line-login'
import { recheckLineFriendship } from '@/app/(dashboard)/line-actions'

/**
 * @param needsFriend true の場合、「連携済みだが公式アカウント未追加」向けの2段階UIを表示する。
 *   1) LINEで公式アカウントを開いて友だち追加するボタン
 *   2) 追加後の状態を再確認するボタン（OAuth を再実行せず Messaging API で判定）
 */
export function LineLinkBanner({ needsFriend = false }: { needsFriend?: boolean }) {
  const [dismissed, setDismissed] = useState(false)
  const [isPending, startTransition] = useTransition()

  if (dismissed) return null

  const handleConnect = () => {
    const baseUrl = window.location.origin
    const url = buildLineLoginAuthorizeUrl(baseUrl)
    if (!url) return
    window.location.href = url
  }

  const handleOpenLineOA = () => {
    window.open(LINE_OA_FRIEND_ADD_URL, '_blank', 'noopener,noreferrer')
  }

  const handleRecheck = () => {
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
          description: '上の「LINEで友だち追加」ボタンを押して、公式アカウント Growth Driver を友だち追加してから、もう一度「確認する」を押してください。',
          duration: 12000,
        })
      }
    })
  }

  if (needsFriend) {
    return (
      <div className="mx-4 mt-3 rounded-lg bg-green-50 border border-green-200 p-3">
        <div className="flex items-start gap-3">
          <MessageCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800">あと一歩でLINE通知が届きます</p>
            <p className="text-xs text-green-700 mt-0.5 leading-relaxed">
              ① 下のボタンから公式アカウント「Growth Driver」を友だち追加 → ② 追加後に「確認する」を押す
            </p>
          </div>
          <button onClick={() => setDismissed(true)} className="text-green-400 hover:text-green-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3 ml-8">
          <Button
            size="sm"
            onClick={handleOpenLineOA}
            className="bg-green-500 hover:bg-green-600 text-xs flex-1"
          >
            ① LINEで友だち追加
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRecheck}
            disabled={isPending}
            className="border-green-500 text-green-700 hover:bg-green-100 text-xs flex-1 disabled:opacity-60"
          >
            {isPending ? '確認中…' : '② 確認する'}
          </Button>
        </div>
      </div>
    )
  }

  // 未連携: 従来の1ボタンUI
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
      <button onClick={() => setDismissed(true)} className="text-green-400 hover:text-green-600 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
