import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { BottomNav } from '@/components/layout/nav'
import { Toaster } from '@/components/ui/sonner'
import { ViewAsBanner } from '@/components/layout/view-as-banner'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { createAdminClient } from '@/lib/supabase/admin'
import { NotificationCountProvider } from '@/components/layout/notification-context'
import type { Database, Role } from '@/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  let employee = await getCurrentEmployee()

  // 初回ログイン時: employeesレコードがなければ自動作成（role=testuser）
  if (!employee) {
    const adminDb = createAdminClient()
    const insertData: Database['public']['Tables']['employees']['Insert'] = {
      auth_user_id: user.id,
      name: (user.user_metadata.full_name as string | undefined) ?? user.email ?? '未設定',
      email: user.email ?? '',
      role: 'testuser',
      employment_type: '社員',
      avatar_url: (user.user_metadata.avatar_url as string | undefined) ?? null,
    }
    const { error: insertError } = await adminDb.from('employees').insert(insertData)
    if (!insertError) {
      // RLS を回避するため admin client で再取得
      const { data: created } = await adminDb
        .from('employees')
        .select('id, name, email, role, employment_type, hire_date, avatar_url, instagram_url, notifications_read_at, auth_user_id, created_at, updated_at')
        .eq('auth_user_id', user.id)
        .single()
      employee = created
    } else {
      await supabase.auth.signOut()
      redirect(`/login?error=${encodeURIComponent(insertError.message)}`)
    }
  }

  // 既存ユーザーでavatar_url未設定の場合、Googleの写真を自動設定
  if (employee && !employee.avatar_url && user.user_metadata.avatar_url) {
    const adminDb = createAdminClient()
    const googleAvatar = user.user_metadata.avatar_url as string
    await adminDb.from('employees').update({ avatar_url: googleAvatar }).eq('id', employee.id)
    employee = { ...employee, avatar_url: googleAvatar }
  }

  // それでも取得できなければサインアウトしてリダイレクト（ループ防止）
  if (!employee) {
    await supabase.auth.signOut()
    redirect('/login?error=employee_fetch_failed')
  }

  const role: Role = employee.role as Role

  // viewAs Cookie の処理（manager/admin のみ有効）
  const cookieStore = await cookies()
  const canViewAs = role === 'manager' || role === 'admin' || role === 'ops_manager' || role === 'testuser'
  const viewAsId = canViewAs ? (cookieStore.get(VIEW_AS_COOKIE)?.value ?? null) : null

  // viewAs社員取得
  const db = role === 'testuser' ? createAdminClient() : supabase
  const { data: viewAsEmployee } = viewAsId
    ? await db.from('employees').select('name, role, notifications_read_at').eq('id', viewAsId).single()
    : { data: null }

  // 通知数は view-as 対象社員（なければ自分）で計算
  const notifTargetId = viewAsId ?? employee.id
  const notifReadAt = (viewAsId ? viewAsEmployee?.notifications_read_at : employee.notifications_read_at) ?? '1970-01-01T00:00:00Z'

  const { data: targetAchievements } = await db
    .from('achievements')
    .select('id')
    .eq('employee_id', notifTargetId)
    .eq('status', 'certified')
  const targetAchIds = (targetAchievements ?? []).map(a => a.id)

  const [unreadResult, reactionsCount, commentsCount] = await Promise.all([
    role === 'manager' && employee
      ? supabase.from('team_change_requests').select('*', { count: 'exact', head: true })
          .eq('requested_by', employee.id).in('status', ['approved', 'rejected']).is('applicant_read_at', null)
      : Promise.resolve({ count: 0 }),
    targetAchIds.length > 0
      ? db.from('achievement_reactions').select('*', { count: 'exact', head: true })
          .in('achievement_id', targetAchIds).neq('employee_id', notifTargetId).gt('created_at', notifReadAt)
      : Promise.resolve({ count: 0 }),
    targetAchIds.length > 0
      ? db.from('achievement_comments').select('*', { count: 'exact', head: true })
          .in('achievement_id', targetAchIds).neq('employee_id', notifTargetId).gt('created_at', notifReadAt)
      : Promise.resolve({ count: 0 }),
  ])
  const unreadRequestCount = (unreadResult as { count: number | null }).count ?? 0
  const unreadNotifCount = ((reactionsCount as { count: number | null }).count ?? 0)
    + ((commentsCount as { count: number | null }).count ?? 0)

  // BottomNav は viewAs 社員のロールで表示を切り替える
  const effectiveRole: Role = (viewAsEmployee?.role as Role | undefined) ?? role

  return (
    <NotificationCountProvider count={unreadNotifCount}>
      <div className="min-h-screen bg-gray-50" style={viewAsEmployee ? { '--banner-h': '2.5rem' } as React.CSSProperties : undefined}>
        {viewAsEmployee && <ViewAsBanner employeeName={viewAsEmployee.name} />}
        <main className="pb-20 max-w-2xl mx-auto">
          {children}
        </main>
        <BottomNav role={effectiveRole} unreadRequestCount={unreadRequestCount} />
        <Toaster position="top-center" richColors />
      </div>
    </NotificationCountProvider>
  )
}
