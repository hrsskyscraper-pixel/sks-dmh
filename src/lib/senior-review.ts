import type { SupabaseClient } from '@supabase/supabase-js'
import { getSeniorReviewOrInactive } from '@/lib/settings'

/**
 * 管理者の申請（B-④-3。2026-10-23 原島さん確定）。
 * 対象の役職（MG・AC・課長。設定で変えられる）を持つ方の申請は、設定で選んだ人（部長・常務・社長）だけが承認する。
 * ほかの運用管理者や、同じ役職の方どうし・店舗の担当リーダーでは承認できない。
 * 設定（getSeniorReview）が未完了のあいだは、これまでどおりの承認範囲のまま。
 */

/** employeeIds のうち、対象の役職を持つ方の社員ID */
export async function seniorApplicantIds(db: SupabaseClient, employeeIds: string[], roleIds: string[]): Promise<Set<string>> {
  const out = new Set<string>()
  const ids = [...new Set(employeeIds)]
  if (ids.length === 0 || roleIds.length === 0) return out
  const roles = new Set(roleIds)
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('employees').select('id, business_role_ids').in('id', ids.slice(i, i + 100))
    if (error) throw new Error(`役職の取得に失敗: ${error.message}`)
    for (const e of (data ?? []) as { id: string; business_role_ids: string[] | null }[]) {
      if ((e.business_role_ids ?? []).some(r => roles.has(r))) out.add(e.id)
    }
  }
  return out
}

/**
 * 件数・一覧の表示用: viewerId が承認できない管理者の申請者（承認する人に選ばれていない人から見た、対象の役職の方）。
 * 承認の可否はサーバー側（certifyScopeError）で別に確かめるので、ここは設定が読めなければ空にして表示を続ける。
 */
export async function unapprovableSeniorIds(db: SupabaseClient, viewerId: string, employeeIds: string[]): Promise<Set<string>> {
  const senior = await getSeniorReviewOrInactive()
  if (!senior.active || senior.approverIds.includes(viewerId)) return new Set()
  try {
    return await seniorApplicantIds(db, employeeIds, senior.roleIds)
  } catch (e) {
    console.error('[管理者の申請] 役職の取得に失敗（表示は除外なしで続行）:', e)
    return new Set()
  }
}
