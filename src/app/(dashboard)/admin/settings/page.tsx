import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { MilestoneSettings } from '@/components/admin/milestone-settings'
import type { Phase, EmploymentType } from '@/types/database'

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee || !['admin', 'ops_manager'].includes(currentEmployee.role)) {
    redirect('/')
  }

  const { data: milestones } = await supabase
    .from('phase_milestones')
    .select('phase, employment_type, end_hours')
    .order('employment_type')
    .order('phase')

  const rows = (milestones ?? []) as { phase: Phase; employment_type: EmploymentType; end_hours: number }[]

  return (
    <>
      <TopBar title="設定" />
      <MilestoneSettings initialMilestones={rows} />
    </>
  )
}
