'use client'

import { useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MessageCircle, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const REACTION_EMOJIS = ['👍', '🎉', '👏', '💪', '🔥']

interface FeedAchievement {
  id: string
  employee_id: string
  skill_id: string
  certified_at: string | null
  certified_by: string | null
  skills: { name: string; category: string } | null
}

interface FeedComment {
  id: string
  achievement_id: string
  employee_id: string
  content: string
  created_at: string
}

interface FeedReaction {
  id: string
  achievement_id: string
  employee_id: string
  emoji: string
}

interface EmployeeInfo {
  id: string
  name: string
  avatar_url: string | null
}

interface Props {
  achievements: FeedAchievement[]
  comments: FeedComment[]
  reactions: FeedReaction[]
  employeeMap: Record<string, EmployeeInfo>
  currentEmployeeId: string
  compact?: boolean
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

export function TimelineFeed({ achievements, comments: initialComments, reactions: initialReactions, employeeMap, currentEmployeeId, compact = false }: Props) {
  const [comments, setComments] = useState(initialComments)
  const [reactions, setReactions] = useState(initialReactions)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  // ハッシュによるスクロール＋ハイライト
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    const el = document.querySelector(hash)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('ring-2', 'ring-orange-400')
      setTimeout(() => el.classList.remove('ring-2', 'ring-orange-400'), 3000)
    }
  }, [])

  const commentsByAchievement = comments.reduce((acc, c) => {
    if (!acc[c.achievement_id]) acc[c.achievement_id] = []
    acc[c.achievement_id].push(c)
    return acc
  }, {} as Record<string, FeedComment[]>)

  const reactionsByAchievement = reactions.reduce((acc, r) => {
    if (!acc[r.achievement_id]) acc[r.achievement_id] = []
    acc[r.achievement_id].push(r)
    return acc
  }, {} as Record<string, FeedReaction[]>)

  const handleReaction = (achievementId: string, emoji: string) => {
    const existing = reactions.find(
      r => r.achievement_id === achievementId && r.employee_id === currentEmployeeId && r.emoji === emoji
    )
    startTransition(async () => {
      if (existing) {
        const { error } = await supabase.from('achievement_reactions').delete().eq('id', existing.id)
        if (error) { toast.error('リアクションの取り消しに失敗'); return }
        setReactions(prev => prev.filter(r => r.id !== existing.id))
      } else {
        const { data, error } = await supabase
          .from('achievement_reactions')
          .insert({ achievement_id: achievementId, employee_id: currentEmployeeId, emoji })
          .select()
          .single()
        if (error) { toast.error('リアクションに失敗'); return }
        setReactions(prev => [...prev, data])
      }
    })
  }

  const handleComment = (achievementId: string) => {
    const content = commentInputs[achievementId]?.trim()
    if (!content) return
    startTransition(async () => {
      const { data, error } = await supabase
        .from('achievement_comments')
        .insert({ achievement_id: achievementId, employee_id: currentEmployeeId, content })
        .select()
        .single()
      if (error) { toast.error('コメントの投稿に失敗'); return }
      setComments(prev => [...prev, data])
      setCommentInputs(prev => ({ ...prev, [achievementId]: '' }))
    })
  }

  const displayItems = compact ? achievements.slice(0, 5) : achievements

  if (displayItems.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        まだ認定されたスキルはありません
      </div>
    )
  }

  return (
    <div className={cn('space-y-3', compact ? 'px-0' : 'p-4')}>
      {displayItems.map(achievement => {
        const emp = employeeMap[achievement.employee_id]
        const certifier = achievement.certified_by ? employeeMap[achievement.certified_by] : null
        const achComments = commentsByAchievement[achievement.id] ?? []
        const achReactions = reactionsByAchievement[achievement.id] ?? []
        const isExpanded = expandedComments.has(achievement.id)

        // リアクション集計
        const reactionCounts: Record<string, { count: number; hasOwn: boolean }> = {}
        for (const r of achReactions) {
          if (!reactionCounts[r.emoji]) reactionCounts[r.emoji] = { count: 0, hasOwn: false }
          reactionCounts[r.emoji].count++
          if (r.employee_id === currentEmployeeId) reactionCounts[r.emoji].hasOwn = true
        }

        const Wrapper = compact ? 'div' : Card
        const wrapperClass = compact ? 'border-b border-gray-100 pb-3 last:border-b-0' : 'overflow-hidden'

        return (
          <Wrapper key={achievement.id} id={`achievement-${achievement.id}`} className={wrapperClass}>
            <div className={compact ? 'pt-1' : 'pt-4 pb-3 px-4'}>
              {/* ヘッダー */}
              <div className="flex items-center gap-2.5 mb-2">
                <Avatar className="w-9 h-9 flex-shrink-0">
                  <AvatarImage src={emp?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-orange-100 text-orange-700 text-sm font-bold">
                    {emp?.name?.charAt(0) ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-semibold text-gray-800">{emp?.name ?? '不明'}</span>
                    <span className="text-gray-500"> さんが </span>
                    <span className="font-semibold text-orange-600">{achievement.skills?.name ?? '不明'}</span>
                    <span className="text-gray-500"> を習得しました！</span>
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">
                      {achievement.certified_at ? timeAgo(achievement.certified_at) : ''}
                    </span>
                    {certifier && (
                      <span className="text-[10px] text-gray-400">
                        認定: {certifier.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* リアクションボタン */}
              <div className="flex items-center gap-1 mt-2 flex-wrap">
                {REACTION_EMOJIS.map(emoji => {
                  const info = reactionCounts[emoji]
                  const hasOwn = info?.hasOwn ?? false
                  const count = info?.count ?? 0
                  return (
                    <button
                      key={emoji}
                      onClick={() => handleReaction(achievement.id, emoji)}
                      disabled={isPending}
                      className={cn(
                        'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm transition-colors border',
                        hasOwn
                          ? 'bg-orange-100 border-orange-300 text-orange-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                      )}
                    >
                      <span>{emoji}</span>
                      {count > 0 && <span className="text-[10px] font-medium">{count}</span>}
                    </button>
                  )
                })}
                <button
                  onClick={() => setExpandedComments(prev => {
                    const next = new Set(prev)
                    next.has(achievement.id) ? next.delete(achievement.id) : next.add(achievement.id)
                    return next
                  })}
                  className="flex items-center gap-0.5 rounded-full px-2 py-0.5 text-sm bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  {achComments.length > 0 && <span className="text-[10px] font-medium">{achComments.length}</span>}
                </button>
              </div>

              {/* コメント */}
              {(isExpanded || (!compact && achComments.length > 0)) && (
                <div className="mt-3 space-y-2 border-t pt-2">
                  {achComments.map(comment => {
                    const commenter = employeeMap[comment.employee_id]
                    return (
                      <div key={comment.id} className="flex items-start gap-2">
                        <Avatar className="w-6 h-6 flex-shrink-0 mt-0.5">
                          <AvatarImage src={commenter?.avatar_url ?? undefined} />
                          <AvatarFallback className="bg-gray-100 text-gray-600 text-[10px] font-bold">
                            {commenter?.name?.charAt(0) ?? '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs">
                            <span className="font-semibold text-gray-700">{commenter?.name ?? '不明'}</span>
                            <span className="text-gray-400 ml-1">{timeAgo(comment.created_at)}</span>
                          </p>
                          <p className="text-sm text-gray-700 mt-0.5">{comment.content}</p>
                        </div>
                      </div>
                    )
                  })}

                  {/* コメント入力 */}
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      placeholder="お祝いコメントを送る..."
                      value={commentInputs[achievement.id] ?? ''}
                      onChange={e => setCommentInputs(prev => ({ ...prev, [achievement.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleComment(achievement.id) }}
                      className="text-sm h-8 flex-1"
                      disabled={isPending}
                    />
                    <Button
                      size="sm"
                      className="h-8 w-8 p-0 bg-orange-500 hover:bg-orange-600"
                      onClick={() => handleComment(achievement.id)}
                      disabled={isPending || !commentInputs[achievement.id]?.trim()}
                    >
                      <Send className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Wrapper>
        )
      })}
    </div>
  )
}
