import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { CsvImport } from '@/components/admin/csv-import'

export default async function CsvImportPage() {
  const employee = await getCurrentEmployee()
  if (!employee || !['store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'].includes(employee.role)) {
    redirect('/')
  }

  const supabase = await createClient()
  const db = employee.role === 'testuser' ? createAdminClient() : supabase
  const { data: employees } = await db
    .from('employees')
    .select('id, name, email')
    .order('name')

  return (
    <>
      <TopBar title="労働時間 CSV取込" />
      <CsvImport employees={employees ?? []} />
    </>
  )
}
