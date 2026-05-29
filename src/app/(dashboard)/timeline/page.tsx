import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { TimelineFeed } from '@/components/timeline/timeline-feed'
import { getTestEmployeeIds } from '@/lib/test-data'

export default async function TimelinePage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const db = createAdminClient()

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

  // テスト社員の投稿・反応・コメントは除外
  const testEmpIds = await getTestEmployeeIds()
  const visibleAchievements = (certifiedAchievements ?? []).filter(a => !testEmpIds.has(a.employee_id))
  const visibleComments = (comments ?? []).filter(c => !testEmpIds.has(c.employee_id))
  const visibleReactions = (reactions ?? []).filter(r => !testEmpIds.has(r.employee_id))

  const employeeMap = Object.fromEntries(
    (employees ?? []).filter(e => !testEmpIds.has(e.id)).map(e => [e.id, e])
  )

  return (
    <>
      <TopBar title="タイムライン" />
      <TimelineFeed
        achievements={visibleAchievements}
        comments={visibleComments}
        reactions={visibleReactions}
        employeeMap={employeeMap}
        currentEmployeeId={currentEmployee.id}
      />
    </>
  )
}
