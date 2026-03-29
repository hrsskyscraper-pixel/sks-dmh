'use client'

import { useState, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface EmployeeInfo { id: string; name: string; avatar_url: string | null }
interface AchievementInfo { id: string; skill_id: string; status: string; skills: { name: string } | null }

interface Props {
  reactions: { id: string; achievement_id: string; employee_id: string; emoji: string; created_at: string }[]
  comments: { id: string; achievement_id: string; employee_id: string; content: string; created_at: string }[]
  achievementMap: Record<string, AchievementInfo>
  employeeMap: Record<string, EmployeeInfo>
  pendingForMe: { id: string; employee_id: string; skill_id: string; status: string; achieved_at: string; skills: { name: string } | null }[]
  currentRole: string
  notificationsReadAt: string | null
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

type NotificationItem = {
  id: string
  type: 'activity' | 'pending'
  employeeId: string
  achievementId: string
  skillName: string
  emojis: string[]
  commentText: string | null
  createdAt: string
  isNew: boolean
}

const STORAGE_KEY = 'notif_clicked_ids'

function getClickedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')) }
  catch { return new Set() }
}

export function NotificationList({ reactions, comments, achievementMap, employeeMap, pendingForMe, currentRole, notificationsReadAt }: Props) {
  const readAt = notificationsReadAt ? new Date(notificationsReadAt).getTime() : 0

  // 同じスキル×同じ人をグルーピング
  const groupMap = new Map<string, NotificationItem>()

  for (const r of reactions) {
    const ach = achievementMap[r.achievement_id]
    const key = `${r.employee_id}:${r.achievement_id}`
    const existing = groupMap.get(key)
    if (existing) {
      if (!existing.emojis.includes(r.emoji)) existing.emojis.push(r.emoji)
      if (new Date(r.created_at).getTime() > new Date(existing.createdAt).getTime()) existing.createdAt = r.created_at
      if (new Date(r.created_at).getTime() > readAt) existing.isNew = true
    } else {
      groupMap.set(key, {
        id: key, type: 'activity', employeeId: r.employee_id, achievementId: r.achievement_id,
        skillName: ach?.skills?.name ?? '不明', emojis: [r.emoji], commentText: null,
        createdAt: r.created_at, isNew: new Date(r.created_at).getTime() > readAt,
      })
    }
  }

  for (const c of comments) {
    const ach = achievementMap[c.achievement_id]
    const key = `${c.employee_id}:${c.achievement_id}`
    const existing = groupMap.get(key)
    if (existing) {
      existing.commentText = c.content
      if (new Date(c.created_at).getTime() > new Date(existing.createdAt).getTime()) existing.createdAt = c.created_at
      if (new Date(c.created_at).getTime() > readAt) existing.isNew = true
    } else {
      groupMap.set(key, {
        id: key, type: 'activity', employeeId: c.employee_id, achievementId: c.achievement_id,
        skillName: ach?.skills?.name ?? '不明', emojis: [], commentText: c.content,
        createdAt: c.created_at, isNew: new Date(c.created_at).getTime() > readAt,
      })
    }
  }

  const items: NotificationItem[] = [...groupMap.values()]

  if (['store_manager', 'manager', 'admin', 'ops_manager'].includes(currentRole)) {
    for (const p of pendingForMe) {
      items.push({
        id: `p-${p.id}`, type: 'pending', employeeId: p.employee_id, achievementId: p.id,
        skillName: p.skills?.name ?? '不明', emojis: [], commentText: null,
        createdAt: p.achieved_at, isNew: new Date(p.achieved_at).getTime() > readAt,
      })
    }
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 個別クリック状態（localStorage）
  const [clickedIds, setClickedIds] = useState<Set<string>>(() => getClickedIds())

  const handleClick = useCallback((id: string) => {
    setClickedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      const arr = [...next].slice(-200)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
      return new Set(arr)
    })
  }, [])

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        お知らせはありません
      </div>
    )
  }

  return (
    <div className="p-4 space-y-0.5">
      {items.map(item => {
        const emp = employeeMap[item.employeeId]
        const href = item.type === 'pending'
          ? '/team?tab=pending'
          : `/timeline#achievement-${item.achievementId}`
        const isClicked = clickedIds.has(item.id)

        return (
          <Link key={item.id} href={href} onClick={() => handleClick(item.id)}>
            <div className={cn(
              'flex items-start gap-2.5 rounded-lg px-3 py-3 transition-colors',
              isClicked ? 'bg-white hover:bg-gray-50' : 'bg-blue-50 hover:bg-blue-100'
            )}>
              <Avatar className="w-10 h-10 flex-shrink-0 mt-0.5">
                <AvatarImage src={emp?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold">
                  {emp?.name?.charAt(0) ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm', isClicked ? 'text-gray-500' : 'text-gray-800')}>
                  {item.type === 'activity' && (
                    <>
                      <span className={cn('font-semibold', isClicked ? 'text-gray-600' : 'text-gray-800')}>{emp?.name}</span>
                      <span> さんが </span>
                      <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{item.skillName}</span>
                      <span> に </span>
                      {item.emojis.length > 0 && <span className="text-lg">{item.emojis.join('')}</span>}
                      {item.emojis.length > 0 && item.commentText && <span> と </span>}
                      {item.commentText && <span>「{item.commentText}」</span>}
                    </>
                  )}
                  {item.type === 'pending' && (
                    <>
                      <span className={cn('font-semibold', isClicked ? 'text-gray-600' : 'text-gray-800')}>{emp?.name}</span>
                      <span> さんが </span>
                      <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{item.skillName}</span>
                      <span> の認定を申請しました</span>
                    </>
                  )}
                </p>
                <span className="text-[10px] text-gray-400">{timeAgo(item.createdAt)}</span>
              </div>
              {!isClicked && (
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
