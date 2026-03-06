import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  // 初回ログイン時: employeesレコードがなければ自動作成（role=testuser）
  if (!employee) {
    const adminDb = createAdminClient()
    const insertData: Database['public']['Tables']['employees']['Insert'] = {
      auth_user_id: user.id,
      name: (user.user_metadata.full_name as string | undefined) ?? user.email ?? '未設定',
      email: user.email ?? '',
      role: 'testuser',
      employment_type: '社員',
    }
    const { error: insertError } = await adminDb.from('employees').insert(insertData)
    if (!insertError) {
      // RLS を回避するため admin client で再取得
      const { data: created } = await adminDb
        .from('employees')
        .select('*')
        .eq('auth_user_id', user.id)
        .single()
      employee = created
    } else {
      await supabase.auth.signOut()
      redirect(`/login?error=${encodeURIComponent(insertError.message)}`)
    }
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

  let viewAsEmployee = null
  if (viewAsId) {
    const db = role === 'testuser' ? createAdminClient() : supabase
    const { data } = await db
      .from('employees')
      .select('name, role')
      .eq('id', viewAsId)
      .single()
    viewAsEmployee = data
  }

  // BottomNav は viewAs 社員のロールで表示を切り替える
  const effectiveRole: Role = (viewAsEmployee?.role as Role | undefined) ?? role

  // マネージャーのみ: 未読の申請結果（approved/rejected）件数を取得
  let unreadRequestCount = 0
  if (role === 'manager' && employee) {
    const { count } = await supabase
      .from('team_change_requests')
      .select('*', { count: 'exact', head: true })
      .eq('requested_by', employee.id)
      .in('status', ['approved', 'rejected'])
      .is('applicant_read_at', null)
    unreadRequestCount = count ?? 0
  }

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
