export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRankingExcludedIds } from '@/lib/test-data'
import { buildRankingDataset } from '@/lib/ranking-data'
import { RankingExplorer } from '@/components/dashboard/ranking-explorer'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'

export default async function RankingPage() {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')

  const db = createAdminClient()
  const testIds = await getRankingExcludedIds()
  const dataset = await buildRankingDataset(db, testIds, new Date())

  return (
    <>
      <TopBar title="スキル習得ランキング" />
      <div className="p-4 max-w-lg mx-auto">
        <p className="text-sm text-gray-600 mb-3">
          🏆 期間・個人別／所属別・前月対比を切り替えて、全社のスキル習得数を見られます
        </p>
        <Card>
          <CardContent className="py-3 px-3">
            <RankingExplorer dataset={dataset} currentEmployeeId={me.id} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
