'use client'

import { Button } from '@/components/ui/button'
import { MessageCircle } from 'lucide-react'
import { buildLineLoginAuthorizeUrl } from '@/lib/line-login'

interface Props {
  isLinked: boolean
}

export function LineLinkButton({ isLinked }: Props) {
  const handleLink = () => {
    // window.location.origin を使う（NEXT_PUBLIC_APP_URL は本番URL固定で preview/localhost では誤動作するため）
    const baseUrl = window.location.origin
    const url = buildLineLoginAuthorizeUrl(baseUrl)
    if (!url) {
      alert('LINE Login が設定されていません')
      return
    }
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
