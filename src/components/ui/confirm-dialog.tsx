'use client'

import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * 取り消せない操作（削除など）の確認。ブラウザの confirm() の代わりに使う共通部品。
 * - 本文（children）には「何が消えるのか」を具体的に書く
 * - 「やめる」はいつでも押せる。処理中（pending）は実行ボタンだけ止める
 * - alternative を渡すと、取り消せる別の手（例: カリキュラムから外すだけ）を並べて出す
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  onConfirm,
  destructive = true,
  pending = false,
  confirmDisabled = false,
  alternative,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
  pending?: boolean
  confirmDisabled?: boolean
  alternative?: { label: string; onClick: () => void }
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-gray-700">{children}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          {alternative && (
            <Button onClick={alternative.onClick} disabled={pending} className="h-auto w-full whitespace-normal py-2">
              {alternative.label}
            </Button>
          )}
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending || confirmDisabled}
            className="h-auto w-full whitespace-normal py-2"
          >
            {confirmLabel}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            やめる
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
