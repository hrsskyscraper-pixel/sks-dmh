'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Megaphone, PartyPopper } from 'lucide-react'
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
}

export function AnnouncementsFeed({
  items, reactions, comments, reactorNames, reactorAvatars, currentEmployeeId,
  canPost = false, postableMembers = [], title = '本日のお知らせ', showPastLink = true,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

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
              {items.map(item => (
                <AnnouncementCard
                  key={item.id}
                  item={item}
                  reactions={reactions.filter(r => r.announcement_id === item.id)}
                  comments={comments.filter(c => c.announcement_id === item.id)}
                  reactorNames={reactorNames}
                  reactorAvatars={reactorAvatars}
                  currentEmployeeId={currentEmployeeId}
                />
              ))}
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
