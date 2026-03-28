import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { BottomNav } from '@/components/layout/nav'
import { Toaster } from '@/components/ui/sonner'
import { ViewAsBanner } from '@/components/layout/view-as-banner'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { createAdminClient } from '@/lib/supabase/admin'
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
        .select('id, name, email, role, employment_type, hire_date, avatar_url, instagram_url, auth_user_id, created_at, updated_at')
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

  // viewAs社員取得と未読件数を並列実行
  const db = role === 'testuser' ? createAdminClient() : supabase
  const [viewAsResult, unreadResult] = await Promise.all([
    viewAsId
      ? db.from('employees').select('name, role').eq('id', viewAsId).single()
      : Promise.resolve({ data: null }),
    role === 'manager' && employee
      ? supabase.from('team_change_requests').select('*', { count: 'exact', head: true })
          .eq('requested_by', employee.id).in('status', ['approved', 'rejected']).is('applicant_read_at', null)
      : Promise.resolve({ count: 0 }),
  ])
  const viewAsEmployee = viewAsResult.data
  const unreadRequestCount = (unreadResult as { count: number | null }).count ?? 0

  // BottomNav は viewAs 社員のロールで表示を切り替える
  const effectiveRole: Role = (viewAsEmployee?.role as Role | undefined) ?? role

  return (
    <div className="min-h-screen bg-gray-50" style={viewAsEmployee ? { '--banner-h': '2.5rem' } as React.CSSProperties : undefined}>
      {viewAsEmployee && <ViewAsBanner employeeName={viewAsEmployee.name} />}
      <main className="pb-20 max-w-2xl mx-auto">
        {children}
      </main>
      <BottomNav role={effectiveRole} unreadRequestCount={unreadRequestCount} />
      <Toaster position="top-center" richColors />
    </div>
  )
}
