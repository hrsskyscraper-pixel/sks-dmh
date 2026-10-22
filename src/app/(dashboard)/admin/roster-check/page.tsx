export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminister } from '@/lib/permissions'
import { getTestEmployeeIds } from '@/lib/test-data'
import { getRosterCheck } from '@/lib/roster-affiliation'
import { TopBar } from '@/components/layout/nav'
import { RosterCheckView } from '@/components/admin/roster-check'

/** 名簿の店舗部署と、Mission Board の所属が違う人の一覧（2026-10-19 B-⑥）。運用管理者・開発者のみ */
export default async function RosterCheckPage() {
  const employee = await getCurrentEmployee()
  if (!employee) redirect('/login')

  // 権限が無い場合は redirect せず画面内で理由を出す（soft-nav 中の redirect はクライアント例外になるため）
  if (!canAdminister(employee)) {
    return (
      <>
        <TopBar title="名簿と所属の違い" />
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

  const check = await getRosterCheck(createAdminClient(), await getTestEmployeeIds())

  return (
    <>
      <TopBar title="名簿と所属の違い" />
      <RosterCheckView check={check} />
    </>
  )
}
