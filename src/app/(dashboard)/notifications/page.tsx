import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { NotificationList } from '@/components/notifications/notification-list'
import { VIEW_AS_COOKIE } from '@/lib/view-as'

export default async function NotificationsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  const db = currentEmployee.role === 'testuser' ? createAdminClient() : await createClient()

  // view-as対応: 対象社員を特定
  const cookieStore = await cookies()
  const canViewAs = ['manager', 'admin', 'ops_manager', 'testuser'].includes(currentEmployee.role)
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  let targetEmployee = currentEmployee
  if (viewAsId) {
    const { data } = await db.from('employees')
      .select('id, role, notifications_read_at')
      .eq('id', viewAsId)
      .single()
    if (data) targetEmployee = { ...currentEmployee, ...data }
  }

  const targetId = targetEmployee.id
  const targetRole = targetEmployee.role

  // 対象社員のachievementのID一覧
  const { data: myAchievements } = await db
    .from('achievements')
    .select('id, skill_id, status, certified_at, certify_comment, skills(name)')
    .eq('employee_id', targetId)

  const myAchievementIds = (myAchievements ?? []).map(a => a.id)

  // 対象社員のachievementに対するリアクション・コメント
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
          .neq('employee_id', targetId)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as { id: string; achievement_id: string; employee_id: string; emoji: string; created_at: string }[] }),
    myAchievementIds.length > 0
      ? db.from('achievement_comments')
          .select('id, achievement_id, employee_id, content, created_at')
          .in('achievement_id', myAchievementIds)
          .neq('employee_id', targetId)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] as { id: string; achievement_id: string; employee_id: string; content: string; created_at: string }[] }),
    db.from('employees').select('id, name, avatar_url').order('name'),
    // マネージャー向け: 自分のチームの承認待ち申請のみ
    ['manager'].includes(targetRole)
      ? (async () => {
          const { data: teamRows } = await db.from('team_managers').select('team_id').eq('employee_id', targetId)
          const teamIds = (teamRows ?? []).map(r => r.team_id)
          if (!teamIds.length) return { data: [] }
          const { data: members } = await db.from('team_members').select('employee_id').in('team_id', teamIds)
          const memberIds = (members ?? []).map(r => r.employee_id)
          if (!memberIds.length) return { data: [] }
          return db.from('achievements')
            .select('id, employee_id, skill_id, status, achieved_at, skills(name)')
            .eq('status', 'pending')
            .in('employee_id', memberIds)
            .order('achieved_at', { ascending: false })
            .limit(20)
        })()
      : ['admin', 'ops_manager'].includes(targetRole)
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

  // 通知ページを開いた時点で既読タイムスタンプを更新（ベルバッジを消す）
  if (!viewAsId) {
    const adminDb = createAdminClient()
    await adminDb.from('employees')
      .update({ notifications_read_at: new Date().toISOString() })
      .eq('id', currentEmployee.id)
  } else {
    const adminDb = createAdminClient()
    await adminDb.from('employees')
      .update({ notifications_read_at: new Date().toISOString() })
      .eq('id', viewAsId)
  }

  return (
    <>
      <TopBar title="お知らせ" hideNotificationBell />
      <NotificationList
        reactions={reactions ?? []}
        comments={comments ?? []}
        achievementMap={achievementMap}
        employeeMap={employeeMap}
        pendingForMe={pendingForMe ?? []}
        currentRole={targetRole}
        notificationsReadAt={targetEmployee.notifications_read_at}
      />
    </>
  )
}
