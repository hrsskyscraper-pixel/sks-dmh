import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/layout/nav'
import { Toaster } from '@/components/ui/sonner'
import type { Database, Role } from '@/types/database'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('auth_user_id', user.id)
    .single()

  // 初回ログイン時: employeesレコードがなければ自動作成（role=employee）
  if (!employee) {
    const insertData: Database['public']['Tables']['employees']['Insert'] = {
      auth_user_id: user.id,
      name: (user.user_metadata.full_name as string | undefined) ?? user.email ?? '未設定',
      email: user.email ?? '',
      role: 'employee',
    }
    await supabase.from('employees').insert(insertData)
  }

  const role: Role = (employee?.role as Role | undefined) ?? 'employee'

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="pb-20 max-w-2xl mx-auto">
        {children}
      </main>
      <BottomNav role={role} />
      <Toaster position="top-center" richColors />
    </div>
  )
}
