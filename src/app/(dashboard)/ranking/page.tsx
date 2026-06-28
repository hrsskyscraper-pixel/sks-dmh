export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRankingExcludedIds } from '@/lib/test-data'
import { computeSkillCountRanking } from '@/lib/skill-ranking'
import { RankingList } from '@/components/dashboard/ranking-list'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'

export default async function RankingPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')
  const params = (await (searchParams ?? Promise.resolve({}))) as { month?: string }
  const month = params?.month

  let fromISO: string
  let toISO: string | null
  let label: string
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    fromISO = new Date(y, m - 1, 1).toISOString()
    toISO = new Date(y, m, 1).toISOString()
    label = `${y}年${m}月`
  } else {
    fromISO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    toISO = null
    label = '過去30日間'
  }

  const db = createAdminClient()
  const testIds = await getRankingExcludedIds()
  const ranking = await computeSkillCountRanking(db, fromISO, toISO, testIds, 1000)

  return (
    <>
      <TopBar title="スキル習得数ランキング" />
      <div className="p-4 max-w-lg mx-auto">
        <p className="text-sm text-gray-600 mb-2">
          🏆 <span className="font-semibold">{label}</span>・全社・全メンバーの認定数（{ranking.length}名）
        </p>
        <Card>
          <CardContent className="py-3 px-3">
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">この期間の認定はまだありません</p>
            ) : (
              <RankingList ranking={ranking} currentEmployeeId={me.id} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
