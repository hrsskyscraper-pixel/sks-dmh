export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRankingExcludedIds } from '@/lib/test-data'
import { buildRankingDataset } from '@/lib/ranking-data'
import { TrendExplorer } from '@/components/dashboard/trend-explorer'
import { RankingNav } from '@/components/dashboard/ranking-nav'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'

export default async function RankingTrendPage() {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')

  const db = createAdminClient()
  const testIds = await getRankingExcludedIds()
  const dataset = await buildRankingDataset(db, testIds, new Date())

  return (
    <>
      <TopBar title="スキル習得の推移" />
      <div className="p-4 max-w-lg mx-auto">
        <RankingNav active="trend" />
        <p className="text-sm text-gray-600 mb-3">
          📈 個人・所属ごとのスキル習得数を、月ごとの折れ線グラフで見られます
        </p>
        <Card>
          <CardContent className="py-3 px-3">
            <TrendExplorer dataset={dataset} currentEmployeeId={me.id} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
