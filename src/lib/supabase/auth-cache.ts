import { cache } from 'react'
import { createClient } from './server'

/**
 * リクエスト内でauth.getUser()をキャッシュ
 * layout.tsx + page.tsx で呼んでも1回しか実行されない
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * リクエスト内でcurrentEmployee取得をキャッシュ
 */
export const getCurrentEmployee = cache(async () => {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return null

  const { data } = await supabase
    .from('employees')
    .select('id, name, last_name, first_name, name_kana, email, role, business_role_ids, system_permission, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, approved_by, approved_at, notifications_read_at, auth_user_id, created_at, updated_at')
    .eq('auth_user_id', user.id)
    .single()

  return data
})
