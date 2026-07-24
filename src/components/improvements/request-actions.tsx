'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CheckCircle, XCircle, Hammer, Flag } from 'lucide-react'

type Action = 'ops_approve' | 'ops_reject' | 'exec_approve' | 'exec_reject' | 'dev_start' | 'dev_complete'
type DialogKind = 'ops_approve' | 'ops_reject' | 'exec_reject' | 'dev_complete'

/**
 * 段階に応じたワークフロー操作ボタン。
 * 権限フラグ（isOps/isExec/isDev）と現ステータスはサーバー側で算出して渡す。
 * 通知はサーバー（API ルート）が送るため、ここでは送らない。
 */
export function RequestActions({
  requestId,
  status,
  flags,
}: {
  requestId: string
  status: string
  flags: { isOps: boolean; isExec: boolean; isDev: boolean }
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [dialog, setDialog] = useState<DialogKind | null>(null)
  const [text, setText] = useState('')

  const run = async (action: Action, body: { comment?: string; proposal?: string } = {}): Promise<boolean> => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/improvements/${requestId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? '操作に失敗しました')
        return false
      }
      return true
    } catch {
      toast.error('通信に失敗しました')
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const directAction = async (action: Action, successMsg: string) => {
    const ok = await run(action)
    if (ok) {
      toast.success(successMsg)
      router.refresh()
    }
  }

  const submitDialog = async () => {
    if (!dialog) return
    const trimmed = text.trim()
    const needsText = dialog !== 'dev_complete'
    if (needsText && !trimmed) {
      toast.error(dialog === 'ops_approve' ? '改善案を入力してください' : '理由を入力してください')
      return
    }

    let action: Action
    let body: { comment?: string; proposal?: string } = {}
    let msg = ''
    if (dialog === 'ops_approve') { action = 'ops_approve'; body = { proposal: trimmed }; msg = '承認し、改善案を提案しました' }
    else if (dialog === 'ops_reject') { action = 'ops_reject'; body = { comment: trimmed }; msg = '却下しました' }
    else if (dialog === 'exec_reject') { action = 'exec_reject'; body = { comment: trimmed }; msg = '却下しました' }
    else { action = 'dev_complete'; body = trimmed ? { comment: trimmed } : {}; msg = '完了にしました' }

    const ok = await run(action, body)
    if (ok) {
      toast.success(msg)
      setDialog(null)
      setText('')
      router.refresh()
    }
  }

  const showOps = flags.isOps && status === 'submitted'
  const showExec = flags.isExec && status === 'ops_approved'
  const showDevStart = flags.isDev && status === 'exec_approved'
  const showDevComplete = flags.isDev && (status === 'in_development' || status === 'exec_approved')

  if (!showOps && !showExec && !showDevStart && !showDevComplete) return null

  const openDialog = (kind: DialogKind) => { setDialog(kind); setText('') }
  const isReject = dialog === 'ops_reject' || dialog === 'exec_reject'

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {showOps && (
          <>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white" onClick={() => openDialog('ops_approve')} disabled={submitting}>
              <CheckCircle className="w-4 h-4 mr-1" />承認して改善案を提案
            </Button>
            <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={() => openDialog('ops_reject')} disabled={submitting}>
              <XCircle className="w-4 h-4 mr-1" />却下
            </Button>
          </>
        )}
        {showExec && (
          <>
            <Button className="bg-blue-500 hover:bg-blue-600 text-white" onClick={() => directAction('exec_approve', '役員承認しました')} disabled={submitting}>
              <CheckCircle className="w-4 h-4 mr-1" />役員承認
            </Button>
            <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50" onClick={() => openDialog('exec_reject')} disabled={submitting}>
              <XCircle className="w-4 h-4 mr-1" />却下
            </Button>
          </>
        )}
        {showDevStart && (
          <Button className="bg-indigo-500 hover:bg-indigo-600 text-white" onClick={() => directAction('dev_start', '開発に着手しました')} disabled={submitting}>
            <Hammer className="w-4 h-4 mr-1" />開発に着手
          </Button>
        )}
        {showDevComplete && (
          <Button className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => openDialog('dev_complete')} disabled={submitting}>
            <Flag className="w-4 h-4 mr-1" />完了にする
          </Button>
        )}
      </div>

      <Dialog open={dialog !== null} onOpenChange={o => { if (!submitting && !o) { setDialog(null); setText('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {dialog === 'ops_approve' ? '承認して改善案を提案'
                : isReject ? '改善提案を却下'
                : '完了にする'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'ops_approve' ? '対応の方針（改善案）を記入してください。申請者に通知されます。'
                : dialog === 'dev_complete' ? '完了報告を記入できます（任意）。申請者に通知されます。'
                : '却下の理由を記入してください。申請者に通知されます。'}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs text-gray-600">
              {dialog === 'ops_approve' ? '改善案' : dialog === 'dev_complete' ? '完了報告（任意）' : '理由'}
              {dialog !== 'dev_complete' && <span className="text-red-500"> *</span>}
            </Label>
            <Textarea
              value={text}
              onChange={e => setText(e.target.value)}
              className="mt-1 min-h-[100px]"
              placeholder={dialog === 'ops_approve' ? '例: 次回リリースで検索機能を追加します'
                : dialog === 'dev_complete' ? '対応内容や補足があれば記入'
                : '却下の理由を記入'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialog(null); setText('') }} disabled={submitting}>キャンセル</Button>
            <Button
              className={isReject ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-orange-500 hover:bg-orange-600 text-white'}
              onClick={submitDialog}
              disabled={submitting || (dialog !== 'dev_complete' && !text.trim())}
            >
              {submitting ? '送信中...' : isReject ? '却下する' : dialog === 'dev_complete' ? '完了にする' : '承認する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
