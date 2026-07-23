import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllRows } from '@/lib/supabase/fetch-all'

export type CertifiedAchievementRow = {
  employee_id: string
  skill_id: string
  certified_at: string | null
  cumulative_hours_at_achievement: number | null
}

/**
 * 全「認定済み（certified）」achievements のリクエスト内共有キャッシュ。
 *
 * ホームは複数コンポーネント（チームランキング・スキル習得ランキング・
 * チェックポイント記録）がそれぞれ全認定行をフルスキャンしていたため、
 * 1リクエスト1回に集約する。列は各利用箇所が必要とする和集合を取得し、
 * 絞り込み（期間・スキル・null除外など）は各利用箇所の JS 側で行う。
 */
export const getAllCertifiedAchievements = cache(async (): Promise<CertifiedAchievementRow[]> => {
  const db = createAdminClient()
  return fetchAllRows<CertifiedAchievementRow>((from, to) =>
    db.from('achievements')
      .select('employee_id, skill_id, certified_at, cumulative_hours_at_achievement')
      .eq('status', 'certified')
      .order('id')
      .range(from, to),
  )
})
