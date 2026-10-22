'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export type RosterUpdate = {
  employeeId: string
  hireDate?: string | null
  leftAt?: string | null
  employmentType?: '社員' | 'メイト' | null
  /** 社員番号（名簿の値。退職者データとの突き合わせに使う） */
  employeeNumber?: string | null
  /** フリガナ（MB 側が空のときだけ入れる） */
  nameKana?: string | null
  /** 名簿の店舗部署（所属は変えない。所属との違いの確認に使う） */
  rosterDept?: string | null
}

/**
 * 名簿の一括取込（2026-09-19 決定 ⑦）。氏名（またはメール）で突き合わせた結果を、確認のうえ反映する。
 * 変えるのは 入社日・退職日・雇用区分・社員番号・（空のときだけ）フリガナ・名簿の店舗部署。氏名・ロール・所属は触らない。
 * システム管理者のみ。1件ずつ監査ログに残す。
 */
export async function applyRosterUpdates(updates: RosterUpdate[]): Promise<{ applied: number; error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { applied: 0, error: '権限がありません' }
  if (updates.length === 0) return { applied: 0 }
  if (updates.length > 1000) return { applied: 0, error: '一度に取り込めるのは1,000件までです' }

  const db = createAdminClient()
  const ids = updates.map(u => u.employeeId)
  // 取得は100件ずつ（.in の ID 列が URL に入るため、1000件まとめると長さの上限に当たる）
  type Before = { id: string; name: string; hire_date: string | null; left_at: string | null; employment_type: string; employee_number: string | null; name_kana: string | null; roster_dept: string | null }
  const before: Before[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await db.from('employees').select('id, name, hire_date, left_at, employment_type, employee_number, name_kana, roster_dept').in('id', ids.slice(i, i + 100))
    if (error) {
      console.error('名簿取込の照合に失敗:', error.message)
      return { applied: 0, error: '社員の情報を読めませんでした。時間をおいてもう一度お試しください' }
    }
    before.push(...((data ?? []) as Before[]))
  }
  const beforeById = Object.fromEntries(before.map(e => [e.id, e]))

  let applied = 0
  for (const u of updates) {
    const b = beforeById[u.employeeId]
    if (!b) continue
    const patch: Record<string, string | null> = {}
    if (u.hireDate !== undefined && u.hireDate !== (b.hire_date ?? null)) patch.hire_date = u.hireDate
    if (u.leftAt !== undefined && u.leftAt !== (b.left_at ?? null)) patch.left_at = u.leftAt
    if (u.employmentType && u.employmentType !== b.employment_type) patch.employment_type = u.employmentType
    if (u.employeeNumber && u.employeeNumber !== (b.employee_number ?? null)) patch.employee_number = u.employeeNumber
    if (u.nameKana && !b.name_kana) patch.name_kana = u.nameKana
    if (u.rosterDept && u.rosterDept !== (b.roster_dept ?? null)) { patch.roster_dept = u.rosterDept; patch.roster_dept_at = new Date().toISOString() }
    if (Object.keys(patch).length === 0) continue
    const { error } = await db.from('employees').update(patch).eq('id', u.employeeId)
    if (error) {
      console.error('名簿取込の更新に失敗:', error.message)
      const dup = error.code === '23505'
      return { applied, error: `${b.name} さんの行で止まりました（${applied}件は反映済み）。${dup ? '社員番号がほかの方と重なっています。' : '時間をおいてもう一度お試しください。'}` }
    }
    applied++
    await writeAuditLog({
      action: 'roster_import',
      actorId: me.id,
      targetId: u.employeeId,
      details: { from: { hire_date: b.hire_date, left_at: b.left_at, employment_type: b.employment_type, employee_number: b.employee_number, roster_dept: b.roster_dept }, to: patch },
    }).catch(() => {})
  }
  revalidatePath('/admin/store-stats')
  revalidatePath('/admin/roster-check')
  revalidatePath('/admin/employees')
  return { applied }
}
