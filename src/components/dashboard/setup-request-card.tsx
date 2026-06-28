'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { requestCurriculumSetup } from '@/app/(dashboard)/setup-request-actions'

type Item = { teamName: string; curriculumName: string }

/**
 * セットアップ未完了のカリキュラムがあるチームのリーダー向け：運営管理者へのセットアップ依頼カード。
 * 依頼ボタンを押すと「誰に・どんな内容が届くか」を確認するダイアログを表示し、確認後に送信する。
 */
export function SetupRequestCard({
  items, recipients = [], padded = true,
}: { items: Item[]; recipients?: string[]; padded?: boolean }) {
  const [sent, setSent] = useState<Set<string>>(new Set())
  const [confirmItem, setConfirmItem] = useState<Item | null>(null)
  const [pending, startTransition] = useTransition()

  const keyOf = (it: Item) => `${it.teamName}::${it.curriculumName}`
  const hasRecipients = recipients.length > 0

  const send = (it: Item) => {
    startTransition(async () => {
      const res = await requestCurriculumSetup(it.teamName, it.curriculumName)
      if (res.error) { toast.error(res.error); return }
      setSent(prev => new Set(prev).add(keyOf(it)))
      setConfirmItem(null)
      toast.success('運営管理者にセットアップを依頼しました')
    })
  }

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
            const isSent = sent.has(keyOf(it))
            return (
              <div key={keyOf(it)} className="flex items-center justify-between gap-2 bg-white rounded-lg border border-amber-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 truncate">{it.teamName}</p>
                  <p className="text-sm font-medium text-gray-800 truncate">{it.curriculumName}</p>
                </div>
                <Button
                  size="sm"
                  disabled={pending || isSent}
                  className={isSent ? 'bg-gray-300 hover:bg-gray-300 text-white flex-shrink-0' : 'bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0'}
                  onClick={() => setConfirmItem(it)}
                >
                  {isSent ? '依頼済み' : <><Send className="w-3.5 h-3.5 mr-1" />セットアップを依頼</>}
                </Button>
              </div>
            )
          })}
        </div>
      </div>

      {/* 確認ダイアログ: 誰に・どんな内容が届くかを確認してから送信 */}
      <Dialog open={confirmItem !== null} onOpenChange={open => { if (!open && !pending) setConfirmItem(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">セットアップを依頼しますか？</DialogTitle>
            <DialogDescription className="text-xs">
              以下の内容で、社内の運営管理者にセットアップ依頼を送信します。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div>
              <p className="text-[11px] text-gray-500 mb-1">送信先（運営管理者）</p>
              {hasRecipients ? (
                <div className="flex flex-wrap gap-1">
                  {recipients.map(name => (
                    <span key={name} className="inline-flex items-center text-xs bg-orange-50 text-orange-700 border border-orange-100 rounded px-2 py-0.5 font-medium">{name} さん</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-red-600">運営管理者が登録されていません。開発者にご連絡ください。</p>
              )}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 space-y-1">
              <p className="text-[11px] text-gray-500">依頼内容</p>
              <p className="text-xs text-gray-700"><span className="text-gray-400">所属：</span>{confirmItem?.teamName}</p>
              <p className="text-xs text-gray-700"><span className="text-gray-400">習得カリキュラム：</span>{confirmItem?.curriculumName}</p>
              <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
                「このカリキュラムはフェーズ（時間設定）が未設定のため、フェーズ・スキルのセットアップをお願いします」という連絡が、メール／LINEで届きます。
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={pending}>キャンセル</Button>
            </DialogClose>
            <Button
              size="sm"
              className="bg-amber-500 hover:bg-amber-600 text-white"
              disabled={pending || !hasRecipients || !confirmItem}
              onClick={() => confirmItem && send(confirmItem)}
            >
              {pending ? '送信中...' : <><Send className="w-3.5 h-3.5 mr-1" />送信する</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
