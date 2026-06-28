'use client'

import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Crown, Users } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { AffiliationBadge } from '@/components/ui/affiliation'

export interface TeamAffiliation {
  name: string
  type: 'store' | 'department' | 'project'
  role: 'member' | 'leader'
  shared?: boolean
}

export interface CurriculumBreakdown {
  projectId: string
  name: string
  certifiedCount: number
  totalSkills: number
  standardPct: number
}

export interface TeamMemberStat {
  id: string
  name: string
  avatar_url: string | null
  employment_type: string | null
  hire_date: string | null
  teams: TeamAffiliation[]
  curricula: string[]
  /** カリキュラム別の内訳（合算の内訳・展開表示用） */
  breakdown: CurriculumBreakdown[]
  /** 合算（全有効カリキュラム） */
  certifiedCount: number
  totalSkills: number
  standardPct: number
}

function calcHireYear(hireDate: string | null): number {
  if (!hireDate) return 1
  const hire = new Date(hireDate)
  const today = new Date()
  const hireFY = hire.getMonth() >= 3 ? hire.getFullYear() : hire.getFullYear() - 1
  const todayFY = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return Math.max(1, todayFY - hireFY + 1)
}

interface Props {
  currentEmployeeId: string
  stats: TeamMemberStat[]
}

const MEDALS = ['🥇', '🥈', '🥉']

/** 折りたたまずに常に表示する上位人数 */
const TOP_N = 5

