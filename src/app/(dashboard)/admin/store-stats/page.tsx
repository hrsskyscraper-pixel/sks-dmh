export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { buildStoreStats } from '@/lib/store-stats'
import { TopBar } from '@/components/layout/nav'
import { StoreStatsView } from '@/components/admin/store-stats-view'

export default async function StoreStatsPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect('/login')

  // 権限が無い場合は redirect せず画面内で理由を出す（soft-nav 中の redirect はクライアント例外になるため）
  if (!canAdminister(employee)) {
    return (
      <>
        <TopBar title="店舗別スキル状況" />
        <div className="px-4 py-10 max-w-md mx-auto text-center space-y-4">
          <p className="text-base font-bold text-gray-800">閲覧権限がありません</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            この画面は管理者（運用管理者・開発者）のみが閲覧できます。
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium"
          >
            ホームに戻る
          </Link>
        </div>
      </>
    )
  }

  const stats = await buildStoreStats()

  return (
    <>
      <TopBar title="店舗別スキル状況" />
      <div className="p-4 max-w-lg mx-auto space-y-3">
        <p className="text-sm text-gray-600">
          🏬 全店舗の「対象従業員数・スキル申請人数・承認済み人数・未申請人数・未承認件数」を一覧で確認できます。
          行をタップすると、その所属のメンバー別の内訳が開きます。
        </p>
        <StoreStatsView stats={stats} />
      </div>
    </>
  )
}
