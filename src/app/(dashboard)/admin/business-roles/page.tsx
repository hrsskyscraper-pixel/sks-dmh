import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { TopBar } from '@/components/layout/nav'
import { BusinessRoleManager } from '@/components/admin/business-role-manager'
import { getTestEmployeeIds } from '@/lib/test-data'

export default async function BusinessRolesPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')
  if (!canAdminister(currentEmployee)) redirect('/')

  const db = createAdminClient()
  const [
    { data: businessRoles },
    { data: employees },
  ] = await Promise.all([
    db.from('business_roles').select('*').order('sort_order'),
    db.from('employees').select('id, business_role_ids'),
  ])

  // 利用数はテスト社員を除外
  const testEmpIds = await getTestEmployeeIds()
  const usageCount: Record<string, number> = {}
  for (const br of businessRoles ?? []) usageCount[br.id] = 0
  for (const emp of employees ?? []) {
    if (testEmpIds.has(emp.id)) continue
    for (const id of emp.business_role_ids ?? []) {
      if (usageCount[id] !== undefined) usageCount[id]++
    }
  }

  return (
    <>
      <TopBar title="業務役職マスタ" />
      <BusinessRoleManager businessRoles={businessRoles ?? []} usageCount={usageCount} />
    </>
  )
}
