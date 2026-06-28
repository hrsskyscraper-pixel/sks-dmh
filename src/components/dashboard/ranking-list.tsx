import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AffiliationBadge } from '@/components/ui/affiliation'
import type { RankEntry } from '@/lib/skill-ranking'

const MEDALS = ['🥇', '🥈', '🥉']

/** スキル習得数ランキングの行リスト（ホーム・全員ページ共通の表示部品） */
export function RankingList({ ranking, currentEmployeeId }: { ranking: RankEntry[]; currentEmployeeId?: string }) {
  return (
    <div className="space-y-1.5">
      {ranking.map((r, i) => {
        const isMe = !!currentEmployeeId && r.employeeId === currentEmployeeId
        return (
          <div key={r.employeeId} className={cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5', isMe ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50')}>
            <span className="w-6 text-center text-sm font-bold text-gray-400 flex-shrink-0">{MEDALS[i] ?? i + 1}</span>
            <Avatar className="w-7 h-7 flex-shrink-0">
              <AvatarImage src={r.avatarUrl ?? undefined} />
              <AvatarFallback className={cn('text-[10px] font-bold', isMe ? 'bg-orange-200 text-orange-700' : 'bg-gray-200 text-gray-500')}>{r.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm truncate', isMe ? 'font-bold text-orange-700' : 'text-gray-700')}>
                {r.name}
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
            <span className="text-sm font-black text-orange-600 flex-shrink-0">{r.count}<span className="text-[10px] font-normal text-gray-400 ml-0.5">個</span></span>
          </div>
        )
      })}
    </div>
  )
}
