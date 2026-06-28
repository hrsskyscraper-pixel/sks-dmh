import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { getRankingExcludedIds } from '@/lib/test-data'
import { computeSkillCountRanking } from '@/lib/skill-ranking'
import { RankingList } from '@/components/dashboard/ranking-list'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** ホーム: 過去30日のスキル習得数（認定数）ランキング（全店対象・TOP5＋全員リンク） */
export async function SkillRankingServer() {
  const me = await getCurrentEmployee()
  const db = createAdminClient()
  const testIds = await getRankingExcludedIds()
  const fromISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const ranking = await computeSkillCountRanking(db, fromISO, null, testIds, 5)
  if (ranking.length === 0) return null

  return (
    <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <span>🏆</span>スキル習得数ランキング
            </CardTitle>
            <Link href="/ranking" className="text-xs text-orange-600 hover:underline whitespace-nowrap">全員を見る →</Link>
          </div>
          <p className="text-[10px] text-muted-foreground/70">過去30日間・全社・全メンバーの認定数</p>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <RankingList ranking={ranking} currentEmployeeId={me?.id} />
        </CardContent>
    </Card>
  )
}
