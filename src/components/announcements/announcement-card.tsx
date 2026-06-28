'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Heart, MessageCircle, Send, Trophy, Award, PartyPopper } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { MemberNameLink } from '@/components/layout/member-name-link'
import type { AnnouncementItem, AnnouncementReaction, AnnouncementComment } from '@/lib/announcements'

const HEART = '❤️'

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

interface Props {
  item: AnnouncementItem
  reactions: AnnouncementReaction[]
  comments: AnnouncementComment[]
  reactorNames: Record<string, string>
  reactorAvatars: Record<string, string | null>
  currentEmployeeId: string
}

/** お知らせ（級合格・ランキング・新メンバー歓迎）の1枚。♡＋コメント（タイムライン共通の反応）。 */
export function AnnouncementCard({ item, reactions: initReactions, comments: initComments, reactorNames, reactorAvatars, currentEmployeeId }: Props) {
  const supabase = createClient()
  const [reactions, setReactions] = useState(initReactions)
  const [comments, setComments] = useState(initComments)
  const [commentInput, setCommentInput] = useState('')
  const [showComments, setShowComments] = useState(false)
  const [isPending, startTransition] = useTransition()

  const reacted = reactions.some(r => r.employee_id === currentEmployeeId)
  const likeCount = reactions.length
  const likerNames = reactions.map(r => reactorNames[r.employee_id] ?? '不明').filter((n, i, a) => a.indexOf(n) === i)

  const isRanking = item.kind === 'ranking'
  const isWelcome = item.kind === 'welcome'

  const toggleLike = () => {
    startTransition(async () => {
      if (reacted) {
        // 旧🎉も含め本人の反応を解除（絵文字非依存）
        const { error } = await supabase.from('announcement_reactions').delete()
          .eq('announcement_id', item.id).eq('employee_id', currentEmployeeId)
        if (error) { toast.error('取り消しに失敗しました'); return }
        setReactions(prev => prev.filter(r => r.employee_id !== currentEmployeeId))
      } else {
        const { error } = await supabase.from('announcement_reactions').insert({ announcement_id: item.id, employee_id: currentEmployeeId, emoji: HEART })
        if (error) { toast.error('送信に失敗しました'); return }
        setReactions(prev => [...prev, { announcement_id: item.id, employee_id: currentEmployeeId }])
      }
    })
  }

  const addComment = () => {
    const content = commentInput.trim()
    if (!content) return
    startTransition(async () => {
      const { data, error } = await supabase.from('announcement_comments')
        .insert({ announcement_id: item.id, employee_id: currentEmployeeId, content })
        .select().single()
      if (error) { toast.error('コメントの投稿に失敗しました'); return }
      setComments(prev => [...prev, data])
      setCommentInput('')
    })
  }

  return (
    <div className={cn('rounded-lg px-3 py-2.5 border', isRanking ? 'bg-amber-50 border-amber-200' : isWelcome ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50/60 border-rose-100')}>
      <div className="flex items-start gap-2">
        {isRanking ? <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          : isWelcome ? <PartyPopper className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          : <Award className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />}
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
          ) : isWelcome ? (
            <div className="flex items-center gap-2">
              <Avatar className="w-7 h-7 flex-shrink-0">
                <AvatarImage src={item.subjectAvatar ?? undefined} />
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-bold">{item.subjectName?.charAt(0) ?? '?'}</AvatarFallback>
              </Avatar>
              <p className="text-sm text-gray-800">
                🎉 {item.subjectStore && <span className="text-gray-500">{item.subjectStore}の </span>}
                <MemberNameLink employeeId={item.subjectId} className="font-semibold">{item.subjectName}</MemberNameLink>
                <span> さんが仲間入りしました！</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-800">
              {item.subjectStore && <span className="text-gray-500">{item.subjectStore}の </span>}
              <MemberNameLink employeeId={item.subjectId} className="font-semibold">{item.subjectName}</MemberNameLink>
              <span> さんが </span>
              <span className="font-semibold text-rose-600">{item.gradeLabel}</span>
              <span> 合格しました！🎉</span>
            </p>
          )}
          <p className="text-[10px] text-gray-400 mt-0.5">
            {timeAgo(item.createdAt)}
            {item.createdByName && item.kind === 'grade' && <span className="ml-1">・{item.createdByName} より</span>}
          </p>
        </div>
      </div>

      {/* ♡ ＋ コメント（タイムライン共通の反応） */}
      <div className="flex items-center gap-4 mt-1.5 pl-6">
        <button onClick={toggleLike} disabled={isPending} className="flex items-center gap-1 transition-colors">
          <Heart className={cn('w-5 h-5', reacted ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-400')} />
          {likeCount > 0 && <span className={cn('text-xs font-medium', reacted ? 'text-red-500' : 'text-gray-500')}>{likeCount}</span>}
        </button>
        <button onClick={() => setShowComments(v => !v)} className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors">
          <MessageCircle className="w-5 h-5" />
          {comments.length > 0 && <span className="text-xs font-medium text-gray-500">{comments.length}</span>}
        </button>
      </div>
      {likerNames.length > 0 && (
        <p className="text-[11px] text-gray-500 mt-1 pl-6 truncate">
          <span className="font-semibold">{likerNames.slice(0, 3).join('、')}</span>
          {likerNames.length > 3 && `、他${likerNames.length - 3}人`} が❤️しました
        </p>
      )}

      {(showComments || comments.length > 0) && (
        <div className="mt-2 ml-6 space-y-2 border-t pt-2">
          {comments.map(c => (
            <div key={c.id} className="flex items-start gap-2">
              <Avatar className="w-6 h-6 flex-shrink-0 mt-0.5">
                <AvatarImage src={reactorAvatars[c.employee_id] ?? undefined} />
                <AvatarFallback className="bg-gray-100 text-gray-600 text-[10px] font-bold">{(reactorNames[c.employee_id] ?? '?').charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs">
                  <MemberNameLink employeeId={c.employee_id} className="font-semibold text-gray-700">{reactorNames[c.employee_id] ?? '不明'}</MemberNameLink>
                  <span className="text-gray-400 ml-1">{timeAgo(c.created_at)}</span>
                </p>
                <p className="text-sm text-gray-700 mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <Input
              placeholder="お祝いコメントを送る..."
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addComment() }}
              className="text-sm h-8 flex-1"
              disabled={isPending}
            />
            <Button size="sm" className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600" onClick={addComment} disabled={isPending || !commentInput.trim()}>
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
