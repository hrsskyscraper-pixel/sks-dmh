import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { EmployeeManager } from '@/components/admin/employee-manager'

export default async function EmployeesPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee || currentEmployee.role !== 'admin') {
    redirect('/')
  }

  const { data: employees } = await supabase
    .from('employees')
    .select('*')
    .order('created_at')

  return (
    <>
      <TopBar title="社員管理" />
      <EmployeeManager employees={employees ?? []} />
    </>
  )
}
