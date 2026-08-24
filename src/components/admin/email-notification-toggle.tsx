'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Mail, MailX } from 'lucide-react'
import { toggleEmailNotifications } from '@/app/(dashboard)/admin/settings/actions'

interface Props {
  enabled: boolean
  updatedBy: string | null
  updatedAt: string | null
}

/**
 * LINE通知が無料枠の上限に達して届いていない状態かどうか。
 *
 * このスイッチはメール専用なので本来 LINE には触れないが、いま LINE も止まっているため
 * 「LINEは届きます」だけを読むと実態と食い違う。誤解を避けるための一時的な注意書き。
 * LINE通知が復旧したら、この定数を false にする（注意書きが消える）。
 */
const LINE_QUOTA_EXCEEDED = true

/**
 * メール通知の一括スイッチ。
 * 停止は影響が広いので、停止するときだけ確認ダイアログを挟む（再開は押し直しで戻せるため不要）。
 */
export function EmailNotificationToggle({ enabled: initialEnabled, updatedBy, updatedAt }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const apply = (next: boolean) => {
    startTransition(async () => {
      const { error } = await toggleEmailNotifications(next)
      if (error) {
        toast.error(error)
        return
      }
      setEnabled(next)
      toast.success(next ? 'メール通知を再開しました' : 'メール通知を休止しました')
    })
  }

  const handleClick = () => {
    if (enabled) {
      setConfirmOpen(true)
    } else {
      apply(true)
    }
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${enabled ? 'bg-emerald-100' : 'bg-amber-100'}`}
          >
            {enabled ? (
              <Mail className="w-5 h-5 text-emerald-600" />
            ) : (
              <MailX className="w-5 h-5 text-amber-600" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">メール通知</p>
            <p className={`text-xs font-bold ${enabled ? 'text-emerald-600' : 'text-amber-600'}`}>
              {enabled ? '送信中' : '休止中'}
            </p>
          </div>
          <Button
            variant={enabled ? 'outline' : 'default'}
            size="sm"
            onClick={handleClick}
            disabled={isPending}
            className={enabled ? '' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}
          >
            {enabled ? '休止する' : '再開する'}
          </Button>
        </div>

        <p className="text-xs text-gray-500 leading-relaxed">
          Mission Board から送るメールをまとめて止めます。参加依頼・参加承認・チーム招待・スキル認定・改善提案など、
          <span className="font-semibold text-gray-700">すべてのメールが対象</span>です。
          LINE通知とアプリ内のお知らせは、この設定の影響を受けません。
        </p>

        {LINE_QUOTA_EXCEEDED && (
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 leading-relaxed">
            ※ ただし現在、<span className="font-semibold">LINE通知は無料枠の上限に達しているため届いていません</span>
            （この設定とは別の要因です）。メールを休止すると、
            <span className="font-semibold text-gray-700">自動のお知らせはアプリ内のみ</span>になります。
            リーダーの方には、承認センターを定期的にご確認いただく運用をおすすめします。
          </p>
        )}

        {!enabled && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            休止中は<span className="font-semibold">招待メールも届きません</span>。新しく招待する方には、
            招待リンクをLINEなど別の手段でお渡しください。
          </p>
        )}

        {updatedAt && (
          <p className="text-[10px] text-gray-400">
            最終変更: {fmt(updatedAt)}
            {updatedBy ? `（${updatedBy}）` : ''}
          </p>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>メール通知を休止します</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 space-y-2">
            <p>Mission Board から送るメールをすべて止めます。</p>
            <p className="text-xs text-gray-500">
              参加依頼・参加承認・チーム招待・スキル認定・改善提案のメールが届かなくなります。
              招待メールも止まるため、新しく招待する方には招待リンクを別の手段でお渡しください。
            </p>
            {LINE_QUOTA_EXCEEDED ? (
              <p className="text-xs text-gray-500">
                アプリ内のお知らせは従来どおり届きます。
                <span className="font-semibold text-gray-700">
                  なお現在、LINE通知は無料枠の上限に達しているため届いていません
                </span>
                （この設定とは別の要因です）。休止すると、自動のお知らせはアプリ内のみになります。
                この設定はいつでも再開できます。
              </p>
            ) : (
              <p className="text-xs text-gray-500">
                LINE通知とアプリ内のお知らせは従来どおり届きます。この設定はいつでも再開できます。
              </p>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            <Button
              onClick={() => {
                setConfirmOpen(false)
                apply(false)
              }}
              disabled={isPending}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white"
            >
              休止する
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="w-full">
              やめる
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
