import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { NotificationList } from '@/components/notifications/notification-list'

export default async function NotificationsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const db = currentEmployee.role === 'testuser' ? createAdminClient() : await createClient()

  // 自分のachievementのID一覧
  const { data: myAchievements } = await db
    .from('achievements')
    .select('id, skill_id, status, certified_at, certify_comment, skills(name)')
    .eq('employee_id', currentEmployee.id)

  const myAchievementIds = (myAchievements ?? []).map(a => a.id)

  // 自分のachievementに対するリアクション・コメント
  const [
    { data: reactions },
    { data: comments },
    { data: employees },
    { data: pendingForMe },
  ] = await Promise.all([
    myAchievementIds.length > 0
      ? db.from('achievement_reactions')
          .select('id, achievement_id, employee_id, emoji, created_at')
          .in('achievement_id', myAchievementIds)
          .neq('employee_id', currentEmployee.id)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as { id: string; achievement_id: string; employee_id: string; emoji: string; created_at: string }[] }),
    myAchievementIds.length > 0
      ? db.from('achievement_comments')
          .select('id, achievement_id, employee_id, content, created_at')
          .in('achievement_id', myAchievementIds)
          .neq('employee_id', currentEmployee.id)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as { id: string; achievement_id: string; employee_id: string; content: string; created_at: string }[] }),
    db.from('employees').select('id, name, avatar_url').order('name'),
    // マネージャー向け: 承認待ちの申請
    ['manager', 'admin', 'ops_manager'].includes(currentEmployee.role)
      ? db.from('achievements')
          .select('id, employee_id, skill_id, status, achieved_at, skills(name)')
          .eq('status', 'pending')
          .order('achieved_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ])

  const employeeMap = Object.fromEntries(
    (employees ?? []).map(e => [e.id, e])
  )

  const achievementMap = Object.fromEntries(
    (myAchievements ?? []).map(a => [a.id, a])
  )

  // 通知既読マークをServer Actionで更新
  const adminDb = createAdminClient()
  await adminDb.from('employees')
    .update({ notifications_read_at: new Date().toISOString() })
    .eq('id', currentEmployee.id)

  return (
    <>
      <TopBar title="お知らせ" />
      <NotificationList
        reactions={reactions ?? []}
        comments={comments ?? []}
        achievementMap={achievementMap}
        employeeMap={employeeMap}
        pendingForMe={pendingForMe ?? []}
        currentRole={currentEmployee.role}
        notificationsReadAt={currentEmployee.notifications_read_at}
      />
    </>
  )
}
