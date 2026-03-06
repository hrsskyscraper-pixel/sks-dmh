import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TopBar } from '@/components/layout/nav'
import { CsvImport } from '@/components/admin/csv-import'

export default async function CsvImportPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee || !['manager', 'admin', 'ops_manager', 'testuser'].includes(employee.role)) {
    redirect('/')
  }

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
