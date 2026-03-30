'use client'

import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'

interface Props {
  isLinked: boolean
}

export function LineLinkButton({ isLinked }: Props) {
  const handleLink = () => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    const channelId = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID
    if (!channelId) {
      alert('LINE Login が設定されていません')
      return
    }
    const redirectUri = encodeURIComponent(`${baseUrl}/auth/line/callback`)
    const state = crypto.randomUUID()
    const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${redirectUri}&state=${state}&scope=profile`
    window.location.href = url
  }

  if (isLinked) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <MessageCircle className="w-4 h-4" />
        <span>LINE連携済み</span>
      </div>
    )
  }

  return (
    <Button variant="outline" size="sm" onClick={handleLink} className="gap-1.5">
      <MessageCircle className="w-4 h-4 text-green-500" />
      LINE連携
    </Button>
  )
}
