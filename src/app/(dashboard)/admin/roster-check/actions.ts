'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { normalizeDeptName } from '@/lib/roster-affiliation'

/**
 * 名簿の店舗部署名を、アプリの店舗・部署に対応づける（teamId が null なら対応づけを外す）。
 * 名簿の書き方（例:「CoCo壱番屋 ○○店」）とアプリの店舗名（例:「○○店」）が違うとき用。所属そのものは変えない。
 */
export async function setRosterDeptAlias(rosterName: string, teamId: string | null): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || !canAdminister(me)) return { error: '権限がありません' }
  const key = normalizeDeptName(rosterName)
  if (!key) return { error: '名簿の店舗部署名が空です' }

  const db = createAdminClient()
  if (teamId) {
    const { data: team } = await db.from('teams').select('id, type').eq('id', teamId).maybeSingle()
    if (!team || !['store', 'department'].includes(team.type)) return { error: '店舗または部署を選んでください' }
    const { error } = await db.from('roster_dept_aliases').upsert({ roster_name: key, team_id: teamId, created_by: me.id })
    if (error) return { error: error.message }
  } else {
    const { error } = await db.from('roster_dept_aliases').delete().eq('roster_name', key)
    if (error) return { error: error.message }
  }
  await writeAuditLog({ action: 'roster_dept_alias', actorId: me.id, details: { roster_name: rosterName, team_id: teamId } }).catch(() => {})
  revalidatePath('/admin/roster-check')
  return {}
}
