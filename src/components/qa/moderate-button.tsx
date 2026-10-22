'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EyeOff, Eye } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

/**
 * Q&A の質問・回答を非表示にする／表示に戻す（運営のうち、設定で指定された人だけに出す）。
 * 非表示は戻せる操作だが、ほかの人の投稿が全員から見えなくなるので、確認を挟む。
 */
export function QaModerateButton({ questionId, answerId, hidden, label }: { questionId: string; answerId?: string; hidden: boolean; label: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  const run = async (nextHidden: boolean) => {
    setPending(true)
    try {
      const res = await fetch(`/api/qa/${questionId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden: nextHidden, ...(answerId ? { answerId } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? '操作できませんでした'); return }
      toast.success(nextHidden ? `${label}を非表示にしました` : `${label}を表示に戻しました`)
      setOpen(false)
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  if (hidden) {
    return (
      <button type="button" disabled={pending} onClick={() => run(false)} className="inline-flex items-center gap-1 text-[11px] text-sky-700 hover:underline disabled:opacity-50">
        <Eye className="w-3 h-3" />表示に戻す
      </button>
    )
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-600">
        <EyeOff className="w-3 h-3" />非表示にする
      </button>
      <ConfirmDialog
        open={open}
        onOpenChange={o => { if (!pending) setOpen(o) }}
        title={`この${label}を非表示にしますか`}
        confirmLabel={`${label}を非表示にする`}
        onConfirm={() => run(true)}
        pending={pending}
      >
        <p>非表示にすると、運営（非表示にできる方）以外の全員から見えなくなります。</p>
        <p className="text-gray-500">消えるわけではありません。記録が残り、あとから「表示に戻す」で戻せます。</p>
      </ConfirmDialog>
    </>
  )
}
