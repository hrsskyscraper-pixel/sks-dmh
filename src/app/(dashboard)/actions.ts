'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  if (!currentEmployee || !['manager', 'admin', 'ops_manager'].includes(currentEmployee.role)) return

  const cookieStore = await cookies()
  cookieStore.set(VIEW_AS_COOKIE, employeeId, { path: '/' })
  redirect('/')
}

export async function clearViewAs() {
  const cookieStore = await cookies()
  cookieStore.delete(VIEW_AS_COOKIE)
  redirect('/')
}
