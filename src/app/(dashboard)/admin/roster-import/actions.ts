'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

export type RosterUpdate = {
  employeeId: string
  hireDate?: string | null
  leftAt?: string | null
  employmentType?: '社員' | 'メイト' | null
}

/**
 * 名簿の一括取込（2026-09-19 決定 ⑦）。氏名（またはメール）で突き合わせた結果を、確認のうえ反映する。
 * 変えるのは 入社日・退職日・雇用区分 だけ。氏名やロールは触らない。
 * システム管理者のみ。1件ずつ監査ログに残す。
 */
export async function applyRosterUpdates(updates: RosterUpdate[]): Promise<{ applied: number; error?: string }> {
  const me = await getCurrentEmployee()
  if (!me || !canAdminister(me)) return { applied: 0, error: '権限がありません' }
  if (updates.length === 0) return { applied: 0 }
  if (updates.length > 1000) return { applied: 0, error: '一度に取り込めるのは1,000件までです' }

  const db = createAdminClient()
  const ids = updates.map(u => u.employeeId)
  const { data: before } = await db.from('employees').select('id, name, hire_date, left_at, employment_type').in('id', ids)
  const beforeById = Object.fromEntries((before ?? []).map(e => [e.id, e]))

  let applied = 0
  for (const u of updates) {
    const b = beforeById[u.employeeId]
    if (!b) continue
    const patch: Record<string, string | null> = {}
    if (u.hireDate !== undefined && u.hireDate !== (b.hire_date ?? null)) patch.hire_date = u.hireDate
    if (u.leftAt !== undefined && u.leftAt !== (b.left_at ?? null)) patch.left_at = u.leftAt
    if (u.employmentType && u.employmentType !== b.employment_type) patch.employment_type = u.employmentType
    if (Object.keys(patch).length === 0) continue
    const { error } = await db.from('employees').update(patch).eq('id', u.employeeId)
    if (error) return { applied, error: `${b.name}: ${error.message}` }
    applied++
    await writeAuditLog({
      action: 'roster_import',
      actorId: me.id,
      targetId: u.employeeId,
      details: { from: { hire_date: b.hire_date, left_at: b.left_at, employment_type: b.employment_type }, to: patch },
    }).catch(() => {})
  }
  revalidatePath('/admin/store-stats')
  revalidatePath('/admin/employees')
  return { applied }
}
