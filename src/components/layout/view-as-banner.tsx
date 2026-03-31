'use client'

import { Eye, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VIEW_AS_COOKIE } from '@/lib/view-as'

interface Props {
  employeeName: string
}

export function ViewAsBanner({ employeeName }: Props) {
  const handleClear = () => {
    document.cookie = `${VIEW_AS_COOKIE}=; path=/; max-age=0`
    window.location.href = '/'
  }

  return (
    <div className="sticky top-0 z-50 bg-blue-600 text-white px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span><strong>{employeeName}</strong> の視点で表示中</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 text-white hover:bg-blue-700 hover:text-white px-2 flex-shrink-0"
        onClick={handleClear}
      >
        <X className="w-3 h-3 mr-1" />
        戻る
      </Button>
    </div>
  )
}
