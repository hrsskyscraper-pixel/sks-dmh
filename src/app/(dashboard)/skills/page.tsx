import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TopBar } from '@/components/layout/nav'
import { SkillList } from '@/components/skills/skill-list'

export default async function SkillsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  if (!employee) redirect('/login')

  const { data: skills } = await supabase
    .from('skills')
    .select('*')
    .order('phase')
    .order('order_index')

  const { data: achievements } = await supabase
    .from('achievements')
    .select('*')
    .eq('employee_id', employee.id)

  return (
    <>
      <TopBar title="スキルチェックリスト" />
      <SkillList
        employeeId={employee.id}
        skills={skills ?? []}
        achievements={achievements ?? []}
      />
    </>
  )
}
