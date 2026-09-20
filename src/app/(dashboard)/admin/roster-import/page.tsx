export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { canAdminister } from '@/lib/permissions'
import { RosterImport } from '@/components/admin/roster-import'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

/** 名簿の一括取込（入社日・退職日・雇用区分）。システム管理者のみ */
export default async function RosterImportPage() {
  const employee = await getCurrentEmployee()
  if (!employee || !canAdminister(employee)) redirect('/')

  const db = createAdminClient()
  const employees = await fetchAllRows<{ id: string; name: string; name_kana: string | null; email: string; hire_date: string | null; left_at?: string | null; employment_type: string; status: string }>((from, to) =>
    db.from('employees').select('id, name, name_kana, email, hire_date, left_at, employment_type, status').order('id').range(from, to))

  return (
    <>
      <TopBar title="名簿の一括取込" />
      <RosterImport employees={employees.map(e => ({ ...e, left_at: e.left_at ?? null }))} />
    </>
  )
}
