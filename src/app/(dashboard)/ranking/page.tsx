export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRankingExcludedIds } from '@/lib/test-data'
import { buildRankingDataset } from '@/lib/ranking-data'
import { RankingExplorer } from '@/components/dashboard/ranking-explorer'
import { TopBar } from '@/components/layout/nav'
import { Card, CardContent } from '@/components/ui/card'

export default async function RankingPage({ searchParams }: { searchParams?: Promise<{ month?: string }> }) {
  const me = await getCurrentEmployee()
  if (!me) redirect('/login')
  const params = (await (searchParams ?? Promise.resolve({}))) as { month?: string }
  // お知らせ等から /ranking?month=YYYY-MM で来たら、その月を初期表示にする
  const initialPeriodKey = params?.month && /^\d{4}-\d{2}$/.test(params.month) ? params.month : undefined

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
            <RankingExplorer dataset={dataset} currentEmployeeId={me.id} initialPeriodKey={initialPeriodKey} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
