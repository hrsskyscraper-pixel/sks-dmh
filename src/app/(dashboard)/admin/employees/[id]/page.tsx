import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { EmployeeCareerCard } from '@/components/admin/employee-career-card'

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')
  if (!['manager', 'admin', 'ops_manager', 'testuser'].includes(currentEmployee.role)) redirect('/')

  const { id } = await params
  const db = createAdminClient()

  const [
    { data: employee },
    { data: careerRecords },
    { data: allEmployees },
  ] = await Promise.all([
    db.from('employees').select('id, name, email, role, employment_type, hire_date, avatar_url').eq('id', id).single(),
    db.from('career_records').select('*').eq('employee_id', id).order('occurred_at', { ascending: false }),
    db.from('employees').select('id, name, avatar_url').order('name'),
  ])

  if (!employee) redirect('/admin/employees')

  const employeeMap = Object.fromEntries((allEmployees ?? []).map(e => [e.id, e]))

  return (
    <>
      <TopBar title="社員カルテ" />
      <EmployeeCareerCard
        employee={employee}
        careerRecords={careerRecords ?? []}
        employeeMap={employeeMap}
        allEmployees={allEmployees ?? []}
      />
    </>
  )
}
