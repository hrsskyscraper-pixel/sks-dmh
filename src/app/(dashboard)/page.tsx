import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { DashboardContent } from '@/components/dashboard/dashboard-content'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  // 全スキル取得
  const { data: skills } = await supabase
    .from('skills')
    .select('*')
    .order('order_index')

  // 自分のachievements取得
  const { data: achievements } = await supabase
    .from('achievements')
    .select('*, skills(*)')
    .eq('employee_id', employee.id)

  // 累計労働時間取得
  const { data: workHoursSum } = await supabase
    .rpc('get_employee_cumulative_hours', {
      p_employee_id: employee.id,
      p_as_of_date: new Date().toISOString().split('T')[0],
    })

  return (
    <>
      <TopBar
        title="できました表"
        right={
          <div className="text-right">
            <p className="text-xs text-muted-foreground">累計勤務時間</p>
            <p className="text-base font-bold text-orange-500">
              {workHoursSum ?? 0}h
            </p>
          </div>
        }
      />
      <DashboardContent
        employee={employee}
        skills={skills ?? []}
        achievements={achievements ?? []}
        cumulativeHours={workHoursSum ?? 0}
      />
    </>
  )
}
