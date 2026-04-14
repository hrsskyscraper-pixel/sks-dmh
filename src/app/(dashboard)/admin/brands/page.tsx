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
    db.from('teams').select('id, name, type, brand_id, brand_ids, prefecture').in('type', ['store', 'department']).order('type').order('name'),
    db.from('manual_library').select('id, brand_ids').eq('archived', false),
  ])

  const stores = (teams ?? []).filter(t => t.type === 'store')
  const departments = (teams ?? []).filter(t => t.type === 'department')

  const stats: Record<string, { stores: number; departments: number; manuals: number }> = {}
  for (const b of brands ?? []) stats[b.id] = { stores: 0, departments: 0, manuals: 0 }
  for (const s of stores) if (s.brand_id && stats[s.brand_id]) stats[s.brand_id].stores++
  for (const d of departments) {
    for (const bid of d.brand_ids ?? []) {
      if (stats[bid]) stats[bid].departments++
    }
  }
  for (const m of manuals ?? []) {
    for (const bid of m.brand_ids ?? []) {
      if (stats[bid]) stats[bid].manuals++
    }
  }
  const storesWithoutBrand = stores.filter(s => !s.brand_id).length
  const manualsWithoutBrand = (manuals ?? []).filter(m => (m.brand_ids ?? []).length === 0).length

  return (
    <>
      <TopBar title="ブランド・店舗・部署管理" />
      <BrandManager
        brands={brands ?? []}
        stores={stores as { id: string; name: string; brand_id: string | null; brand_ids: string[]; prefecture: string | null }[]}
        departments={departments as { id: string; name: string; brand_ids: string[] }[]}
        stats={stats}
        storesWithoutBrand={storesWithoutBrand}
        manualsWithoutBrand={manualsWithoutBrand}
      />
    </>
  )
}
