import { redirect } from 'next/navigation'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { ColleaguesSection } from '@/components/admin/colleagues-section'

// 「仲間」一覧ページ（フッターからは削除済みだが、後方互換・直リンク用に残す）。
// 実体は ColleaguesSection（Myキャリア内の「仲間」カードと共通）。
export default async function EmployeesPage() {
  const currentEmployee = await getCurrentEmployee()
  if (!currentEmployee) redirect('/login')

  return <ColleaguesSection embedded={false} />
}
