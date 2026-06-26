'use client'

import { useState, useCallback, type ReactNode } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'
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

// 同じ人・同じ日でまとめるためのキー（JST ローカル日付）
function dayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

interface ActivityEntry { achievementId: string; skillName: string; emojis: string[]; commentText: string | null }
interface CertEntry { achievementId: string; skillName: string }

type NItem =
  | { kind: 'activity'; id: string; reactorId: string; createdAt: string; isNew: boolean; entries: ActivityEntry[] }
  | { kind: 'cert'; id: string; actorId: string | null; createdAt: string; isNew: boolean; entries: CertEntry[] }
  | { kind: 'cert_reject'; id: string; achievementId: string; skillName: string; actorId: string | null; comment: string | null; createdAt: string; isNew: boolean }
  | { kind: 'team_req_result'; id: string; requestType: string; status: 'pending' | 'approved' | 'rejected'; reviewerId: string | null; comment: string | null; teamName: string | null; createdAt: string; isNew: boolean }

const STORAGE_KEY = 'notif_clicked_ids'

function getClickedIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')) }
  catch { return new Set() }
}

export function NotificationList({ reactions, comments, achievementMap, employeeMap, myAchievementResults, myTeamRequestResults, notificationsReadAt }: Props) {
  const readAt = notificationsReadAt ? new Date(notificationsReadAt).getTime() : 0

  // --- 1. いいね・コメント: まず「人×スキル」でまとめ、その後「人×日」でまとめる ---
  const subMap = new Map<string, { reactorId: string; achievementId: string; skillName: string; emojis: string[]; commentText: string | null; createdAt: string; isNew: boolean }>()
  for (const r of reactions) {
    const ach = achievementMap[r.achievement_id]
    const key = `${r.employee_id}:${r.achievement_id}`
    const existing = subMap.get(key)
    if (existing) {
      if (!existing.emojis.includes(r.emoji)) existing.emojis.push(r.emoji)
      if (new Date(r.created_at).getTime() > new Date(existing.createdAt).getTime()) existing.createdAt = r.created_at
      if (new Date(r.created_at).getTime() > readAt) existing.isNew = true
    } else {
      subMap.set(key, {
        reactorId: r.employee_id, achievementId: r.achievement_id,
        skillName: ach?.skills?.name ?? '不明', emojis: [r.emoji], commentText: null,
        createdAt: r.created_at, isNew: new Date(r.created_at).getTime() > readAt,
      })
    }
  }
  for (const c of comments) {
    const ach = achievementMap[c.achievement_id]
    const key = `${c.employee_id}:${c.achievement_id}`
    const existing = subMap.get(key)
    if (existing) {
      existing.commentText = c.content
      if (new Date(c.created_at).getTime() > new Date(existing.createdAt).getTime()) existing.createdAt = c.created_at
      if (new Date(c.created_at).getTime() > readAt) existing.isNew = true
    } else {
      subMap.set(key, {
        reactorId: c.employee_id, achievementId: c.achievement_id,
        skillName: ach?.skills?.name ?? '不明', emojis: [], commentText: c.content,
        createdAt: c.created_at, isNew: new Date(c.created_at).getTime() > readAt,
      })
    }
  }

  const activityGroups = new Map<string, Extract<NItem, { kind: 'activity' }>>()
  for (const sub of subMap.values()) {
    const gk = `${sub.reactorId}:${dayKey(sub.createdAt)}`
    const g = activityGroups.get(gk)
    const entry: ActivityEntry = { achievementId: sub.achievementId, skillName: sub.skillName, emojis: sub.emojis, commentText: sub.commentText }
    if (g) {
      g.entries.push(entry)
      if (new Date(sub.createdAt).getTime() > new Date(g.createdAt).getTime()) g.createdAt = sub.createdAt
      g.isNew = g.isNew || sub.isNew
    } else {
      activityGroups.set(gk, { kind: 'activity', id: `ag-${gk}`, reactorId: sub.reactorId, createdAt: sub.createdAt, isNew: sub.isNew, entries: [entry] })
    }
  }

  // --- 2. 自分のスキル認定結果: 認定は「認定者×日」でまとめ、差し戻しは個別 ---
  const certGroups = new Map<string, Extract<NItem, { kind: 'cert' }>>()
  const rejectItems: NItem[] = []
  const seenAch = new Set<string>()
  for (const h of myAchievementResults) {
    if (h.action !== 'certify' && h.action !== 'reject') continue
    if (seenAch.has(h.achievement_id)) continue
    seenAch.add(h.achievement_id)
    const ach = achievementMap[h.achievement_id]
    const skillName = ach?.skills?.name ?? '不明'
    const isNew = new Date(h.created_at).getTime() > readAt
    if (h.action === 'certify') {
      const gk = `${h.actor_id ?? 'unknown'}:${dayKey(h.created_at)}`
      const g = certGroups.get(gk)
      const entry: CertEntry = { achievementId: h.achievement_id, skillName }
      if (g) {
        g.entries.push(entry)
        if (new Date(h.created_at).getTime() > new Date(g.createdAt).getTime()) g.createdAt = h.created_at
        g.isNew = g.isNew || isNew
      } else {
        certGroups.set(gk, { kind: 'cert', id: `cg-${gk}`, actorId: h.actor_id ?? null, createdAt: h.created_at, isNew, entries: [entry] })
      }
    } else {
      rejectItems.push({ kind: 'cert_reject', id: `cr-${h.id}`, achievementId: h.achievement_id, skillName, actorId: h.actor_id, comment: h.comment, createdAt: h.created_at, isNew })
    }
  }

  // --- 3. チーム変更申請の結果（個別）---
  const teamItems: NItem[] = []
  for (const r of myTeamRequestResults) {
    if (!r.reviewed_at) continue
    if (r.status !== 'approved' && r.status !== 'rejected') continue
    const payload = (r.payload ?? {}) as Record<string, unknown>
    const teamName = (typeof payload.team_name === 'string' ? payload.team_name : null)
    teamItems.push({
      kind: 'team_req_result', id: `tr-${r.id}`, requestType: r.request_type, status: r.status,
      reviewerId: r.reviewed_by, comment: r.review_comment, teamName,
      createdAt: r.reviewed_at, isNew: new Date(r.reviewed_at).getTime() > readAt,
    })
  }

  const items: NItem[] = [
    ...activityGroups.values(),
    ...certGroups.values(),
    ...rejectItems,
    ...teamItems,
  ]
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const [clickedIds, setClickedIds] = useState<Set<string>>(() => getClickedIds())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const handleClick = useCallback((id: string) => {
    setClickedIds(prev => {
      const next = new Set(prev)
      next.add(id)
      const arr = [...next].slice(-200)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
      return new Set(arr)
    })
  }, [])

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  if (items.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        お知らせはありません
      </div>
    )
  }

  const emojiCommentText = (e: ActivityEntry) => (
    <>
      {e.emojis.length > 0 && <span className="text-base">{e.emojis.join('')}</span>}
      {e.emojis.length > 0 && e.commentText && <span> と </span>}
      {e.commentText && <span>「{e.commentText}」</span>}
    </>
  )

  return (
    <div className="p-4 space-y-0.5">
      {items.map(item => {
        const isRejected =
          item.kind === 'cert_reject' ||
          (item.kind === 'team_req_result' && item.status === 'rejected')
        const isClicked = !isRejected && clickedIds.has(item.id)

        // アバター・色
        let avatarEmp: EmployeeInfo | undefined
        let avatarFallback = '?'
        let avatarBg = 'bg-gray-100 text-gray-600'
        if (item.kind === 'activity') {
          avatarEmp = employeeMap[item.reactorId]
          avatarFallback = avatarEmp?.name?.charAt(0) ?? '?'
        } else if (item.kind === 'cert') {
          if (item.actorId) avatarEmp = employeeMap[item.actorId]
          avatarFallback = '✓'
          avatarBg = 'bg-emerald-100 text-emerald-700'
        } else if (item.kind === 'cert_reject') {
          if (item.actorId) avatarEmp = employeeMap[item.actorId]
          avatarFallback = '!'
          avatarBg = 'bg-red-100 text-red-700'
        } else {
          if (item.reviewerId) avatarEmp = employeeMap[item.reviewerId]
          avatarFallback = item.status === 'approved' ? '✓' : '!'
          avatarBg = item.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
        }

        const rowClass = cn(
          'flex items-start gap-2.5 rounded-lg px-3 py-3 transition-colors border w-full text-left',
          isRejected
            ? 'bg-red-50 border-red-200 hover:bg-red-100'
            : isClicked
              ? 'bg-white border-transparent hover:bg-gray-50'
              : 'bg-blue-50 border-transparent hover:bg-blue-100'
        )

        const avatarNode = (
          <Avatar className="w-10 h-10 flex-shrink-0 mt-0.5">
            <AvatarImage src={avatarEmp?.avatar_url ?? undefined} />
            <AvatarFallback className={cn('text-sm font-bold', avatarBg)}>{avatarFallback}</AvatarFallback>
          </Avatar>
        )

        // --- まとめ（グループ）表示: ヘッダーを押すと展開 ---
        if ((item.kind === 'activity' || item.kind === 'cert') && item.entries.length > 1) {
          const isOpen = expanded.has(item.id)
          const headerText = item.kind === 'activity'
            ? (
              <>
                <span className={cn('font-semibold', isClicked ? 'text-gray-600' : 'text-gray-800')}>{avatarEmp?.name ?? '不明'}</span>
                <span> さんがあなたの </span>
                <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{item.entries.length}件</span>
                <span> のスキルに反応しました</span>
              </>
            )
            : (
              <>
                <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{item.entries.length}件</span>
                <span> のスキルが認定されました</span>
                {avatarEmp && <span className="text-xs text-gray-500"> ({avatarEmp.name})</span>}
              </>
            )

          return (
            <div key={item.id}>
              <button onClick={() => { handleClick(item.id); toggleExpand(item.id) }} className={rowClass}>
                {avatarNode}
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', isClicked ? 'text-gray-500' : 'text-gray-800')}>{headerText}</p>
                  <span className="text-[10px] text-gray-400">{timeAgo(item.createdAt)}</span>
                </div>
                {isOpen
                  ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />
                  : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
                {!isClicked && <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0 mt-2" />}
              </button>
              {isOpen && (
                <div className="ml-12 mt-0.5 mb-1 space-y-0.5">
                  {item.kind === 'activity'
                    ? item.entries.map((e, i) => (
                        <Link key={i} href={`/timeline#achievement-${e.achievementId}`} onClick={() => handleClick(item.id)}
                          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                          <span className="font-medium text-orange-600">{e.skillName}</span>
                          <span className="text-gray-500"> に </span>
                          {emojiCommentText(e)}
                        </Link>
                      ))
                    : item.entries.map((e, i) => (
                        <Link key={i} href={`/skills?tab=certified#achievement-${e.achievementId}`} onClick={() => handleClick(item.id)}
                          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                          <span className="text-emerald-600">✓</span>
                          <span className="font-medium text-orange-600">{e.skillName}</span>
                        </Link>
                      ))}
                </div>
              )}
            </div>
          )
        }

        // --- 単一表示: リンクで遷移 ---
        let href = '/'
        let body: ReactNode = null
        if (item.kind === 'activity') {
          const e = item.entries[0]
          href = `/timeline#achievement-${e.achievementId}`
          body = (
            <>
              <span className={cn('font-semibold', isClicked ? 'text-gray-600' : 'text-gray-800')}>{avatarEmp?.name ?? '不明'}</span>
              <span> さんが </span>
              <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{e.skillName}</span>
              <span> に </span>
              {emojiCommentText(e)}
            </>
          )
        } else if (item.kind === 'cert') {
          const e = item.entries[0]
          href = `/skills?tab=certified#achievement-${e.achievementId}`
          body = (
            <>
              <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{e.skillName}</span>
              <span> が認定されました</span>
              {avatarEmp && <span className="text-xs text-gray-500"> ({avatarEmp.name})</span>}
            </>
          )
        } else if (item.kind === 'cert_reject') {
          href = `/skills?tab=rejected#achievement-${item.achievementId}`
          body = (
            <>
              <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>{item.skillName}</span>
              <span> が差し戻されました</span>
              {avatarEmp && <span className="text-xs text-gray-500"> ({avatarEmp.name})</span>}
              {item.comment && <span className="block text-xs text-gray-600 mt-0.5">「{item.comment}」</span>}
            </>
          )
        } else {
          href = '/team?tab=requests'
          body = (
            <>
              <span className={cn('font-semibold', isClicked ? 'text-orange-400' : 'text-orange-600')}>
                {item.teamName ? `「${item.teamName}」` : ''}
                {REQUEST_TYPE_LABELS[item.requestType] ?? item.requestType}
              </span>
              <span>の申請が{item.status === 'approved' ? '承認されました' : '差し戻されました'}</span>
              {avatarEmp && <span className="text-xs text-gray-500"> ({avatarEmp.name})</span>}
              {item.comment && <span className="block text-xs text-gray-600 mt-0.5">「{item.comment}」</span>}
            </>
          )
        }

        return (
          <Link key={item.id} href={href} onClick={() => handleClick(item.id)}>
            <div className={rowClass}>
              {avatarNode}
              <div className="flex-1 min-w-0">
                {isRejected && (
                  <span className="inline-block mb-1 px-1.5 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold">要対応</span>
                )}
                <p className={cn('text-sm', isClicked ? 'text-gray-500' : 'text-gray-800')}>{body}</p>
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
