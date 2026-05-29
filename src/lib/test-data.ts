import { cache } from 'react'
import { createAdminClient } from './supabase/admin'

/**
 * テストデータ判定の唯一の集約点。
 *
 * 公開表示（ランキング・タイムライン・統計・各種カウント等）からは、ここで
 * 算出した「テスト社員 / テストチーム」を必ず除外する。新しい公開表示を足す
 * ときは、必ずこのヘルパーで除外すること（個別に条件を書かない）。
 *
 * テスト社員 =
 *   - employees.is_test = true
 *   - role = 'testuser'
 *   - テストチーム(is_test=true)に team_members / team_managers で所属するメンバー（カスケード）
 * テストチーム = teams.is_test = true
 *
 * いずれもリクエスト内でキャッシュ（cache）し、1リクエストで1回だけ問い合わせる。
 */

export const getTestTeamIds = cache(async (): Promise<Set<string>> => {
  const db = createAdminClient()
  const { data } = await db.from('teams').select('id').eq('is_test', true)
  return new Set((data ?? []).map(t => t.id))
})

export const getTestEmployeeIds = cache(async (): Promise<Set<string>> => {
  const db = createAdminClient()
  const testTeamIds = [...(await getTestTeamIds())]

  const [{ data: flagged }, memberRows, managerRows] = await Promise.all([
    // is_test=true または role='testuser'
    db.from('employees').select('id').or('is_test.eq.true,role.eq.testuser'),
    testTeamIds.length > 0
      ? db.from('team_members').select('employee_id').in('team_id', testTeamIds)
      : Promise.resolve({ data: [] as { employee_id: string }[] }),
    testTeamIds.length > 0
      ? db.from('team_managers').select('employee_id').in('team_id', testTeamIds)
      : Promise.resolve({ data: [] as { employee_id: string }[] }),
  ])

  const ids = new Set<string>((flagged ?? []).map(e => e.id))
  for (const r of memberRows.data ?? []) ids.add(r.employee_id)
  for (const r of managerRows.data ?? []) ids.add(r.employee_id)
  return ids
})

/** 配列から、指定キーがテスト社員のものを除外する */
export function excludeTestByEmployee<T>(rows: T[], testIds: Set<string>, key: (row: T) => string | null | undefined): T[] {
  return rows.filter(r => {
    const id = key(r)
    return !id || !testIds.has(id)
  })
}
