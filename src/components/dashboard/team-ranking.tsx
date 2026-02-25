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
        <p className="text-xs text-muted-foreground">
          実績進捗 vs 標準進捗*
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          *累計勤務時間に応じた標準的なスキル習得進捗率
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

              {/* 2本バー */}
              <div className="space-y-1.5">
                {/* 実績バー */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 w-7 flex-shrink-0 text-right">実績</span>
                  <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        isMe ? 'bg-orange-500' : 'bg-blue-400'
                      )}
                      style={{ width: `${actualPct}%` }}
                    />
                  </div>
                  <span className={cn(
                    'text-[11px] font-black w-8 text-right flex-shrink-0',
                    isMe ? 'text-orange-600' : 'text-blue-600'
                  )}>
                    {actualPct}%
                  </span>
                </div>

                {/* 標準バー */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-7 flex-shrink-0 text-right">標準</span>
                  <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gray-400 transition-all duration-500"
                      style={{ width: `${stdPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-gray-500 w-8 text-right flex-shrink-0">
                    {stdPct}%
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
