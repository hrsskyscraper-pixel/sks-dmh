'use client'

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { markNotificationsRead } from '@/app/(dashboard)/actions'
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
  canMarkAllRead?: boolean
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

export function NotificationList({ reactions, comments, achievementMap, employeeMap, pendingForMe, currentRole, notificationsReadAt, canMarkAllRead = false }: Props) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const readAt = notificationsReadAt ? new Date(notificationsReadAt).getTime() : 0

  // 同じスキル×同じ人のリアクション・コメントをグルーピング
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
        id: key,
        type: 'activity',
        employeeId: r.employee_id,
        achievementId: r.achievement_id,
        skillName: ach?.skills?.name ?? '不明',
        emojis: [r.emoji],
        commentText: null,
        createdAt: r.created_at,
        isNew: new Date(r.created_at).getTime() > readAt,
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
        id: key,
        type: 'activity',
        employeeId: c.employee_id,
        achievementId: c.achievement_id,
        skillName: ach?.skills?.name ?? '不明',
        emojis: [],
        commentText: c.content,
        createdAt: c.created_at,
        isNew: new Date(c.created_at).getTime() > readAt,
      })
    }
  }

  const items: NotificationItem[] = [...groupMap.values()]

  if (['manager', 'admin', 'ops_manager'].includes(currentRole)) {
    for (const p of pendingForMe) {
      items.push({
        id: `p-${p.id}`,
        type: 'pending',
        employeeId: p.employee_id,
        achievementId: p.id,
        skillName: p.skills?.name ?? '不明',
        emojis: [],
        commentText: null,
        createdAt: p.achieved_at,
        isNew: new Date(p.achieved_at).getTime() > readAt,
      })
    }
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 個別既読管理（localStorage）
  const STORAGE_KEY = 'notif_read_ids'
  const getReadIds = (): Set<string> => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
    } catch { return new Set() }
  }
  const [readIds, setReadIds] = useState<Set<string>>(() => getReadIds())

  const markAsRead = useCallback((id: string) => {
    setReadIds(prev => {
      const next = new Set(prev)
      next.add(id)
      const arr = [...next]
      const trimmed = arr.length > 200 ? arr.slice(arr.length - 200) : arr
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
      return new Set(trimmed)
    })
    // サーバー側も既読更新（ベルバッジに反映させるため）
    markNotificationsRead()
  }, [])

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        お知らせはありません
      </div>
    )
  }

  const unreadCount = items.filter(i => i.isNew && !readIds.has(i.id)).length

  const handleMarkAllRead = () => {
    startTransition(async () => {
      await markNotificationsRead()
      // 全アイテムをlocalStorageにも既読登録
      const allIds = items.map(i => i.id)
      const next = new Set([...readIds, ...allIds])
      const arr = [...next].slice(-200)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
      setReadIds(new Set(arr))
      router.refresh()
    })
  }

  return (
    <div className="p-4 space-y-2">
      {canMarkAllRead && unreadCount > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="text-xs text-gray-500 h-7" onClick={handleMarkAllRead} disabled={isPending}>
            全て既読にする
          </Button>
        </div>
      )}
      {items.map(item => {
        const emp = employeeMap[item.employeeId]
        const href = item.type === 'pending'
          ? '/team?tab=pending'
          : `/timeline#achievement-${item.achievementId}`
        const isUnread = item.isNew && !readIds.has(item.id)
        return (
          <Link key={item.id} href={href} onClick={() => markAsRead(item.id)}>
            <Card className={cn('hover:shadow-md transition-shadow cursor-pointer', isUnread ? 'border-orange-200 bg-orange-50/50' : '')}>
              <CardContent className="py-3 px-4">
              <div className="flex items-start gap-2.5">
                <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5">
                  <AvatarImage src={emp?.avatar_url ?? undefined} />
                  <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-bold">
                    {emp?.name?.charAt(0) ?? '?'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    {item.type === 'activity' && (
                      <>
                        <span className="font-semibold">{emp?.name}</span>
                        <span className="text-gray-500"> さんが </span>
                        <span className="font-semibold text-orange-600">{item.skillName}</span>
                        <span className="text-gray-500"> に </span>
                        {item.emojis.length > 0 && <span className="text-lg">{item.emojis.join('')}</span>}
                        {item.emojis.length > 0 && item.commentText && <span className="text-gray-500"> と </span>}
                        {item.commentText && <span className="text-gray-700">「{item.commentText}」</span>}
                      </>
                    )}
                    {item.type === 'pending' && (
                      <>
                        <span className="font-semibold">{emp?.name}</span>
                        <span className="text-gray-500"> さんが </span>
                        <span className="font-semibold text-orange-600">{item.skillName}</span>
                        <span className="text-gray-500"> の認定を申請しました</span>
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">{timeAgo(item.createdAt)}</span>
                    {isUnread && <Badge className="text-[9px] bg-orange-500 text-white border-0 h-4 px-1.5">NEW</Badge>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          </Link>
        )
      })}
    </div>
  )
}
