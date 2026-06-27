import { cn } from '@/lib/utils'
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
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm truncate', isMe ? 'font-bold text-orange-700' : 'text-gray-700')}>
                {r.name}
                {isMe && <span className="ml-1 text-[9px] bg-orange-500 text-white rounded px-1 align-middle">あなた</span>}
              </p>
              {(r.store || r.curricula.length > 0) && (
                <div className="flex items-center gap-1 flex-wrap mt-0.5">
                  {r.store && <span className="text-[10px] text-gray-400 truncate">{r.store}</span>}
                  {r.curricula.map(c => (
                    <span key={c} className="text-[9px] text-blue-600 bg-blue-50 rounded px-1 py-px truncate max-w-[160px]">{c}</span>
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
