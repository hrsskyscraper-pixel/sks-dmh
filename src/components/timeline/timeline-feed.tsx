'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Heart, MessageCircle, Send, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AffiliationBadge } from '@/components/ui/affiliation'
import { AnnouncementCard } from '@/components/announcements/announcement-card'
import { MemberNameLink } from '@/components/layout/member-name-link'
import type { AnnouncementItem, AnnouncementReaction, AnnouncementComment } from '@/lib/announcements'

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

interface TimelineGroup {
  key: string
  employeeId: string
  items: FeedAchievement[]
  latestAt: string
}

type Affiliation = { name: string; type: 'store' | 'department' | 'project' }

interface Props {
  achievements: FeedAchievement[]
  comments: FeedComment[]
  reactions: FeedReaction[]
  employeeMap: Record<string, EmployeeInfo>
  currentEmployeeId: string
  compact?: boolean
  affByEmployee?: Record<string, Affiliation[]>
  curriculaBySkill?: Record<string, string[]>
  /** お知らせ（級合格・ランキング・歓迎）をタイムラインにも流す（フル表示時のみ） */
  announcements?: AnnouncementItem[]
  annReactions?: AnnouncementReaction[]
  annComments?: AnnouncementComment[]
  reactorNames?: Record<string, string>
  reactorAvatars?: Record<string, string | null>
  /** 初期表示の認定がこの件数なら「もっと読む」を有効化 */
  hasMore?: boolean
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

// 同じ人・同じ日でまとめるためのキー（JST ローカル日付）
function dayKey(dateStr: string | null): string {
  if (!dateStr) return 'unknown'
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

/** ホーム（compact）で表示する最大グループ数 */
const COMPACT_GROUPS = 5

export function TimelineFeed({
  achievements: initialAchievements, comments: initialComments, reactions: initialReactions, employeeMap, currentEmployeeId,
  compact = false, affByEmployee = {}, curriculaBySkill = {},
  announcements = [], annReactions = [], annComments = [], reactorNames = {}, reactorAvatars = {}, hasMore: initialHasMore = false,
}: Props) {
  const [achievements, setAchievements] = useState(initialAchievements)
  const [comments, setComments] = useState(initialComments)
  const [reactions, setReactions] = useState(initialReactions)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  // 無限スクロール（フル表示のみ）
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)

  useEffect(() => {
    if (compact || !hasMore) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(async entries => {
      if (!entries[0].isIntersecting || loadingRef.current) return
      loadingRef.current = true
      setLoadingMore(true)
      try {
        const oldest = achievements.reduce((min, a) => (a.certified_at && (!min || a.certified_at < min) ? a.certified_at : min), '' as string)
        const res = await fetch(`/api/timeline?before=${encodeURIComponent(oldest)}`)
        const json = await res.json()
        const more: FeedAchievement[] = json.achievements ?? []
        if (more.length > 0) {
          setAchievements(prev => {
            const seen = new Set(prev.map(a => a.id))
            return [...prev, ...more.filter(a => !seen.has(a.id))]
          })
        }
        setHasMore(!!json.hasMore && more.length > 0)
      } catch {
        // 失敗時は次のスクロールで再試行
      } finally {
        loadingRef.current = false
        setLoadingMore(false)
      }
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [compact, hasMore, achievements])

  // 同じ人・同じ日でグループ化（achievements は certified_at 降順で渡される）
  const groups: TimelineGroup[] = []
  {
    const idxMap = new Map<string, number>()
    for (const a of achievements) {
      const k = `${a.employee_id}:${dayKey(a.certified_at)}`
      let idx = idxMap.get(k)
      if (idx === undefined) {
        idx = groups.length
        idxMap.set(k, idx)
        groups.push({ key: k, employeeId: a.employee_id, items: [], latestAt: a.certified_at ?? '' })
      }
      groups[idx].items.push(a)
      if ((a.certified_at ?? '') > groups[idx].latestAt) groups[idx].latestAt = a.certified_at ?? ''
    }
  }
  const displayGroups = compact ? groups.slice(0, COMPACT_GROUPS) : groups

  // achievementId -> groupKey（ハッシュリンク先がまとめカード内にある場合に自動展開する用）
  const achToGroupKey: Record<string, string> = {}
  for (const g of groups) for (const a of g.items) achToGroupKey[a.id] = g.key

  // ハッシュによるスクロール＋ハイライト（まとめカード内なら先に展開）
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    const m = hash.match(/^#achievement-(.+)$/)
    if (m) {
      const gk = achToGroupKey[m[1]]
      if (gk) setExpandedGroups(prev => new Set(prev).add(gk))
    }
    const t = setTimeout(() => {
      const el = document.querySelector(hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-2', 'ring-orange-400')
        setTimeout(() => el.classList.remove('ring-2', 'ring-orange-400'), 3000)
      }
    }, 150)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const toggleGroup = (key: string) => setExpandedGroups(prev => {
    const next = new Set(prev)
    next.has(key) ? next.delete(key) : next.add(key)
    return next
  })

  // 所属（店舗・部署・PJチーム）バッジ
  const renderAffiliations = (empId: string) => {
    const affs = affByEmployee[empId] ?? []
    if (affs.length === 0) return null
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {affs.map(a => (
          <AffiliationBadge key={`${a.type}:${a.name}`} type={a.type} name={a.name} />
        ))}
      </div>
    )
  }

  // 習得カリキュラム（そのスキルが属するもの）チップ
  const renderCurricula = (skillId: string) => {
    const cs = curriculaBySkill[skillId] ?? []
    if (cs.length === 0) return null
    return (
      <div className="flex flex-wrap items-center gap-1 mt-1">
        <span className="text-[9px] text-gray-400">カリキュラム</span>
        {cs.map(c => (
          <span key={c} className="text-[9px] text-orange-700 bg-orange-50 border border-orange-100 rounded px-1 py-px">{c}</span>
        ))}
      </div>
    )
  }

  // いいね・コメント欄（個別カードと、まとめカードの代表認定で共用）
  const renderEngagement = (achievement: FeedAchievement) => {
    const achComments = commentsByAchievement[achievement.id] ?? []
    const achReactions = reactionsByAchievement[achievement.id] ?? []
    const isCmtExpanded = expandedComments.has(achievement.id)
    const hasOwnLike = achReactions.some(r => r.employee_id === currentEmployeeId)
    const likeCount = achReactions.length
    const likerNames = achReactions
      .map(r => employeeMap[r.employee_id]?.name ?? '不明')
      .filter((name, i, arr) => arr.indexOf(name) === i)
    return (
      <>
        {/* いいね & コメントアイコン */}
        <div className="flex items-center gap-4 mt-2">
          <button
            onClick={() => handleReaction(achievement.id, '❤️')}
            disabled={isPending}
            className="flex items-center gap-1 transition-colors"
          >
            <Heart className={cn('w-5 h-5', hasOwnLike ? 'fill-red-500 text-red-500' : 'text-gray-400 hover:text-red-400')} />
            {likeCount > 0 && <span className={cn('text-xs font-medium', hasOwnLike ? 'text-red-500' : 'text-gray-500')}>{likeCount}</span>}
          </button>
          <button
            onClick={() => setExpandedComments(prev => {
              const next = new Set(prev)
              next.has(achievement.id) ? next.delete(achievement.id) : next.add(achievement.id)
              return next
            })}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            {achComments.length > 0 && <span className="text-xs font-medium text-gray-500">{achComments.length}</span>}
          </button>
        </div>
        {/* いいねした人 */}
        {likerNames.length > 0 && (
          <p className="text-[11px] text-gray-500 mt-1">
            <span className="font-semibold">{likerNames.slice(0, 3).join('、')}</span>
            {likerNames.length > 3 && `、他${likerNames.length - 3}人`}
            が❤️しました
          </p>
        )}
        {/* コメント */}
        {(isCmtExpanded || (!compact && achComments.length > 0)) && (
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
                      <MemberNameLink employeeId={comment.employee_id} className="font-semibold text-gray-700">{commenter?.name ?? '不明'}</MemberNameLink>
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
      </>
    )
  }

  // 1件分の中身（nested=まとめカード内では「人名」を省きスキル中心に表示）
  const renderAchievementInner = (achievement: FeedAchievement, nested: boolean) => {
    const emp = employeeMap[achievement.employee_id]
    const certifier = achievement.certified_by ? employeeMap[achievement.certified_by] : null

    return (
      <div
        key={achievement.id}
        id={`achievement-${achievement.id}`}
        className={cn('scroll-mt-24', nested && 'rounded-lg bg-gray-50/70 px-3 py-2')}
      >
        {/* ヘッダー */}
        <div className="flex items-center gap-2.5 mb-2">
          {!nested && (
            <Avatar className="w-9 h-9 flex-shrink-0">
              <AvatarImage src={emp?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-orange-100 text-orange-700 text-sm font-bold">
                {emp?.name?.charAt(0) ?? '?'}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              {nested ? (
                <>
                  <span className="font-semibold text-orange-600">{achievement.skills?.name ?? '不明'}</span>
                  <span className="text-gray-500"> を習得！</span>
                </>
              ) : (
                <>
                  <MemberNameLink employeeId={achievement.employee_id} className="font-semibold text-gray-800">{emp?.name ?? '不明'}</MemberNameLink>
                  <span className="text-gray-500"> さんが </span>
                  <span className="font-semibold text-orange-600">{achievement.skills?.name ?? '不明'}</span>
                  <span className="text-gray-500"> を習得しました！</span>
                </>
              )}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-gray-400">
                {achievement.certified_at ? timeAgo(achievement.certified_at) : ''}
              </span>
              {certifier && (
                <span className="text-[10px] text-gray-400">認定: <MemberNameLink employeeId={achievement.certified_by}>{certifier.name}</MemberNameLink></span>
              )}
            </div>
            {!nested && renderAffiliations(achievement.employee_id)}
            {renderCurricula(achievement.skill_id)}
          </div>
        </div>

        {renderEngagement(achievement)}
      </div>
    )
  }

  // まとめカードのヘッダー（同じ人が同じ日に複数習得）
  const renderGroupHeader = (group: TimelineGroup) => {
    const emp = employeeMap[group.employeeId]
    const isOpen = expandedGroups.has(group.key)
    return (
      <button onClick={() => toggleGroup(group.key)} className="w-full flex items-center gap-2.5 text-left">
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
            <span className="font-bold text-orange-600">{group.items.length}件</span>
            <span className="text-gray-500"> のスキルを習得しました！</span>
          </p>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
            <span>{group.latestAt ? timeAgo(group.latestAt) : ''}</span>
          </div>
          {renderAffiliations(group.employeeId)}
        </div>
        {isOpen
          ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
    )
  }

  // お知らせ（級合格・ランキング・歓迎）と認定グループを日付降順で統合（フル表示のみお知らせを混ぜる）
  type Entry = { kind: 'group'; date: string; group: TimelineGroup } | { kind: 'ann'; date: string; ann: AnnouncementItem }
  const feedEntries: Entry[] = [
    ...displayGroups.map(g => ({ kind: 'group' as const, date: g.latestAt, group: g })),
    ...(compact ? [] : announcements.map(a => ({ kind: 'ann' as const, date: a.createdAt, ann: a }))),
  ].sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime())

  if (feedEntries.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        まだ投稿はありません
      </div>
    )
  }

  const Wrapper = compact ? 'div' : Card
  const wrapperClass = compact ? 'border-b border-gray-100 pb-3 last:border-b-0' : 'overflow-hidden'
  const innerPad = compact ? 'pt-1' : 'pt-4 pb-3 px-4'

  return (
    <div className={cn('space-y-3', compact ? 'px-0' : 'p-4')}>
      {feedEntries.map(entry => entry.kind === 'ann' ? (
        <Card key={`ann-${entry.ann.id}`} className="overflow-hidden">
          <div className="pt-3 pb-3 px-3">
            <AnnouncementCard
              item={entry.ann}
              reactions={annReactions.filter(r => r.announcement_id === entry.ann.id)}
              comments={annComments.filter(c => c.announcement_id === entry.ann.id)}
              reactorNames={reactorNames}
              reactorAvatars={reactorAvatars}
              currentEmployeeId={currentEmployeeId}
            />
          </div>
        </Card>
      ) : (
        <Wrapper key={entry.group.key} className={wrapperClass}>
          <div className={innerPad}>
            {entry.group.items.length === 1 ? (
              renderAchievementInner(entry.group.items[0], false)
            ) : (
              <>
                {renderGroupHeader(entry.group)}
                {/* まとめカード（折りたたみ時）にも、いいね・コメントを表示（代表＝最新の認定に紐づく） */}
                {!expandedGroups.has(entry.group.key) && renderEngagement(entry.group.items[0])}
                {expandedGroups.has(entry.group.key) && (
                  <div className="mt-2.5 space-y-2 border-l-2 border-orange-100 pl-2">
                    {entry.group.items.map(a => renderAchievementInner(a, true))}
                  </div>
                )}
              </>
            )}
          </div>
        </Wrapper>
      ))}
      {/* 無限スクロール（フル表示） */}
      {!compact && hasMore && (
        <div ref={sentinelRef} className="py-4 flex justify-center">
          {loadingMore && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
        </div>
      )}
    </div>
  )
}
