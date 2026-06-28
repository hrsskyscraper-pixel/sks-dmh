'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requestCurriculumSetup } from '@/app/(dashboard)/setup-request-actions'

/** セットアップ未完了のカリキュラムがあるチームのリーダー向け：運営管理者へのセットアップ依頼カード */
export function SetupRequestCard({ items, padded = true }: { items: { teamName: string; curriculumName: string }[]; padded?: boolean }) {
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [pending, startTransition] = useTransition()

  return (
    <div className={padded ? 'px-4' : ''}>
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 space-y-2">
        <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          習得カリキュラムのセットアップが未完了です
        </p>
        <p className="text-xs text-amber-700 leading-relaxed">
          現在この所属（店舗／部署／PJチーム）に設定されている習得カリキュラムは、セットアップが完了していません。
          社内の運営管理者に連絡の上、セットアップをリクエストしてください。
        </p>
        <div className="space-y-1.5">
          {items.map(it => {
            const key = `${it.teamName}::${it.curriculumName}`
            const isSent = sent.has(key)
            return (
              <div key={key} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 truncate">{it.teamName}</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{it.curriculumName}</p>
                </div>
                <Button
                  size="sm"
                  disabled={pending || isSent}
                  className={isSent ? 'bg-gray-300 hover:bg-gray-300 text-white flex-shrink-0' : 'bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0'}
                  onClick={() => startTransition(async () => {
                    const res = await requestCurriculumSetup(it.teamName, it.curriculumName)
                    if (res.error) { toast.error(res.error); return }
                    setSent(prev => new Set(prev).add(key))
                    toast.success('運営管理者にセットアップを依頼しました')
                  })}
                >
                  {isSent ? '依頼済み' : <><Send className="w-3.5 h-3.5 mr-1" />セットアップを依頼</>}
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
