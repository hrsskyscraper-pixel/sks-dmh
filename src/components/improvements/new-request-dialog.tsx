'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Plus } from 'lucide-react'

const NONE = '__none__'

/** 改善提案の新規申請フォーム（一覧ページのボタンから開く） */
export function NewRequestDialog({ categories }: { categories: readonly string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string>(NONE)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setTitle('')
    setCategory(NONE)
    setDescription('')
  }

  const submit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('件名と内容を入力してください')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/improvements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category: category === NONE ? undefined : category,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(data.error ?? '送信に失敗しました')
        return
      }
      toast.success('改善提案を送信しました。ありがとうございます！')
      setOpen(false)
      reset()
      router.refresh()
    } catch {
      toast.error('通信に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-orange-500 hover:bg-orange-600 text-white flex-shrink-0"
      >
        <Plus className="w-4 h-4 mr-1" />新しい改善提案
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!submitting) { setOpen(o); if (!o) reset() } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">新しい改善提案</DialogTitle>
            <DialogDescription>アプリへのご要望・不具合・アイデアをお聞かせください。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-600">件名 <span className="text-red-500">*</span></Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例: スキル一覧に検索を付けてほしい"
                className="mt-1"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-xs text-gray-600">カテゴリ（任意）</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="選択してください" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>指定なし</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-600">内容 <span className="text-red-500">*</span></Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="どんなことに困っているか、どうなると嬉しいかを具体的に書いていただけると助かります"
                className="mt-1 min-h-[120px]"
                maxLength={5000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>キャンセル</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={submit}
              disabled={submitting || !title.trim() || !description.trim()}
            >
              {submitting ? '送信中...' : '送信する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
