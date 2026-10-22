'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { MessageCircleQuestion } from 'lucide-react'
import { QA_BODY_MAX, QA_TITLE_MAX } from '@/lib/qa'

/** Q&A の質問フォーム（一覧ページのボタンから開く。誰でも質問できる） */
export function NewQuestionDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => { setTitle(''); setBody('') }

  const submit = async () => {
    if (!title.trim() || !body.trim()) { toast.error('件名と内容を入力してください'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? '投稿に失敗しました'); return }
      toast.success('質問を投稿しました。回答がつくとお知らせします')
      setOpen(false)
      reset()
      router.push(`/qa/${data.id}`)
      router.refresh()
    } catch {
      toast.error('通信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-sky-600 hover:bg-sky-700 text-white flex-shrink-0">
        <MessageCircleQuestion className="w-4 h-4 mr-1" />質問する
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!submitting) { setOpen(o); if (!o) reset() } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">質問する</DialogTitle>
            <DialogDescription>使い方でも仕事のことでも。全員に公開され、誰でも回答できます。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-600">件名 <span className="text-red-500">*</span></Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="例: 申請した写真を差し替えたいときは？" className="mt-1" maxLength={QA_TITLE_MAX} />
            </div>
            <div>
              <Label className="text-xs text-gray-600">内容 <span className="text-red-500">*</span></Label>
              <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="いつ・どの画面で・何をしようとしたか、が分かると回答しやすくなります" className="mt-1 min-h-[120px]" maxLength={QA_BODY_MAX} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>キャンセル</Button>
            <Button className="bg-sky-600 hover:bg-sky-700 text-white" onClick={submit} disabled={submitting || !title.trim() || !body.trim()}>
              {submitting ? '投稿中...' : '投稿する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
