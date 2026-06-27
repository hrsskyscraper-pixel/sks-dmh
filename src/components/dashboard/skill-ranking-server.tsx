import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { getTestEmployeeIds } from '@/lib/test-data'
import { computeSkillCountRanking } from '@/lib/skill-ranking'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const MEDALS = ['🥇', '🥈', '🥉']

/** ホーム: 過去30日のスキル習得数（認定数）ランキング（全店対象） */
export async function SkillRankingServer() {
  const me = await getCurrentEmployee()
  const db = createAdminClient()
  const testIds = await getTestEmployeeIds()
  const fromISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ranking = await computeSkillCountRanking(db, fromISO, null, testIds, 10)
  if (ranking.length === 0) return null

  return (
    <div className="px-4">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <span>🏆</span>スキル習得数ランキング
          </CardTitle>
          <p className="text-[10px] text-muted-foreground/70">過去30日間・全店の認定数</p>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-1.5">
          {ranking.map((r, i) => {
            const isMe = !!me && r.employeeId === me.id
            return (
              <div key={r.employeeId} className={cn('flex items-center gap-2 rounded-lg px-2.5 py-1.5', isMe ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50')}>
                <span className="w-6 text-center text-sm font-bold text-gray-400 flex-shrink-0">{MEDALS[i] ?? i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm truncate', isMe ? 'font-bold text-orange-700' : 'text-gray-700')}>
                    {r.name}
                    {isMe && <span className="ml-1 text-[9px] bg-orange-500 text-white rounded px-1 align-middle">あなた</span>}
                  </p>
                  {r.store && <p className="text-[10px] text-gray-400 truncate">{r.store}</p>}
                </div>
                <span className="text-sm font-black text-orange-600 flex-shrink-0">{r.count}<span className="text-[10px] font-normal text-gray-400 ml-0.5">個</span></span>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
