'use client'

import { useState, useCallback } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface EmployeeInfo { id: string; name: string; avatar_url: string | null }
interface AchievementInfo { id: string; skill_id: string; status: string; skills: { name: string } | null }

const REQUEST_TYPE_LABELS: Record<string, string> = {
  create_team: 'チーム作成',
  add_member: 'メンバー追加',
  remove_member: 'メンバー削除',
  add_manager: 'リーダー追加',
  remove_manager: 'リーダー削除',
}

interface Props {
  reactions: { id: string; achievement_id: string; employee_id: string; emoji: string; created_at: string }[]
  comments: { id: string; achievement_id: string; employee_id: string; content: string; created_at: string }[]
  achievementMap: Record<string, AchievementInfo>
  employeeMap: Record<string, EmployeeInfo>
  myAchievementResults: { id: string; achievement_id: string; action: 'apply' | 'reject' | 'reapply' | 'certify'; actor_id: string; comment: string | null; created_at: string }[]
  myTeamRequestResults: { id: string; request_type: string; team_id: string | null; reviewed_by: string | null; reviewed_at: string | null; review_comment: string | null; status: 'pending' | 'approved' | 'rejected'; payload: unknown }[]
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

type NotificationItem =
  | { kind: 'activity'; id: string; employeeId: string; achievementId: string; skillName: string; emojis: string[]; commentText: string | null; createdAt: string; isNew: boolean }
  | { kind: 'cert_result'; id: string; achievementId: string; skillName: string; action: 'apply' | 'reject' | 'reapply' | 'certify'; actorId: string | null; comment: string | null; createdAt: string; isNew: boolean }
  | { kind: 'team_req_result'; id: string; requestType: string; status: 'pending' | 'approved' | 'rejected'; reviewerId: string | null; comment: string | null; teamName: string | null; createdAt: string; isNew: boolean }

const STORAGE_KEY = 'notif_clicked_ids'

function getClickedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')) }
  catch { return new Set() }
}

