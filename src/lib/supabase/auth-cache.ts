import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from './server'
import { createAdminClient } from './admin'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { canAdminister } from '@/lib/permissions'

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
 * 本習得カリキュラムは非対称鍵（ES256）を使用しているため getClaims() は JWT を
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

/** employees から取る列。本人と view-as 対象で必ず同じ形にする */
const EMPLOYEE_COLUMNS = 'id, name, last_name, first_name, name_kana, email, role, business_role_ids, system_permission, employment_type, hire_date, left_at, birth_date, avatar_url, instagram_url, line_url, status, requested_team_id, requested_project_team_id, line_user_id, line_friend, approved_by, approved_at, invited_by, invitation_id, notifications_read_at, font_scale, intro_dismissed_at, is_test, auth_user_id, created_at, updated_at'

/**
 * ログインしている本人。**view-as 中でも入れ替わらない。**
 *
 * 書き込み・権限チェック・監査ログは必ずこちらを使う。
 * 「誰の画面を描くか」は getCurrentEmployee（view-as が効く）。
 */
export const getRealEmployee = cache(async () => {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) return null

  const { data } = await supabase
    .from('employees')
    .select(EMPLOYEE_COLUMNS)
    .eq('auth_user_id', user.id)
    .single()

  return data
})

export type ViewAsContext = {
  /** ログイン本人 */
  real: Awaited<ReturnType<typeof getRealEmployee>>
  /** 画面を描く対象（view-as 中はその相手、それ以外は本人） */
  effective: Awaited<ReturnType<typeof getRealEmployee>>
  /** view-as 中のときだけ相手が入る。バナーの出し分けに使う */
  viewingAs: Awaited<ReturnType<typeof getRealEmployee>>
}

/**
 * view-as（他の社員の視点で表示）を1か所で解決する。
 *
 * ページごとに cookie を読んで入れ替える作りだったため、対応漏れのページでは
 * 「○○ の視点で表示中」と出ているのに中身が自分のまま、という食い違いが起きていた
 * （2026-09-29、承認センター・タイムライン・ランキングほか20ページ）。
 *
 * **使えるのは運用管理者・開発者だけ。** 以前は全ロールで有効だったうえ、
 * view-as 中のページは RLS を迂回する admin client に切り替わるため、
 * cookie を立てるだけで他人の通知・スキルを閲覧できる状態だった。
 */
export const getViewAsContext = cache(async (): Promise<ViewAsContext> => {
  const real = await getRealEmployee()
  if (!real) return { real: null, effective: null, viewingAs: null }
  if (!canAdminister(real)) return { real, effective: real, viewingAs: null }

  const viewAsId = (await cookies()).get(VIEW_AS_COOKIE)?.value ?? null
  if (!viewAsId || viewAsId === real.id) return { real, effective: real, viewingAs: null }

  const { data } = await createAdminClient()
    .from('employees')
    .select(EMPLOYEE_COLUMNS)
    .eq('id', viewAsId)
    .maybeSingle()
  if (!data) return { real, effective: real, viewingAs: null }

  return { real, effective: data, viewingAs: data }
})

/**
 * 画面を描く対象の社員。**view-as 中はその相手になる。**
 *
 * 書き込み・権限チェック・監査ログには使わないこと（getRealEmployee を使う）。
 */
export const getCurrentEmployee = cache(async () => (await getViewAsContext()).effective)
