import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { TopBar } from '@/components/layout/nav'
import { NotificationList } from '@/components/notifications/notification-list'
import { VIEW_AS_COOKIE } from '@/lib/view-as'

export default async function NotificationsPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  // view-as対応: 対象社員を特定
  const cookieStore = await cookies()
  const canViewAs = true // 全ロールでView-as可能（閲覧のみ）
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  // view-as中またはtestuserはRLS回避のためadmin clientを使用
  const db = (viewAsId || currentEmployee.role === 'testuser') ? createAdminClient() : await createClient()

  let targetEmployee = currentEmployee
  if (viewAsId) {
    const { data } = await db.from('employees')
      .select('id, role, system_permission, notifications_read_at')
      .eq('id', viewAsId)
      .single()
    if (data) targetEmployee = { ...currentEmployee, ...data }
  }

  const targetId = targetEmployee.id

  // 対象社員のachievementのID一覧
  const { data: myAchievements } = await db
    .from('achievements')
    .select('id, skill_id, status, certified_at, certify_comment, skills(name)')
    .eq('employee_id', targetId)

  const myAchievementIds = (myAchievements ?? []).map(a => a.id)

  // 対象社員のachievementに対するリアクション・コメント、および自分宛の結果通知
  const [
    { data: reactions },
    { data: comments },
    { data: employees },
    { data: myAchievementResults },
    { data: myTeamRequestResults },
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
    // 自分のスキル認定結果（認定・差戻）
    myAchievementIds.length > 0
      ? db.from('achievement_history')
          .select('id, achievement_id, action, actor_id, comment, created_at')
          .in('achievement_id', myAchievementIds)
          .in('action', ['certify', 'reject'])
          .order('created_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as { id: string; achievement_id: string; action: 'certify' | 'reject'; actor_id: string; comment: string | null; created_at: string }[] }),
    // 自分のチーム変更申請の承認・差戻結果
    db.from('team_change_requests')
      .select('id, request_type, team_id, reviewed_by, reviewed_at, review_comment, status, payload')
      .eq('requested_by', targetId)
      .in('status', ['approved', 'rejected'])
      .order('reviewed_at', { ascending: false })
      .limit(20),
  ])

  const employeeMap = Object.fromEntries(
    (employees ?? []).map(e => [e.id, e])
  )

  const achievementMap = Object.fromEntries(
    (myAchievements ?? []).map(a => [a.id, a])
  )

  // 通知ページを開いた時点で既読タイムスタンプを更新（ベルバッジを消す）
  const adminDb = createAdminClient()
  const targetIdForRead = viewAsId ?? currentEmployee.id
  await adminDb.from('employees')
    .update({ notifications_read_at: new Date().toISOString() })
    .eq('id', targetIdForRead)
  // 他ページのベルバッジを更新するためキャッシュ無効化
  revalidatePath('/', 'layout')

  return (
    <>
      <TopBar title="お知らせ" hideNotificationBell />
      <NotificationList
        reactions={reactions ?? []}
        comments={comments ?? []}
        achievementMap={achievementMap}
        employeeMap={employeeMap}
        myAchievementResults={myAchievementResults ?? []}
        myTeamRequestResults={myTeamRequestResults ?? []}
        notificationsReadAt={targetEmployee.notifications_read_at}
      />
    </>
  )
}
