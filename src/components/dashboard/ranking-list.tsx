'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AffiliationBadge } from '@/components/ui/affiliation'
import type { RankEntry } from '@/lib/skill-ranking'

const MEDALS = ['🥇', '🥈', '🥉']

function fmtJoin(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/** スキル習得ランキングの行リスト（ホーム・全員ページ共通）。背景の塗りで棒グラフ的に、件数クリックで内訳表示。 */
export function RankingList({ ranking, currentEmployeeId }: { ranking: RankEntry[]; currentEmployeeId?: string }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  // 先頭（最多）を100%として、各行の塗り幅を比率で表す（棒グラフ的・縦幅節約）
  const maxCount = ranking[0]?.count ?? 0

  return (
    <div className="space-y-1.5">
      {ranking.map((r, i) => {
        const isMe = !!currentEmployeeId && r.employeeId === currentEmployeeId
        const pct = maxCount > 0 ? Math.round((r.count / maxCount) * 100) : 0
        const fill = isMe ? 'rgba(251,146,60,0.50)' : 'rgba(251,146,60,0.32)'
        const base = isMe ? 'rgba(255,237,213,0.9)' : 'rgba(243,244,246,0.8)'
        const hasBreakdown = r.breakdown.length > 1
        const isOpen = open.has(r.employeeId)
        return (
          <div key={r.employeeId}>
            <div
              className={cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5', isMe && 'border border-orange-300')}
              style={{ background: `linear-gradient(to right, ${fill} ${pct}%, ${base} ${pct}%)` }}
            >
              <span className="w-6 text-center text-sm font-bold text-gray-500 flex-shrink-0">{MEDALS[i] ?? i + 1}</span>
              <Avatar className="w-7 h-7 flex-shrink-0">
                <AvatarImage src={r.avatarUrl ?? undefined} />
                <AvatarFallback className={cn('text-[10px] font-bold', isMe ? 'bg-orange-200 text-orange-700' : 'bg-gray-200 text-gray-500')}>{r.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm truncate', isMe ? 'font-bold text-orange-700' : 'text-gray-700')}>
                  {r.name}
                  {r.joinDate && <span className="ml-1.5 text-[9px] text-gray-400 font-normal">MB参加 {fmtJoin(r.joinDate)}</span>}
                  {isMe && <span className="ml-1 text-[9px] bg-orange-500 text-white rounded px-1 align-middle">あなた</span>}
                </p>
                {(r.store || r.curricula.length > 0) && (
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    {r.store && r.affType && <AffiliationBadge type={r.affType} name={r.store} />}
                    {r.curricula.map(c => (
                      <span key={c} className="text-[9px] text-orange-700 bg-orange-50 border border-orange-100 rounded px-1 py-px truncate max-w-[160px]">{c}</span>
                    ))}
                  </div>
                )}
              </div>
              {hasBreakdown ? (
                <button onClick={() => toggle(r.employeeId)} className="flex items-center gap-0.5 flex-shrink-0" title="カリキュラム別の内訳">
                  <span className="text-sm font-black text-orange-600">{r.count}<span className="text-[10px] font-normal text-gray-400 ml-0.5">個</span></span>
                  {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                </button>
              ) : (
                <span className="text-sm font-black text-orange-600 flex-shrink-0">{r.count}<span className="text-[10px] font-normal text-gray-400 ml-0.5">個</span></span>
              )}
            </div>
            {hasBreakdown && isOpen && (
              <div className="mt-1 ml-9 mr-2 space-y-0.5 pb-1">
                {r.breakdown.map(b => (
                  <div key={b.name} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-gray-600 truncate">{b.name}</span>
                    <span className="font-semibold text-gray-700 flex-shrink-0">{b.count}個</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
