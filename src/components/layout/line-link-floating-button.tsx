'use client'

import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'

/**
 * LINE未連携ユーザー向けの常時表示ボタン（下部ナビの上に浮かぶ）
 * タップで LINE OAuth に遷移。「×」で一時的に非表示にできるが、リロードで再表示。
 */
export function LineLinkFloatingButton({ isLinked }: { isLinked: boolean }) {
  const [hidden, setHidden] = useState(false)

  if (isLinked || hidden) return null

  const handleLink = () => {
    const baseUrl = window.location.origin
    const channelId = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID
    if (!channelId) {
      alert('LINE Login が設定されていません')
      return
    }
    const redirectUri = encodeURIComponent(`${baseUrl}/auth/line/callback`)
    const state = crypto.randomUUID()
    window.location.href = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${state}&scope=profile`
  }

  return (
    <div
      className="fixed z-40 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 bottom-20"
    >
      <div className="flex items-center gap-2 bg-green-500 text-white rounded-full shadow-lg px-3 py-2 mx-auto max-w-[22rem]">
        <MessageCircle className="w-5 h-5 flex-shrink-0" />
        <button
          onClick={handleLink}
          className="flex-1 text-left text-sm font-medium hover:opacity-90"
        >
          LINE連携で通知を受け取る
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
