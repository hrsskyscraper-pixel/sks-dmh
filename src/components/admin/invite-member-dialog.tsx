'use client'

import { useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { Mail, Check, Copy, Link as LinkIcon, Send, Eye } from 'lucide-react'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { createInvitation, createInvitationLink } from '@/app/invite/actions'
import type { Employee } from '@/types/database'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
  teamName: string
  inviterName: string
  candidates: Employee[]
  /** true: リーダー（副）として招待 / false: メンバーとして招待 */
  asManager?: boolean
}

export function InviteMemberDialog({ open, onOpenChange, teamId, teamName, inviterName, candidates, asManager = false }: Props) {
  const joinLabel = asManager ? 'リーダー（副）' : 'メンバー'
  const [mode, setMode] = useState<'member' | 'link'>('member')

  // 共通
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()

  // メンバー指定モード
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sentInviteUrl, setSentInviteUrl] = useState<string | null>(null)

  // リンク発行モード
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null)

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
    setGeneratedUrl(null)
    setMode('member')
  }

  const handleSubmitMember = () => {
    if (!selectedId) return
    startTransition(async () => {
      const res = await createInvitation({
        teamId,
        targetEmployeeId: selectedId,
        customMessage: message.trim() || undefined,
        asManager,
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

  const handleGenerateLink = () => {
    startTransition(async () => {
      const res = await createInvitationLink({
        teamId,
        customMessage: message.trim() || undefined,
        asManager,
      })
      if (res.error) {
        toast.error(res.error)
        return
      }
      const url = `${window.location.origin}/invite/${res.invitationId}`
      setGeneratedUrl(url)
      toast.success('招待リンクを発行しました')
    })
  }

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label}をコピーしました`)
    } catch {
      toast.error('コピーに失敗しました')
    }
  }

  // LINE公式のShare URL: モバイルはLINEアプリ、デスクトップはLINE Webで開く
  const openLineShare = (text: string) => {
    const shareUrl = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }

  // LINE等にコピペするための案内文
  // URLに ?openExternalBrowser=1 を付けると、LINE等で開かれても外部ブラウザ（Safari/Chrome）で開く
  const appendLineOpenExternal = (url: string) => {
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}openExternalBrowser=1`
  }
  const buildShareText = (url: string) => {
    const externalUrl = appendLineOpenExternal(url)
    const lines = [
      `${inviterName}さんから、以下のチームへの${asManager ? 'リーダー（副）' : 'メンバー'}参加依頼です。`,
      '内容をご確認の上、下記の招待リンクから参加手続きをお願いします。',
      '',
      `■ 参加先: ${teamName}（${joinLabel}として参加）`,
      '',
    ]
    if (message.trim()) {
      lines.push('■ メッセージ', message.trim(), '')
    }
    lines.push('■ 参加方法', '下記のリンクを開き、Googleアカウントでログインしてください。', '初めての方は自動的にアカウントが作成されます。', '', '▼ 参加する（ウェルカムページ）', externalUrl)
    return lines.join('\n')
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4 text-orange-500" />
            「{teamName}」に{joinLabel}として招待
          </DialogTitle>
        </DialogHeader>

        {/* ==== 送信/発行完了画面 ==== */}
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
                <Button size="sm" variant="outline" className="h-7 px-2 flex-shrink-0" onClick={() => copy(sentInviteUrl, 'URL')}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        ) : generatedUrl ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
              <Check className="w-4 h-4" />
              <span className="text-sm">招待リンクを発行しました</span>
            </div>
            <p className="text-xs text-gray-600">
              下記の「案内文をコピー」で本文ごと LINE 等に貼り付けて送信できます。
            </p>

            <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
              <p className="text-[10px] text-gray-500 mb-1">招待URL</p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] text-gray-700 break-all flex-1">{generatedUrl}</code>
                <Button size="sm" variant="outline" className="h-7 px-2 flex-shrink-0" onClick={() => copy(generatedUrl, 'URL')}>
                  <Copy className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="border border-orange-200 rounded-lg p-2 bg-orange-50">
              <p className="text-[10px] text-orange-600 font-medium mb-1">LINE等に送る案内文</p>
              <pre className="text-[11px] text-gray-700 whitespace-pre-wrap break-all mb-2">{buildShareText(generatedUrl)}</pre>
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600"
                  onClick={() => openLineShare(buildShareText(generatedUrl))}
                >
                  <Send className="w-3 h-3 mr-1" />LINEで送る
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => copy(buildShareText(generatedUrl), '案内文')}
                >
                  <Copy className="w-3 h-3 mr-1" />コピー
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ==== 入力画面 ==== */
          <Tabs value={mode} onValueChange={v => setMode(v as 'member' | 'link')}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="member" className="text-xs">
                <Mail className="w-3 h-3 mr-1" />メンバーに送る
              </TabsTrigger>
              <TabsTrigger value="link" className="text-xs">
                <LinkIcon className="w-3 h-3 mr-1" />リンクを発行
              </TabsTrigger>
            </TabsList>

            <TabsContent value="member" className="space-y-3 mt-3">
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">招待先メンバー（登録済みの人）</p>
                <Input
                  type="text"
                  placeholder="名前 または メールで検索"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-9 text-sm mb-2"
                />
                <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-48 divide-y divide-gray-100">
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
            </TabsContent>

            <TabsContent value="link" className="space-y-3 mt-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-700 space-y-1">
                <p className="font-medium">LINE等で送る招待リンクを発行します</p>
                <p className="text-[11px]">
                  リンクを開いてGoogleログインすると、自動的にアカウントが作成され、
                  このチームに参加できます（承認不要）。
                </p>
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
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          {sentInviteUrl || generatedUrl ? (
            <div className="w-full space-y-2">
              <Button
                variant="outline"
                onClick={() => {
                  const base = sentInviteUrl || generatedUrl!
                  const previewUrl = `${base}${base.includes('?') ? '&' : '?'}preview=1`
                  window.open(previewUrl, '_blank', 'noopener,noreferrer')
                }}
                className="w-full border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                <Eye className="w-4 h-4 mr-1" />
                ウェルカムページを確認する
              </Button>
              <Button onClick={() => onOpenChange(false)} className="w-full">閉じる</Button>
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                キャンセル
              </Button>
              {mode === 'member' ? (
                <Button
                  onClick={handleSubmitMember}
                  disabled={!selectedId || isPending}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {isPending ? '送信中...' : '招待を送信'}
                </Button>
              ) : (
                <Button
                  onClick={handleGenerateLink}
                  disabled={isPending}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  {isPending ? '発行中...' : 'リンクを発行'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
