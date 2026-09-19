'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { MessageCircle, MessageCircleOff } from 'lucide-react'
import { toggleLineNotifications } from '@/app/(dashboard)/admin/settings/actions'

interface Props {
  enabled: boolean
  updatedBy: string | null
  updatedAt: string | null
}

/**
 * LINE通知の一括スイッチ（メール通知のスイッチと同じ作り）。
 * LINE の無料枠は月200通で毎月リセットされる。上限までは届き、超えた分は失敗するため、
 * 止めるなら「上限に当たるまで一部だけ届く」より、ここで明示的に止めるほうが分かりやすい。
 * 停止は影響が広いので、停止するときだけ確認ダイアログを挟む。
 */
export function LineNotificationToggle({ enabled: initialEnabled, updatedBy, updatedAt }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const apply = (next: boolean) => {
    startTransition(async () => {
      const { error } = await toggleLineNotifications(next)
      if (error) { toast.error(error); return }
      setEnabled(next)
      toast.success(next ? 'LINE通知を再開しました' : 'LINE通知を休止しました')
    })
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-emerald-100' : 'bg-amber-100'}`}>
            {enabled ? <MessageCircle className="w-5 h-5 text-emerald-600" /> : <MessageCircleOff className="w-5 h-5 text-amber-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">LINE通知</p>
            <p className={`text-xs font-bold ${enabled ? 'text-emerald-600' : 'text-amber-600'}`}>{enabled ? '送信中' : '休止中'}</p>
          </div>
          <Button
            variant={enabled ? 'outline' : 'default'}
            size="sm"
            onClick={() => (enabled ? setConfirmOpen(true) : apply(true))}
            disabled={isPending}
            className={enabled ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
          >
            {enabled ? '休止する' : '再開する'}
          </Button>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          Mission Board から送る LINE メッセージをまとめて止めます。スキル認定・参加依頼・承認リマインドなど
          <span className="font-semibold text-gray-700">すべての LINE 通知が対象</span>です。
          LINE の無料枠は月200通で、上限を超えた分は届きません。「月初だけ届く」状態を避けたいときは、ここで休止してください。
          メール通知とアプリ内のお知らせは、この設定の影響を受けません。
        </p>
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-relaxed">
          ※ 改善提案と Q&amp;A の「運営チームへの通知」は、この休止の対象外です（下の「運営チームの通知先」で宛先を管理）。
        </p>
        {updatedAt && (
          <p className="text-[10px] text-gray-400">最終変更: {fmt(updatedAt)}{updatedBy ? `（${updatedBy}）` : ''}</p>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>LINE通知を休止します</DialogTitle></DialogHeader>
          <div className="text-sm text-gray-600 space-y-2">
            <p>Mission Board から送る LINE メッセージをすべて止めます。</p>
            <p className="text-xs text-gray-500">
              スキル認定・参加依頼・承認リマインドなどの LINE が届かなくなります。メール通知とアプリ内のお知らせは従来どおりです。
              運営チーム宛ての改善提案・Q&amp;A の通知だけは、休止中も届きます。この設定はいつでも再開できます。
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button onClick={() => { setConfirmOpen(false); apply(false) }} disabled={isPending} className="w-full bg-amber-600 hover:bg-amber-700 text-white">休止する</Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="w-full">やめる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
