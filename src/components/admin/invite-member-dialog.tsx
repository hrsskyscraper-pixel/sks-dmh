'use client'

import { useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { Mail, Check, Copy } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createInvitation } from '@/app/invite/actions'
import type { Employee } from '@/types/database'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
  teamName: string
  /** 招待対象候補（既にチーム所属の社員は除外済みが望ましい） */
  candidates: Employee[]
}

export function InviteMemberDialog({ open, onOpenChange, teamId, teamName, candidates }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [sentInviteUrl, setSentInviteUrl] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(c =>
      c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    )
  }, [candidates, search])

  const selected = candidates.find(c => c.id === selectedId) ?? null

  const reset = () => {
    setSelectedId(null)
    setMessage('')
    setSearch('')
    setSentInviteUrl(null)
  }

  const handleSubmit = () => {
    if (!selectedId) return
    startTransition(async () => {
      const res = await createInvitation({
        teamId,
        targetEmployeeId: selectedId,
        customMessage: message.trim() || undefined,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      const url = `${window.location.origin}/invite/${res.invitationId}`
      setSentInviteUrl(url)
      toast.success(`${selected?.name}さんに招待を送信しました`)
    })
  }

  const handleCopy = async () => {
    if (!sentInviteUrl) return
    try {
      await navigator.clipboard.writeText(sentInviteUrl)
      toast.success('招待URLをコピーしました')
    } catch {
      toast.error('コピーに失敗しました')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4 text-orange-500" />
            「{teamName}」に招待
          </DialogTitle>
        </DialogHeader>

        {sentInviteUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
              <Check className="w-4 h-4" />
              <span className="text-sm">招待を送信しました</span>
            </div>
            <p className="text-xs text-gray-600">
              {selected?.name}さんにメール
              {selected?.line_user_id ? '・LINE通知' : ''}で参加依頼をお送りしました。
            </p>
            <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
              <p className="text-[10px] text-gray-500 mb-1">招待URL</p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] text-gray-700 break-all flex-1">{sentInviteUrl}</code>
                <Button size="sm" variant="outline" className="h-7 px-2 flex-shrink-0" onClick={handleCopy}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">招待先メンバー</p>
              <Input
                type="text"
                placeholder="名前 または メールで検索"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 text-sm mb-2"
              />
              <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-56 divide-y divide-gray-100">
                {filtered.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">該当するメンバーがいません</p>
                )}
                {filtered.map(emp => {
                  const isSelected = selectedId === emp.id
                  return (
                    <label
                      key={emp.id}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                        isSelected ? 'bg-orange-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="invite-target"
                        checked={isSelected}
                        onChange={() => setSelectedId(emp.id)}
                        className="accent-orange-500"
                      />
                      <Avatar className="w-6 h-6 flex-shrink-0">
                        <AvatarImage src={emp.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[10px] bg-orange-200 text-orange-700">
                          {emp.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{emp.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">{emp.email}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">メッセージ（任意）</p>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="例）〇〇プロジェクトで一緒に働きましょう！"
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          {sentInviteUrl ? (
            <Button onClick={() => onOpenChange(false)} className="w-full">閉じる</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                キャンセル
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!selectedId || isPending}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isPending ? '送信中...' : '招待を送信'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
