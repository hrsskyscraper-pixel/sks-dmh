'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MessageCircle, X } from 'lucide-react'

export function LineLinkBanner() {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const handleLink = () => {
    const baseUrl = window.location.origin
    const channelId = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID
    if (!channelId) return
    const redirectUri = encodeURIComponent(`${baseUrl}/auth/line/callback`)
    const state = crypto.randomUUID()
    window.location.href = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${state}&scope=profile`
  }

  return (
    <div className="mx-4 mt-3 rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-3">
      <MessageCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-green-800">LINE通知を受け取れます</p>
        <p className="text-xs text-green-600 mt-0.5">LINEアカウントを連携すると、通知をLINEで受け取れます。</p>
      </div>
      <Button size="sm" onClick={handleLink} className="bg-green-500 hover:bg-green-600 flex-shrink-0 text-xs">
        連携する
      </Button>
      <button onClick={() => setDismissed(true)} className="text-green-400 hover:text-green-600 flex-shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