export function TeamRanking({ currentEmployeeId, stats }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [openBreakdown, setOpenBreakdown] = useState<Set<string>>(new Set())
  const cardRef = useRef<HTMLDivElement>(null)
  const toggleBreakdown = (id: string) => setOpenBreakdown(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // 折りたたみは、一番下までスクロールしなくても押せるフロートボタンからも行える。
  // 折りたたんだ後はランキング先頭へ戻し、長いリストの末尾に取り残されないようにする。
  const collapse = () => {
    setExpanded(false)
    // カードの上端は折りたたみで動かないため、即時スクロールで問題ない。
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const sorted = [...stats].sort((a, b) => {
    const pctA = a.totalSkills > 0 ? a.certifiedCount / a.totalSkills : 0
    const pctB = b.totalSkills > 0 ? b.certifiedCount / b.totalSkills : 0
    if (pctB !== pctA) return pctB - pctA
    return b.certifiedCount - a.certifiedCount
  })

  if (sorted.length === 0) return null

  const topMembers = sorted.slice(0, TOP_N)
  const restMembers = sorted.slice(TOP_N)
  const hasRest = restMembers.length > 0
  // 自分が6位以降にいるなら、折りたたみ中でも順位だけ伝わるように知らせる
  const myRestIndex = restMembers.findIndex((m) => m.id === currentEmployeeId)

  const renderMember = (member: TeamMemberStat, index: number) => {
    const actualPct = member.totalSkills > 0
      ? Math.round((member.certifiedCount / member.totalSkills) * 100)
      : 0
    const stdPct = member.standardPct
    const diff = actualPct - stdPct
    const isMe = member.id === currentEmployeeId
    const medal = MEDALS[index] ?? null
    const hasBreakdown = member.breakdown.length > 1
    const isOpen = openBreakdown.has(member.id)
    // スキル習得ランキングと同じ「行全体が棒グラフ」スタイル（塗り＝達成率・右端角丸）。色はブルー系（自分はオレンジ）。
    const fill = isMe ? 'rgba(251,146,60,0.45)' : 'rgba(96,165,250,0.40)'
    const base = isMe ? 'rgba(255,237,213,0.9)' : 'rgba(243,244,246,0.8)'

    return (
      <div key={member.id}>
        <div
          className={cn('relative overflow-hidden rounded-lg', isMe && 'border border-orange-300')}
          style={{ background: base }}
        >
          {/* 実績バー（達成率） */}
          <div className="absolute inset-y-0 left-0 rounded-r-lg" style={{ width: `${actualPct}%`, background: fill }} aria-hidden />
          {/* 標準進捗マーカー（青い縦線） */}
          {stdPct > 0 && (
            <div className="absolute inset-y-0 w-0.5 bg-blue-600/70 z-10" style={{ left: `calc(${stdPct}% - 1px)` }} aria-hidden />
          )}
          {/* コンテンツ */}
          <div className="relative z-20 flex items-center gap-2 px-2.5 py-1.5">
            <span className="w-6 text-center text-sm font-bold text-gray-500 flex-shrink-0">{medal ?? index + 1}</span>
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarImage src={member.avatar_url ?? undefined} />
              <AvatarFallback className={cn('text-[10px] font-bold', isMe ? 'bg-orange-200 text-orange-700' : 'bg-gray-200 text-gray-600')}>
                {member.name.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <p className={cn('text-sm font-semibold truncate', isMe ? 'text-orange-700' : 'text-gray-700')}>{member.name}</p>
                <Badge className="bg-orange-100 text-orange-700 text-[9px] border-0 px-1 h-3.5 flex-shrink-0">{calcHireYear(member.hire_date)}年目</Badge>
                {member.employment_type === 'メイト' ? (
                  <Badge className="bg-pink-100 text-pink-700 text-[9px] border-0 px-1 h-3.5 flex-shrink-0">メイト</Badge>
                ) : (
                  <Badge className="bg-green-100 text-green-700 text-[9px] border-0 px-1 h-3.5 flex-shrink-0">社員</Badge>
                )}
                {isMe && <Badge className="bg-orange-500 text-white text-[9px] border-0 px-1 h-3.5 flex-shrink-0">あなた</Badge>}
              </div>
              {(member.teams.length > 0 || member.curricula.length > 0) && (
                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                  {member.teams.map((t, i) => (
                    <AffiliationBadge key={`${t.type}:${t.name}:${i}`} type={t.type} name={t.name} leader={t.role === 'leader'} shared={t.shared} />
                  ))}
                  {member.curricula.map(c => (
                    <span key={c} className="inline-flex items-center text-[9px] text-orange-700 bg-orange-50 border border-orange-100 rounded px-1 py-px font-medium max-w-[140px] truncate">{c}</span>
                  ))}
                </div>
              )}
            </div>
            {hasBreakdown ? (
              <button onClick={() => toggleBreakdown(member.id)} className="text-right flex-shrink-0" title="カリキュラム別の内訳">
                <div className="flex items-center justify-end gap-1 leading-none">
                  {stdPct > 0 && (
                    <span className={cn('text-[10px] font-bold', diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400')}>
                      {diff > 0 ? `▲+${diff}` : diff < 0 ? `▼${diff}` : '±0'}
                    </span>
                  )}
                  <span className={cn('text-sm font-black', isMe ? 'text-orange-600' : 'text-blue-600')}>{actualPct}%</span>
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </div>
                <span className="text-[9px] text-gray-400 leading-none">{member.certifiedCount}/{member.totalSkills}</span>
              </button>
            ) : (
              <div className="text-right flex-shrink-0">
                <div className="flex items-center justify-end gap-1 leading-none">
                  {stdPct > 0 && (
                    <span className={cn('text-[10px] font-bold', diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400')}>
                      {diff > 0 ? `▲+${diff}` : diff < 0 ? `▼${diff}` : '±0'}
                    </span>
                  )}
                  <span className={cn('text-sm font-black', isMe ? 'text-orange-600' : 'text-blue-600')}>{actualPct}%</span>
                </div>
                <span className="text-[9px] text-gray-400 leading-none">{member.certifiedCount}/{member.totalSkills}</span>
              </div>
            )}
          </div>
        </div>

        {/* カリキュラム別の内訳（右側の数値クリックで開閉） */}
        {hasBreakdown && isOpen && (
          <div className="mt-1 ml-9 mr-2 space-y-1 pb-1">
            {member.breakdown.map(b => {
              const bPct = b.totalSkills > 0 ? Math.round((b.certifiedCount / b.totalSkills) * 100) : 0
              return (
                <div key={b.projectId} className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-600 w-24 truncate flex-shrink-0" title={b.name}>{b.name}</span>
                  <div className="flex-1 relative h-1.5 bg-gray-200 rounded-full">
                    <div className="absolute top-0 left-0 h-full rounded-full bg-blue-300" style={{ width: `${bPct}%` }} />
                    {b.standardPct > 0 && (
                      <div className="absolute top-1/2 -translate-y-1/2 w-0.5 h-2 bg-blue-600/70 rounded-sm" style={{ left: `calc(${b.standardPct}% - 1px)` }} />
                    )}
                  </div>
                  <span className="text-[9px] text-gray-500 w-10 text-right flex-shrink-0">{b.certifiedCount}/{b.totalSkills}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card ref={cardRef} className="scroll-mt-20">
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <span>🏆</span>
          みんなの頑張り
        </CardTitle>
        <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
          <Users className="w-3 h-3 text-gray-400" />
          あなたが所属するチーム・店舗・部署のメンバーを表示しています
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          青い縦線は累計勤務時間から算出した標準進捗率
        </p>
        <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 flex-wrap mt-0.5">
          <Crown className="w-2.5 h-2.5 text-amber-500" />＝リーダー
          <span className="ml-1">／ 濃い色のバッジ＝あなたと共通の所属</span>
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-1.5">
        {topMembers.map((member, index) => renderMember(member, index))}

        {hasRest && expanded &&
          restMembers.map((member, index) => renderMember(member, index + TOP_N))}

        {hasRest && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full flex items-center justify-center gap-1 rounded-lg border border-gray-100 bg-gray-50 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ChevronDown className="w-4 h-4" />
            他{restMembers.length}人を見る
            {myRestIndex >= 0 && (
              <span className="text-orange-600">（あなたは{myRestIndex + TOP_N + 1}位）</span>
            )}
          </button>
        )}

      </CardContent>

      {/* 一番下までスクロールしなくても閉じられるフロートボタン（下部ナビの上に浮かぶ） */}
      {hasRest && expanded && (
        <button
          type="button"
          onClick={collapse}
          aria-label="みんなの頑張りを折りたたむ"
          className="fixed z-40 left-1/2 -translate-x-1/2 bottom-20 flex items-center gap-1.5 rounded-full bg-gray-900/90 text-white text-xs font-semibold px-4 py-2.5 shadow-lg backdrop-blur-sm hover:bg-gray-900 active:scale-95 transition"
        >
          <ChevronUp className="w-4 h-4" />
          みんなの頑張りを閉じる
        </button>
      )}
    </Card>
  )
}
