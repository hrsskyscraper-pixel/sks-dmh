import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 店長（その店舗の担当リーダー）ご本人の申請を承認する人（2026-10-21 原島さん確定 B-④-3）。
 * 担当リーダーは自分の申請を自分で承認できないため、店舗ごとに MG・課長などを「上の承認者」として指定する。
 */

/** approverId が上の承認者になっている店舗の、担当リーダー（＝承認できる申請者）の社員ID */
export async function leaderIdsUnderUpperApprover(db: SupabaseClient, approverId: string): Promise<string[]> {
  const { data: ups } = await db.from('team_upper_approvers').select('team_id').eq('employee_id', approverId)
  const teamIds = (ups ?? []).map(u => u.team_id)
  if (teamIds.length === 0) return []
  const { data: leaders } = await db.from('team_managers').select('employee_id').in('team_id', teamIds)
  return [...new Set((leaders ?? []).map(l => l.employee_id))].filter(id => id !== approverId)
}

/** 店舗ID → 上の承認者の社員ID */
export async function upperApproversByTeam(db: SupabaseClient, teamIds: string[]): Promise<Record<string, string[]>> {
  if (teamIds.length === 0) return {}
  const { data } = await db.from('team_upper_approvers').select('team_id, employee_id').in('team_id', teamIds)
  const out: Record<string, string[]> = {}
  for (const r of data ?? []) (out[r.team_id] ??= []).push(r.employee_id)
  return out
}
