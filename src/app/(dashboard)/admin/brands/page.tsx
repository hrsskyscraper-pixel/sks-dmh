import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { BrandManager } from '@/components/admin/brand-manager'
import type { Role } from '@/types/database'

const ADMIN_ROLES: Role[] = ['admin', 'ops_manager', 'executive', 'testuser']

export default async function BrandsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')
  if (!ADMIN_ROLES.includes(currentEmployee.role as Role)) redirect('/')

  const db = createAdminClient()
  const [
    { data: brands },
    { data: teams },
    { data: manuals },
  ] = await Promise.all([
    db.from('brands').select('*').order('sort_order'),
    db.from('teams').select('id, name, type, brand_id').eq('type', 'store').order('name'),
    db.from('manual_library').select('id, brand_ids').eq('archived', false),
  ])

  // 各ブランドの店舗数・マニュアル数を集計
  const stats: Record<string, { stores: number; manuals: number }> = {}
  for (const b of brands ?? []) stats[b.id] = { stores: 0, manuals: 0 }
  for (const t of teams ?? []) if (t.brand_id) stats[t.brand_id] = { ...stats[t.brand_id], stores: (stats[t.brand_id]?.stores ?? 0) + 1 }
  for (const m of manuals ?? []) {
    for (const bid of m.brand_ids ?? []) {
      if (stats[bid]) stats[bid].manuals++
    }
  }
  const storesWithoutBrand = (teams ?? []).filter(t => !t.brand_id).length
  const manualsWithoutBrand = (manuals ?? []).filter(m => (m.brand_ids ?? []).length === 0).length

  return (
    <>
      <TopBar title="ブランド管理" />
      <BrandManager
        brands={brands ?? []}
        stores={(teams ?? []) as { id: string; name: string; brand_id: string | null }[]}
        stats={stats}
        storesWithoutBrand={storesWithoutBrand}
        manualsWithoutBrand={manualsWithoutBrand}
      />
    </>
  )
}
