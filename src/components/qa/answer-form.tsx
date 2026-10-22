'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, RotateCcw, Send } from 'lucide-react'
import { QA_BODY_MAX, type QaStatus } from '@/lib/qa'

interface Props {
  questionId: string
  status: QaStatus
  /** 解決済みの切り替えができるか（質問した本人・運営チーム） */
  canResolve: boolean
}

/** 回答の投稿フォーム＋解決済みの切り替え（詳細ページの末尾） */
export function AnswerForm({ questionId, status, canResolve }: Props) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const post = async () => {
    if (!body.trim()) { toast.error('回答を入力してください'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/qa/${questionId}/answers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: body.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? '投稿に失敗しました'); return }
      toast.success('回答を投稿しました')
      setBody('')
      router.refresh()
    } catch { toast.error('通信に失敗しました') } finally { setBusy(false) }
  }

  const setStatus = async (next: QaStatus) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/qa/${questionId}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? '更新に失敗しました'); return }
      toast.success(next === 'resolved' ? '解決済みにしました' : '回答待ちに戻しました')
      router.refresh()
    } catch { toast.error('通信に失敗しました') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <p className="text-xs font-medium text-gray-700">回答する<span className="text-gray-400 font-normal">（誰でも回答できます。全員に公開されます）</span></p>
        <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="分かる範囲で大丈夫です。手順や画面の場所を書くと伝わります" rows={3} maxLength={QA_BODY_MAX} disabled={busy} className="text-sm" />
        <div className="flex justify-end">
          <Button onClick={post} disabled={busy || !body.trim()} className="bg-sky-600 hover:bg-sky-700 text-white">
            <Send className="w-4 h-4 mr-1" />回答を投稿
          </Button>
        </div>
      </div>
      {canResolve && (
        status === 'open' ? (
          <Button variant="outline" onClick={() => setStatus('resolved')} disabled={busy} className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50">
            <CheckCircle2 className="w-4 h-4 mr-1" />解決済みにする
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setStatus('open')} disabled={busy} className="w-full">
            <RotateCcw className="w-4 h-4 mr-1" />回答待ちに戻す
          </Button>
        )
      )}
    </div>
  )
}