export function NotificationList({ reactions, comments, achievementMap, employeeMap, myAchievementResults, myTeamRequestResults, notificationsReadAt }: Props) {
  const readAt = notificationsReadAt ? new Date(notificationsReadAt).getTime() : 0

  // 同じスキル×同じ人のリアクション・コメントをグルーピング
  const groupMap = new Map<string, Extract<NotificationItem, { kind: 'activity' }>>()

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
        kind: 'activity', id: key, employeeId: r.employee_id, achievementId: r.achievement_id,
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
        kind: 'activity', id: key, employeeId: c.employee_id, achievementId: c.achievement_id,
        skillName: ach?.skills?.name ?? '不明', emojis: [], commentText: c.content,
        createdAt: c.created_at, isNew: new Date(c.created_at).getTime() > readAt,
      })
    }
  }

  const items: NotificationItem[] = [...groupMap.values()]

  // 自分のスキル認定結果（achievement_history の certify/reject のみ、最新を採用）
  const seenAch = new Set<string>()
  for (const h of myAchievementResults) {
    if (h.action !== 'certify' && h.action !== 'reject') continue
    if (seenAch.has(h.achievement_id)) continue
    seenAch.add(h.achievement_id)
    const ach = achievementMap[h.achievement_id]
    items.push({
      kind: 'cert_result',
      id: `cr-${h.id}`,
      achievementId: h.achievement_id,
      skillName: ach?.skills?.name ?? '不明',
      action: h.action,
      actorId: h.actor_id,
      comment: h.comment,
      createdAt: h.created_at,
      isNew: new Date(h.created_at).getTime() > readAt,
    })
  }

  // 自分のチーム変更申請の承認・差戻結果
  for (const r of myTeamRequestResults) {
    if (!r.reviewed_at) continue
    if (r.status !== 'approved' && r.status !== 'rejected') continue
    const payload = (r.payload ?? {}) as Record<string, unknown>
    const teamName = (typeof payload.team_name === 'string' ? payload.team_name : null)
    items.push({
      kind: 'team_req_result',
      id: `tr-${r.id}`,
      requestType: r.request_type,
      status: r.status,
      reviewerId: r.reviewed_by,
      comment: r.review_comment,
      teamName,
      createdAt: r.reviewed_at,
      isNew: new Date(r.reviewed_at).getTime() > readAt,
    })
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

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
        const isRejected =
          (item.kind === 'cert_result' && item.action === 'reject') ||
          (item.kind === 'team_req_result' && item.status === 'rejected')
        // 差戻は要対応なのでクリック済みでも強調を維持
        const isClicked = !isRejected && clickedIds.has(item.id)
        let href = '/'
        let avatarEmp: EmployeeInfo | undefined
        let avatarFallback = '?'
        let avatarBg = 'bg-gray-100 text-gray-600'

        if (item.kind === 'activity') {
          href = `/timeline#achievement-${item.achievementId}`
          avatarEmp = employeeMap[item.employeeId]
          avatarFallback = avatarEmp?.name?.charAt(0) ?? '?'
        } else if (item.kind === 'cert_result') {
          href = `/skills#achievement-${item.achievementId}`
          if (item.actorId) avatarEmp = employeeMap[item.actorId]
          avatarFallback = item.action === 'certify' ? '✓' : '!'
          avatarBg = item.action === 'certify' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        } else {
          href = '/team?tab=requests'
          if (item.reviewerId) avatarEmp = employeeMap[item.reviewerId]
          avatarFallback = item.status === 'approved' ? '✓' : '!'
          avatarBg = item.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        }

        return (
          <Link key={item.id} href={href} onClick={() => handleClick(item.id)}>
            <div className={cn(
              'flex items-start gap-2.5 rounded-lg px-3 py-3 transition-colors border',
              isRejected
                ? 'bg-red-50 border-red-200 hover:bg-red-100'
                : isClicked
                  ? 'bg-white border-transparent hover:bg-gray-50'
                  : 'bg-blue-50 border-transparent hover:bg-blue-100'
            )}>
              <Avatar className="w-10 h-10 flex-shrink-0 mt-0.5">
                <AvatarImage src={avatarEmp?.avatar_url ?? undefined} />
                <AvatarFallback className={cn('text-sm font-bold', avatarBg)}>
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                {isRejected && (
                  <span className="inline-block mb-1 px-1.5 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold">要対応</span>
                )}
                <p className={cn('text-sm', isClicked ? 'text-gray-500' : 'text-gray-800')}>
                  {item.kind === 'activity' && (
                    <>
                      <span className={cn('font-semibold', isClicked ? 'text-gray-600' : 'text-gray-800')}>{avatarEmp?.name}</span>
                      <span> さんが </span>
                      <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{item.skillName}</span>
                      <span> に </span>
                      {item.emojis.length > 0 && <span className="text-lg">{item.emojis.join('')}</span>}
                      {item.emojis.length > 0 && item.commentText && <span> と </span>}
                      {item.commentText && <span>「{item.commentText}」</span>}
                    </>
                  )}
                  {item.kind === 'cert_result' && item.action === 'certify' && (
                    <>
                      <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{item.skillName}</span>
                      <span> が認定されました</span>
                      {avatarEmp && <span className="text-xs text-gray-500"> ({avatarEmp.name})</span>}
                      {item.comment && <span className="block text-xs text-gray-600 mt-0.5">「{item.comment}」</span>}
                    </>
                  )}
                  {item.kind === 'cert_result' && item.action === 'reject' && (
                    <>
                      <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{item.skillName}</span>
                      <span> が差し戻されました</span>
                      {avatarEmp && <span className="text-xs text-gray-500"> ({avatarEmp.name})</span>}
                      {item.comment && <span className="block text-xs text-gray-600 mt-0.5">「{item.comment}」</span>}
                    </>
                  )}
                  {item.kind === 'team_req_result' && (
                    <>
                      <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>
                        {item.teamName ? `「${item.teamName}」` : ''}
                        {REQUEST_TYPE_LABELS[item.requestType] ?? item.requestType}
                      </span>
                      <span>の申請が{item.status === 'approved' ? '承認されました' : '差し戻されました'}</span>
                      {avatarEmp && <span className="text-xs text-gray-500"> ({avatarEmp.name})</span>}
                      {item.comment && <span className="block text-xs text-gray-600 mt-0.5">「{item.comment}」</span>}
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
