import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { TimelineFeed } from '@/components/timeline/timeline-feed'

export default async function TimelinePage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const db = currentEmployee.role === 'testuser' ? createAdminClient() : await createClient()

  const [
    { data: certifiedAchievements },
    { data: comments },
    { data: reactions },
    { data: employees },
  ] = await Promise.all([
    db.from('achievements')
      .select('id, employee_id, skill_id, certified_at, certified_by, skills(name, category)')
      .eq('status', 'certified')
      .not('certified_at', 'is', null)
      .order('certified_at', { ascending: false })
      .limit(50),
    db.from('achievement_comments')
      .select('id, achievement_id, employee_id, content, created_at')
      .order('created_at'),
    db.from('achievement_reactions')
      .select('id, achievement_id, employee_id, emoji'),
    db.from('employees')
      .select('id, name, avatar_url')
      .order('name'),
  ])

  const employeeMap = Object.fromEntries(
    (employees ?? []).map(e => [e.id, e])
  )

  return (
    <>
      <TopBar title="タイムライン" />
      <TimelineFeed
        achievements={certifiedAchievements ?? []}
        comments={comments ?? []}
        reactions={reactions ?? []}
        employeeMap={employeeMap}
        currentEmployeeId={currentEmployee.id}
      />
    </>
  )
}
