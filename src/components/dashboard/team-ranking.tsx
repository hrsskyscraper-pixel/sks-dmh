'use client'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface TeamMemberStat {
  id: string
  name: string
  avatar_url: string | null
  employment_type: string | null
  hire_date: string | null
  store_name: string | null
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

export function TeamRanking({ currentEmployeeId, stats }: Props) {
  const sorted = [...stats].sort((a, b) => {
    const pctA = a.totalSkills > 0 ? a.certifiedCount / a.totalSkills : 0
    const pctB = b.totalSkills > 0 ? b.certifiedCount / b.totalSkills : 0
    if (pctB !== pctA) return pctB - pctA
    return b.certifiedCount - a.certifiedCount
  })

  if (sorted.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <span>🏆</span>
          みんなの頑張り
        </CardTitle>
        <p className="text-[10px] text-muted-foreground/70">
          青い縦線は累計勤務時間から算出した標準進捗率
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {sorted.map((member, index) => {
          const actualPct = member.totalSkills > 0
            ? Math.round((member.certifiedCount / member.totalSkills) * 100)
            : 0
          const stdPct = member.standardPct
          const diff = actualPct - stdPct
          const isMe = member.id === currentEmployeeId
          const medal = MEDALS[index] ?? null

          return (
            <div
              key={member.id}
              className={cn(
                'rounded-xl px-3 py-3',
                isMe
                  ? 'bg-orange-50 border-2 border-orange-300 shadow-sm'
                  : 'bg-gray-50 border border-gray-100'
              )}
            >
              {/* ヘッダー行: 順位・アバター・名前 */}
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 text-center flex-shrink-0">
                  {medal ? (
                    <span className="text-base leading-none">{medal}</span>
                  ) : (
                    <span className="text-xs font-bold text-gray-400">{index + 1}</span>
                  )}
                </div>
                <Avatar className="w-7 h-7 flex-shrink-0">
                  <AvatarImage src={member.avatar_url ?? undefined} />
                  <AvatarFallback className={cn(
                    'text-xs font-bold',
                    isMe ? 'bg-orange-200 text-orange-700' : 'bg-gray-200 text-gray-600'
                  )}>
                    {member.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">
                  <p className={cn(
                    'text-xs font-semibold',
                    isMe ? 'text-orange-700' : 'text-gray-700'
                  )}>
                    {member.name}
                  </p>
                  <Badge className="bg-orange-100 text-orange-700 text-[9px] border-0 px-1.5 h-4 flex-shrink-0">
                    {calcHireYear(member.hire_date)}年目
                  </Badge>
                  {member.employment_type === 'メイト' ? (
                    <Badge className="bg-pink-100 text-pink-700 text-[9px] border-0 px-1.5 h-4 flex-shrink-0">メイト</Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-700 text-[9px] border-0 px-1.5 h-4 flex-shrink-0">社員</Badge>
                  )}
                  {member.store_name && (
                    <Badge className="bg-blue-100 text-blue-700 text-[9px] border-0 px-1.5 h-4 flex-shrink-0">{member.store_name}</Badge>
                  )}
                  {isMe && (
                    <Badge className="bg-orange-500 text-white text-[9px] border-0 px-1.5 h-4 flex-shrink-0">
                      あなた
                    </Badge>
                  )}
                </div>
                {/* 差分バッジ */}
                {stdPct > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold flex-shrink-0',
                    diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'
                  )}>
                    {diff > 0 ? `▲+${diff}` : diff < 0 ? `▼${diff}` : '±0'}
                  </span>
                )}
              </div>

              {/* 1本バー */}
              <div className="flex items-center gap-2">
                <div className="flex-1 relative h-2 bg-gray-200 rounded-full">
                  {/* 実績バー */}
                  <div
                    className={cn('absolute top-0 left-0 h-full rounded-full', isMe ? 'bg-orange-400' : 'bg-blue-400')}
                    style={{ width: `${actualPct}%` }}
                  />
                  {/* GAP ハイライト */}
                  {Math.abs(diff) > 0 && stdPct > 0 && (
                    <div
                      className="absolute top-0 h-full rounded-sm"
                      style={{
                        left: `${Math.min(actualPct, stdPct)}%`,
                        width: `${Math.abs(diff)}%`,
                        background: diff < 0 ? 'rgba(251,191,36,0.25)' : 'rgba(52,211,153,0.25)',
                      }}
                    />
                  )}
                  {/* 標準マーカー */}
                  {stdPct > 0 && (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-blue-400 rounded-sm z-10"
                      style={{ left: `calc(${stdPct}% - 1px)` }}
                    />
                  )}
                </div>
                <span className={cn(
                  'text-[11px] font-black w-8 text-right flex-shrink-0',
                  isMe ? 'text-orange-600' : 'text-blue-600'
                )}>
                  {actualPct}%
                </span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
