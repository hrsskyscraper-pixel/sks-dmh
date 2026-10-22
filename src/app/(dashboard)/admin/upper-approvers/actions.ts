'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister, canApprove } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'

/** 店舗の「店長の申請を承認する人」を足す・外す（B-④-3）。システム管理者のみ。外しても足し直せるので確認は挟まない */
export async function setUpperApprover(teamId: string, employeeId: string, on: boolean): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  const db = createAdminClient()
  const [{ data: team }, { data: emp }] = await Promise.all([
    db.from('teams').select('id, name, type').eq('id', teamId).maybeSingle(),
    db.from('employees').select('id, name, role, system_permission, status').eq('id', employeeId).maybeSingle(),
  ])
  if (!team || team.type !== 'store') return { error: '店舗が見つかりません' }
  if (!emp || emp.status !== 'approved') return { error: '社員が見つかりません' }
  if (on && !canApprove(emp)) return { error: `${emp.name}さんには承認の権限がありません（権限を「育成リーダー」以上にしてください）` }

  const { error } = on
    ? await db.from('team_upper_approvers').upsert({ team_id: teamId, employee_id: employeeId, created_by: me.id })
    : await db.from('team_upper_approvers').delete().eq('team_id', teamId).eq('employee_id', employeeId)
  if (error) { console.error('上の承認者の保存エラー:', error); return { error: '保存できませんでした' } }
  await writeAuditLog({
    action: on ? 'upper_approver_added' : 'upper_approver_removed',
    actorId: me.id,
    targetId: employeeId,
    details: { team_id: teamId, team_name: team.name },
  }).catch(console.error)
  revalidatePath('/admin/upper-approvers')
  return {}
}
