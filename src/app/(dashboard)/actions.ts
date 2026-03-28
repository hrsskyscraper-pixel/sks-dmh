'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VIEW_AS_COOKIE } from '@/lib/view-as'

export async function setViewAs(employeeId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!currentEmployee || !['manager', 'admin', 'ops_manager', 'testuser'].includes(currentEmployee.role)) return

  const cookieStore = await cookies()
  cookieStore.set(VIEW_AS_COOKIE, employeeId, { path: '/' })
  redirect('/')
}

export async function clearViewAs() {
  const cookieStore = await cookies()
  cookieStore.delete(VIEW_AS_COOKIE)
  redirect('/')
}

export async function updateSkillCategory(skillId: string, newCategory: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  const { data: emp } = await supabase
    .from('employees')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (!emp || !['admin', 'ops_manager', 'testuser'].includes(emp.role)) {
    return { error: '権限がありません' }
  }

  const adminDb = createAdminClient()
  const { error } = await adminDb
    .from('skills')
    .update({ category: newCategory })
    .eq('id', skillId)

  if (error) return { error: error.message }
  return {}
}
