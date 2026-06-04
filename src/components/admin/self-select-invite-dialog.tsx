'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Copy, Send, Link as LinkIcon, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { createSelfSelectInviteLink, revokeInviteLink } from '@/app/invite/actions'

/**
 * 共通1リンク（自己選択型）の招待リンクを発行・コピー・無効化するダイアログ。
 * 受け取った人はリンクを開き、自分の所属（店舗・部署・チーム）を選んで参加する。
 * 運用管理者以上のみ（呼び出し側でガード）。
 */
export function SelfSelectInviteDialog({
  open,
  onOpenChange,
  inviterName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  inviterName: string
}) {
  const [isPending, startTransition] = useTransition()
  const [asManager, setAsManager] = useState(true)
  const [message, setMessage] = useState('')
  const [generated, setGenerated] = useState<{ id: string; url: string } | null>(null)
  const [revoked, setRevoked] = useState(false)

  const reset = () => {
    setGenerated(null)
    setRevoked(false)
    setMessage('')
    setAsManager(true)
  }

  // LINEで開かれても外部ブラウザで開くよう openExternalBrowser=1 を付与
  const appendLineOpenExternal = (url: string) => {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}openExternalBrowser=1`
  }
  const buildShareText = (url: string) => {
    const ext = appendLineOpenExternal(url)
    const lines = [
      '【アプリ登録のお願い】',
      `${inviterName}さんより、スキル習得・育成アプリ「Mission Board」への${asManager ? 'リーダー' : 'メンバー'}登録のお願いです。`,
      '',
      '下記リンクを開き、Googleアカウントでログイン後、',
      'ご自身の所属（店舗・部署・チーム）を選んで参加してください。',
      '初めての方も自動でアカウントが作成されます。',
      '',
    ]
    if (message.trim()) lines.push('■ メッセージ', message.trim(), '')
    lines.push('▼ 登録する', ext)
    return lines.join('\n')
  }

  const handleGenerate = () => {
    startTransition(async () => {
      const res = await createSelfSelectInviteLink({ asManager, customMessage: message.trim() || undefined })
      if (res.error || !res.invitationId) {
        toast.error(res.error ?? '発行に失敗しました')
        return
      }
      const url = `${window.location.origin}/invite/${res.invitationId}`
      setGenerated({ id: res.invitationId, url })
      toast.success('招待リンクを発行しました')
    })
  }

  const handleRevoke = () => {
    if (!generated) return
    startTransition(async () => {
      const res = await revokeInviteLink(generated.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      setRevoked(true)
      toast.success('リンクを無効化しました')
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
  const openLineShare = (text: string) => {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <LinkIcon className="w-4 h-4 text-orange-500" />
            一括招待リンク（所属を選んで参加）
          </DialogTitle>
        </DialogHeader>

        {!generated ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-600 leading-relaxed">
              共通リンクを1本発行します。受け取った方はリンクを開き、Googleログイン後に<strong>ご自身の所属（店舗・部署・チーム）を選んで参加</strong>します。店長グループLINE等にこの1本を投稿すれば、各自が自店舗を選んで登録できます。
            </p>
            <div>
              <p className="text-[11px] font-medium text-gray-600 mb-1">参加するロール</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button type="button" size="sm" variant={asManager ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setAsManager(true)}>リーダーとして</Button>
                <Button type="button" size="sm" variant={!asManager ? 'default' : 'outline'} className="h-8 text-xs" onClick={() => setAsManager(false)}>メンバーとして</Button>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-medium text-gray-600 mb-1">メッセージ（任意）</p>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="例: 今月中にご登録をお願いします。" className="text-sm min-h-[60px]" />
            </div>
            <Button onClick={handleGenerate} disabled={isPending} className="w-full bg-orange-500 hover:bg-orange-600">
              <LinkIcon className="w-4 h-4 mr-1" />{isPending ? '発行中...' : '招待リンクを発行'}
            </Button>
            <p className="text-[10px] text-gray-400 leading-relaxed">※ 発行できるのは運用管理者以上です。リンクは30日間有効・再利用可能（複数人が利用可）。漏えい時は発行後に表示される「無効化」で即失効できます。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {revoked ? (
              <div className="flex items-center gap-2 bg-gray-100 text-gray-600 rounded-lg px-3 py-2">
                <Ban className="w-4 h-4" /><span className="text-sm">このリンクは無効化されました</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
                <Check className="w-4 h-4" /><span className="text-sm">招待リンクを発行しました（30日間有効・再利用可）</span>
              </div>
            )}
            <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
              <p className="text-[10px] text-gray-500 mb-1">招待URL</p>
              <div className="flex items-center gap-2">
                <code className="text-[11px] text-gray-700 break-all flex-1">{generated.url}</code>
                <Button size="sm" variant="outline" className="h-7 px-2 flex-shrink-0" onClick={() => copy(generated.url, 'URL')} disabled={revoked}><Copy className="w-3 h-3" /></Button>
              </div>
            </div>
            <div className="border border-orange-200 rounded-lg p-2 bg-orange-50">
              <p className="text-[10px] text-orange-600 font-medium mb-1">LINE等に送る案内文</p>
              <pre className="text-[11px] text-gray-700 whitespace-pre-wrap break-all mb-2">{buildShareText(generated.url)}</pre>
              <div className="grid grid-cols-2 gap-1.5">
                <Button size="sm" className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600" disabled={revoked} onClick={() => openLineShare(buildShareText(generated.url))}><Send className="w-3 h-3 mr-1" />LINEで送る</Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" disabled={revoked} onClick={() => copy(buildShareText(generated.url), '案内文')}><Copy className="w-3 h-3 mr-1" />コピー</Button>
              </div>
            </div>
            {!revoked && (
              <Button variant="outline" size="sm" className="w-full h-8 text-xs text-red-600 hover:text-red-700 border-red-200" onClick={handleRevoke} disabled={isPending}>
                <Ban className="w-3 h-3 mr-1" />このリンクを無効化する
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
