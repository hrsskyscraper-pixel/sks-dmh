'use client'

import { Eye, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { clearViewAs } from '@/app/(dashboard)/actions'

interface Props {
  employeeName: string
}

export function ViewAsBanner({ employeeName }: Props) {
  return (
    <div className="sticky top-0 z-50 bg-blue-600 text-white px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Eye className="w-4 h-4 flex-shrink-0" />
        <span><strong>{employeeName}</strong> の視点で表示中</span>
      </div>
      <form action={clearViewAs}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="h-6 text-white hover:bg-blue-700 hover:text-white px-2 flex-shrink-0"
        >
          <X className="w-3 h-3 mr-1" />
          戻る
        </Button>
      </form>
    </div>
  )
}
