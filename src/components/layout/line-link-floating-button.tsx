'use client'

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { buildLineLoginAuthorizeUrl } from '@/lib/line-login'

/**
 * LINE通知を受け取れていないユーザー向けの常時表示ボタン（下部ナビの上に浮かぶ）。
 * - 未連携: 「LINE連携で通知を受け取る」
 * - 連携済みだが公式アカウント未追加（friendLinked=false）: 「友だち追加で通知を受け取る」
 * タップで LINE OAuth（bot_prompt 付き）に遷移。「×」で一時的に非表示にできるが、リロードで再表示。
 */
export function LineLinkFloatingButton({
  isLinked,
  friendLinked = true,
}: {
  isLinked: boolean
  friendLinked?: boolean
}) {
  const [hidden, setHidden] = useState(false)

  // 連携済みかつ友だち追加済みなら何も出さない
  if (isLinked && friendLinked) return null
  if (hidden) return null

  const needsFriend = isLinked && !friendLinked

  const handleLink = () => {
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
          onClick={handleLink}
          className="flex-1 text-left text-sm font-medium hover:opacity-90"
        >
          {needsFriend ? '友だち追加で通知を受け取る' : 'LINE連携で通知を受け取る'}
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
