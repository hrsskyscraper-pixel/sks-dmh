import { cache } from 'react'
import { createClient } from './server'

/** 認証ユーザーの最小表現（getClaims のクレームから組み立てる） */
export type AuthUser = {
  id: string
  email: string | null
  user_metadata: Record<string, unknown>
}

/**
 * リクエスト内で認証ユーザーをキャッシュ（layout + page で呼んでも1回）。
 *
 * 以前は auth.getUser()（毎レンダリングで Auth サーバーへネットワーク往復）を
 * 使っていたため、全ページの SSR が往復待ちでブロックされていた。
 * 本プロジェクトは非対称鍵（ES256）を使用しているため getClaims() は JWT を
 * ローカル検証でき、往復は不要（トークン更新は middleware が担う）。
 *
 * 注意: これは「描画用の本人特定」用途。RLS は引き続き全クエリで効く。
 * セキュリティ上厳密な検証が要る書き込み系アクションは個別に getUser() を使う。
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return {
    id: claims.sub as string,
    email: (claims.email as string | undefined) ?? null,
    user_metadata: (claims.user_metadata as Record<string, unknown> | undefined) ?? {},
  }
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
    .select('id, name, last_name, first_name, name_kana, email, role, business_role_ids, system_permission, employment_type, hire_date, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, line_friend, approved_by, approved_at, notifications_read_at, font_scale, auth_user_id, created_at, updated_at')
    .eq('auth_user_id', user.id)
    .single()

  return data
})
