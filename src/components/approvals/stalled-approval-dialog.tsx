'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle } from 'lucide-react'
import { useNavData } from '@/components/layout/nav-data-context'

/** ブラウザのタブ（セッション）ごとに1回。ログアウト時に nav.tsx が消すので、ログインし直せばまた出る */
export const STALLED_APPROVAL_SESSION_KEY = 'stalled_approval_shown'

/**
 * 承認者がログインしたとき、滞留している承認（申請の翌日中に承認されていないもの）があれば、
 * 「Mission Board へようこそ！」と同じように最初にモーダルで知らせ、「承認する」で承認センターへ促す。
 * - ベルの「要対応」と同じ内容・同じ件数（getNavCounts の stalledApprovals）
 * - ブラウザのセッションごとに1回。ログアウトすると鍵を消すので、ログインし直せば再び出る
 * - ようこそモーダルが開いている間は待ち、閉じられてから出す（重ねない）
 */
export function StalledApprovalDialog() {
  const { stalledApprovals } = useNavData()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [decided, setDecided] = useState(false)

  useEffect(() => {
    if (decided || stalledApprovals.count === 0) return
    try {
      if (sessionStorage.getItem(STALLED_APPROVAL_SESSION_KEY)) { setDecided(true); return }
    } catch { /* sessionStorage 不可でも表示はする */ }

    const show = () => {
      try { sessionStorage.setItem(STALLED_APPROVAL_SESSION_KEY, '1') } catch { /* noop */ }
      setDecided(true)
      setOpen(true)
    }
    if (document.documentElement.dataset.introOpen) {
      window.addEventListener('mb:intro-closed', show, { once: true })
      return () => window.removeEventListener('mb:intro-closed', show)
    }
    show()
  }, [stalledApprovals.count, decided])

  const goApprove = () => {
    setOpen(false)
    router.push('/approvals?tab=skills')
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) setOpen(false) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold">要対応</span>
            承認をお待ちの申請があります
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-lg px-3 py-3 border border-amber-300 bg-amber-50">
          <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 text-lg">⏳</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800">
              承認をお待ちの申請が <span className="font-semibold text-amber-700">{stalledApprovals.count}件</span> あります
              <span className="text-xs text-gray-500">（最長 {stalledApprovals.maxDays}日）</span>
            </p>
            <p className="text-[11px] text-gray-500 mt-0.5">申請の翌日中に承認されていないものです。承認センターで認定または差し戻しをお願いします。</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 leading-relaxed">
          早めの承認が、本人の「次の一歩」につながります。承認時の「本人への一言」も、ぜひ添えてください。
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:items-stretch">
          <Button onClick={goApprove} className="w-full bg-green-500 hover:bg-green-600 text-white">
            <CheckCircle className="w-4 h-4 mr-1" />
            承認する
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full">あとで</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
