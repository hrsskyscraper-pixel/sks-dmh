'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Megaphone, PartyPopper, ChevronDown, ChevronUp } from 'lucide-react'
import { postGradeAnnouncement } from '@/app/(dashboard)/announcements/actions'
import { AnnouncementCard } from '@/components/announcements/announcement-card'
import type { AnnouncementItem, AnnouncementReaction, AnnouncementComment } from '@/lib/announcements'

interface Props {
  items: AnnouncementItem[]
  reactions: AnnouncementReaction[]
  comments: AnnouncementComment[]
  reactorNames: Record<string, string>
  reactorAvatars: Record<string, string | null>
  currentEmployeeId: string
  canPost?: boolean
  postableMembers?: { id: string; name: string }[]
  title?: string
  showPastLink?: boolean
  /** true のとき、前日以前のお知らせはタイトルのみの折りたたみ表示にする（ホーム用） */
  collapseOlder?: boolean
  /** 「今日」の判定に使う JST 日付キー（'YYYY-M-D'）。サーバーから渡す */
  todayKey?: string
}

/** お知らせの1行サマリー（折りたたみ時のタイトル）。種別ごとに見出しを組み立てる */
function summaryTitle(item: AnnouncementItem): string {
  if (item.kind === 'welcome') return `🎉 ${item.subjectName ?? '新しい仲間'}さんが仲間入り`
  if (item.kind === 'grade') return `🏅 ${item.subjectName ?? '仲間'}さんが ${item.gradeLabel ?? ''} 合格`
  return item.title ?? 'お知らせ'
}

/** ISO 日時を JST の 'YYYY-M-D' キー・'M/D' 表記に変換 */
function jstKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`
}
function fmtMonthDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000)
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
}

export function AnnouncementsFeed({
  items, reactions, comments, reactorNames, reactorAvatars, currentEmployeeId,
  canPost = false, postableMembers = [], title = '本日のお知らせ', showPastLink = true,
  collapseOlder = false, todayKey,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expandedOlder, setExpandedOlder] = useState<Set<string>>(new Set())
  const toggleOlder = (id: string) => setExpandedOlder(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // 投稿ダイアログ
  const [postOpen, setPostOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [gradeInput, setGradeInput] = useState('')

  const selectedMember = postableMembers.find(m => m.id === selectedMemberId) ?? null
  const filteredMembers = memberSearch
    ? postableMembers.filter(m => m.name.toLowerCase().includes(memberSearch.toLowerCase()))
    : postableMembers

  const handlePost = () => {
    if (!selectedMemberId || !gradeInput.trim()) return
    startTransition(async () => {
      const res = await postGradeAnnouncement(selectedMemberId, gradeInput.trim())
      if (res.error) { toast.error(res.error); return }
      toast.success('お知らせを投稿しました！')
      setPostOpen(false)
      setSelectedMemberId(null)
      setGradeInput('')
      setMemberSearch('')
      router.refresh()
    })
  }

  return (
    <div>
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Megaphone className="w-4 h-4 text-orange-500" />
              {title}
            </p>
            <div className="flex items-center gap-2">
              {canPost && (
                <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600" onClick={() => setPostOpen(true)} disabled={isPending}>
                  <PartyPopper className="w-3.5 h-3.5 mr-1" />
                  お知らせを投稿
                </Button>
              )}
              {showPastLink && (
                <Link href="/announcements" className="text-xs text-orange-600 hover:underline whitespace-nowrap">過去のお知らせ →</Link>
              )}
            </div>
          </div>

          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">
              {canPost ? '今は表示するお知らせがありません。上の「お知らせを投稿」から共有できます。' : '今は表示するお知らせがありません。'}
            </p>
          ) : (
            <div className="space-y-2">
              {items.map(item => {
                const fullCard = (
                  <AnnouncementCard
                    item={item}
                    reactions={reactions.filter(r => r.announcement_id === item.id)}
                    comments={comments.filter(c => c.announcement_id === item.id)}
                    reactorNames={reactorNames}
                    reactorAvatars={reactorAvatars}
                    currentEmployeeId={currentEmployeeId}
                  />
                )
                // ホームでは前日以前はタイトルのみ折りたたみ。今日のものはそのまま表示。
                const isOlder = collapseOlder && !!todayKey && jstKey(item.createdAt) !== todayKey
                if (!isOlder) return <div key={item.id}>{fullCard}</div>
                const open = expandedOlder.has(item.id)
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => toggleOlder(item.id)}
                      className="w-full flex items-center gap-2 text-left rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-1.5 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-[10px] text-gray-400 flex-shrink-0 tabular-nums">{fmtMonthDay(item.createdAt)}</span>
                      <span className="text-xs text-gray-600 truncate flex-1">{summaryTitle(item)}</span>
                      {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                    </button>
                    {open && <div className="mt-1">{fullCard}</div>}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 投稿ダイアログ */}
      <Dialog open={postOpen} onOpenChange={o => { if (!o) { setPostOpen(false); setMemberSearch('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">級合格をお知らせ</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">対象メンバー（担当チーム）</p>
              {selectedMember ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-orange-50 border-orange-200">
                  <span className="text-sm font-medium text-gray-800">{selectedMember.name}</span>
                  <button className="text-xs text-gray-500 hover:text-gray-700" onClick={() => setSelectedMemberId(null)}>変更</button>
                </div>
              ) : (
                <>
                  <Input placeholder="名前で検索..." value={memberSearch} onChange={e => setMemberSearch(e.target.value)} className="text-sm" />
                  <div className="mt-1 max-h-40 overflow-y-auto border rounded-md">
                    {filteredMembers.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-2">対象メンバーがいません</p>
                    ) : filteredMembers.slice(0, 30).map(m => (
                      <button key={m.id} onClick={() => { setSelectedMemberId(m.id); setMemberSearch('') }}
                        className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">{m.name}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">合格内容</p>
              <Input placeholder="例: 接客3級" value={gradeInput} onChange={e => setGradeInput(e.target.value)} className="text-sm" />
              <p className="text-[11px] text-gray-400 mt-1">本人のキャリア記録（資格）にも自動で追加されます。</p>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={handlePost} disabled={isPending || !selectedMemberId || !gradeInput.trim()}>
              {isPending ? '投稿中...' : 'お知らせを投稿'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
