'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MessageCircle, X } from 'lucide-react'
import { buildLineLoginAuthorizeUrl } from '@/lib/line-login'

/**
 * @param needsFriend true の場合、「連携済みだが公式アカウント未追加」向けの文言を表示する。
 */
export function LineLinkBanner({ needsFriend = false }: { needsFriend?: boolean }) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleLink = () => {
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
            ? '公式アカウント「Growth Driver」を友だち追加すると通知が届きます。'
            : 'LINEアカウントを連携すると、通知をLINEで受け取れます。'}
        </p>
      </div>
      <Button size="sm" onClick={handleLink} className="bg-green-500 hover:bg-green-600 flex-shrink-0 text-xs">
        {needsFriend ? '友だち追加' : '連携する'}
      </Button>
      <button onClick={() => setDismissed(true)} className="text-green-400 hover:text-green-600 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
