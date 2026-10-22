export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { StoreFollowList, type StoreFollowGroup } from '@/components/store-follows/store-follow-list'

/**
 * 級の取得を知らせてほしい店舗（2026-10-22 原島さん確定 A-5「見たい店舗が選べるのは全員」）。
 * 所属店舗は既定で知らせる。ほかの店舗は選んだものだけ。届くのは LINE（友だち追加済みの方）。
 * ご本人の設定なので、view-as 中でもログインしている本人の設定を出す。
 */
export default async function StoreFollowsPage() {
  const me = await getRealEmployee()
  if (!me) redirect('/login')

  const db = createAdminClient()
  const [{ data: stores }, { data: brands }, { data: mine }, { data: prefs }] = await Promise.all([
    db.from('teams').select('id, name, brand_id').eq('type', 'store').eq('is_test', false).order('name'),
    db.from('brands').select('id, name, sort_order').order('sort_order'),
    db.from('team_members').select('team_id').eq('employee_id', me.id),
    db.from('store_follows').select('team_id, mode').eq('employee_id', me.id),
  ])
  const memberOf = new Set((mine ?? []).map(m => m.team_id))
  const modeOf = Object.fromEntries((prefs ?? []).map(p => [p.team_id, p.mode]))

  const groups: StoreFollowGroup[] = []
  const byBrand = new Map<string, StoreFollowGroup>()
  for (const b of brands ?? []) {
    const g = { name: b.name, stores: [] as StoreFollowGroup['stores'] }
    byBrand.set(b.id, g); groups.push(g)
  }
  const others: StoreFollowGroup = { name: 'そのほか', stores: [] }
  for (const s of stores ?? []) {
    const isMember = memberOf.has(s.id)
    const on = isMember ? modeOf[s.id] !== 'mute' : modeOf[s.id] === 'follow'
    ;(byBrand.get(s.brand_id ?? '') ?? others).stores.push({ id: s.id, name: s.name, isMember, on })
  }
  if (others.stores.length > 0) groups.push(others)

  return (
    <>
      <TopBar title="級の取得のお知らせ" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <p className="text-sm text-gray-600 leading-relaxed">
          選んだ店舗で誰かが<strong>級を取得</strong>したら、LINE でお知らせします。所属している店舗は、はじめから「知らせる」になっています。
        </p>
        {!me.line_friend && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
            LINE とつながっていないため、いまは届きません。ホームの「LINE連携」から公式アカウントを友だちに追加すると届くようになります。
          </p>
        )}
        <StoreFollowList groups={groups.filter(g => g.stores.length > 0)} />
        <p className="text-[11px] text-gray-400 leading-relaxed">
          LINE の無料枠（月200通）を超えないよう、月の上限に近づくと自動で LINE を止め、アプリ内のお知らせだけになります。
        </p>
      </div>
    </>
  )
}
