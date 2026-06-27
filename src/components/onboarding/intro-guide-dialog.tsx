'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CheckCircle2, TrendingUp, Heart, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const SESSION_KEY = 'intro_guide_shown'

/**
 * ログイン時のツール説明モーダル。
 * - 未設定（intro_dismissed_at が null）の人に、ログイン（ブラウザのセッション）ごとに1回表示
 * - 「今後、表示しない」にチェックして閉じると、サーバーに記録し以後は出ない
 */
export function IntroGuideDialog({ employeeId, dismissed }: { employeeId: string; dismissed: boolean }) {
  const [open, setOpen] = useState(false)
  const [dontShow, setDontShow] = useState(false)

  useEffect(() => {
    if (dismissed) return
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return
      sessionStorage.setItem(SESSION_KEY, '1')
    } catch { /* sessionStorage 不可でも表示はする */ }
    setOpen(true)
  }, [dismissed])

  const handleClose = async () => {
    setOpen(false)
    if (dontShow) {
      try {
        await createClient().from('employees').update({ intro_dismissed_at: new Date().toISOString() }).eq('id', employeeId)
      } catch { /* 失敗してもセッション内は再表示されない */ }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Mission Board へようこそ！</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-gray-700 leading-relaxed">
            このアプリは、あなたのスキル習得を&quot;見える化&quot;して、チームで応援しあうためのものです。
          </p>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700"><span className="font-semibold">できたことを「申請」</span> → リーダーが「認定」します（写真も添付できます）</p>
            </li>
            <li className="flex items-start gap-2.5">
              <TrendingUp className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700"><span className="font-semibold">自分の進捗</span>（順調か・次に取り組むこと）がひと目でわかります</p>
            </li>
            <li className="flex items-start gap-2.5">
              <Heart className="w-5 h-5 text-pink-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-gray-700"><span className="font-semibold">仲間の頑張り</span>やタイムラインで、お互いに応援しあえます</p>
            </li>
          </ul>
          <Link href="/help" onClick={handleClose} className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:underline">
            <BookOpen className="w-4 h-4" />
            詳しい使い方を見る
          </Link>
        </div>

        <DialogFooter className="flex-col gap-3 sm:flex-col sm:items-stretch">
          <label className="flex items-center gap-2 text-sm text-gray-600 self-start cursor-pointer">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
            今後、表示しない
          </label>
          <Button onClick={handleClose} className="w-full bg-orange-500 hover:bg-orange-600 text-white">
            はじめる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
