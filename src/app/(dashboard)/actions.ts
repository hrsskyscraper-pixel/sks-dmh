'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
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
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function clearViewAs() {
  const cookieStore = await cookies()
  cookieStore.delete(VIEW_AS_COOKIE)
  revalidatePath('/', 'layout')
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

export async function markNotificationsRead(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '認証エラー' }

  // view-as中は対象社員のnotifications_read_atを更新
  const cookieStore = await cookies()
  const viewAsId = cookieStore.get(VIEW_AS_COOKIE)?.value ?? null

  const adminDb = createAdminClient()
  const { error } = viewAsId
    ? await adminDb.from('employees').update({ notifications_read_at: new Date().toISOString() }).eq('id', viewAsId)
    : await adminDb.from('employees').update({ notifications_read_at: new Date().toISOString() }).eq('auth_user_id', user.id)

  if (error) return { error: error.message }
  return {}
}

export async function updateSkillStandardHours(skillId: string, hours: number | null): Promise<{ error?: string }> {
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
    .update({ standard_hours: hours })
    .eq('id', skillId)

  if (error) return { error: error.message }
  return {}
}
