'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Megaphone, PartyPopper, Trophy, Award, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { postGradeAnnouncement } from '@/app/(dashboard)/announcements/actions'
import type { AnnouncementItem, AnnouncementReaction } from '@/lib/announcements'

interface Props {
  items: AnnouncementItem[]
  reactions: AnnouncementReaction[]
  reactorNames: Record<string, string>
  currentEmployeeId: string
  canPost?: boolean
  postableMembers?: { id: string; name: string }[]
  title?: string
  showPastLink?: boolean
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'たった今'
  if (mins < 60) return `${mins}分前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}日前`
  return new Date(dateStr).toLocaleDateString('ja-JP')
}

const EMOJI = '🎉'

export function AnnouncementsFeed({
  items, reactions: initialReactions, reactorNames, currentEmployeeId,
  canPost = false, postableMembers = [], title = '本日のお知らせ', showPastLink = true,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [reactions, setReactions] = useState(initialReactions)
  const [isPending, startTransition] = useTransition()

  // 投稿ダイアログ
  const [postOpen, setPostOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [gradeInput, setGradeInput] = useState('')

  const handleReact = (announcementId: string) => {
    const mine = reactions.find(r => r.announcement_id === announcementId && r.employee_id === currentEmployeeId)
    startTransition(async () => {
      if (mine) {
        const { error } = await supabase.from('announcement_reactions').delete()
          .eq('announcement_id', announcementId).eq('employee_id', currentEmployeeId).eq('emoji', EMOJI)
        if (error) { toast.error('取り消しに失敗しました'); return }
        setReactions(prev => prev.filter(r => !(r.announcement_id === announcementId && r.employee_id === currentEmployeeId)))
      } else {
        const { error } = await supabase.from('announcement_reactions').insert({ announcement_id: announcementId, employee_id: currentEmployeeId, emoji: EMOJI })
        if (error) { toast.error('送信に失敗しました'); return }
        setReactions(prev => [...prev, { announcement_id: announcementId, employee_id: currentEmployeeId }])
      }
    })
  }

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
                const reacts = reactions.filter(r => r.announcement_id === item.id)
                const reacted = reacts.some(r => r.employee_id === currentEmployeeId)
                const names = reacts.map(r => reactorNames[r.employee_id] ?? '不明').filter((n, i, a) => a.indexOf(n) === i)
                const isRanking = item.kind === 'ranking'
                return (
                  <div key={item.id} className={cn('rounded-lg px-3 py-2.5 border', isRanking ? 'bg-amber-50 border-amber-200' : 'bg-rose-50/60 border-rose-100')}>
                    <div className="flex items-start gap-2">
                      {isRanking ? <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" /> : <Award className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        {isRanking ? (
                          <>
                            {item.title && <p className="text-sm font-semibold text-amber-800">{item.title}</p>}
                            {item.body && <p className="text-xs text-gray-700 whitespace-pre-line mt-0.5">{item.body}</p>}
                            {item.period && (
                              <Link href={`/ranking?month=${item.period}`} className="inline-block text-xs text-amber-700 font-semibold hover:underline mt-1">
                                全員のランキングを見る →
                              </Link>
                            )}
                          </>
                        ) : (
                          <p className="text-sm text-gray-800">
                            {item.subjectStore && <span className="text-gray-500">{item.subjectStore}の </span>}
                            <span className="font-semibold">{item.subjectName}</span>
                            <span> さんが </span>
                            <span className="font-semibold text-rose-600">{item.gradeLabel}</span>
                            <span> 合格しました！🎉</span>
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {timeAgo(item.createdAt)}
                          {item.createdByName && !isRanking && <span className="ml-1">・{item.createdByName} より</span>}
                        </p>
                      </div>
                    </div>
                    {/* おめでとう */}
                    <div className="flex items-center gap-2 mt-1.5 pl-6">
                      <button onClick={() => handleReact(item.id)} disabled={isPending}
                        className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors',
                          reacted ? 'bg-orange-100 border-orange-300 text-orange-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-orange-50')}>
                        <span>🎉</span>おめでとう{reacts.length > 0 && <span className="font-bold">{reacts.length}</span>}
                      </button>
                      {names.length > 0 && (
                        <span className="text-[10px] text-gray-400 truncate">{names.slice(0, 3).join('、')}{names.length > 3 ? ` 他${names.length - 3}人` : ''}</span>
                      )}
                    </div>
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
