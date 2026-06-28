'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminister } from '@/lib/permissions'

/**
 * 担当リーダーの「このカリキュラムで育成対象として参加する／しない」を切り替える。
 *   participate=true  → する（curriculum_opt_outs から行を削除＝デフォルト）
 *   participate=false → しない（curriculum_opt_outs に行を追加＝ランキングから除外）
 * 設定できるのは本人、または管理者（canAdminister）のみ。
 */
export async function setCurriculumParticipation(
  employeeId: string,
  projectId: string,
  participate: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未認証' }

  const db = createAdminClient()
  const { data: me } = await db
    .from('employees')
    .select('id, role, system_permission')
    .eq('auth_user_id', user.id)
    .eq('status', 'approved')
    .single()
  if (!me) return { error: 'ユーザー情報が取得できません' }

  const allowed = me.id === employeeId || canAdminister(me)
  if (!allowed) return { error: 'この設定を変更する権限がありません' }

  if (participate) {
    const { error } = await db.from('curriculum_opt_outs').delete().eq('employee_id', employeeId).eq('project_id', projectId)
    if (error) return { error: '設定の更新に失敗しました' }
  } else {
    const { error } = await db.from('curriculum_opt_outs').upsert(
      { employee_id: employeeId, project_id: projectId, created_by: me.id },
      { onConflict: 'employee_id,project_id' },
    )
    if (error) return { error: '設定の更新に失敗しました' }
  }

  revalidatePath(`/admin/employees/${employeeId}`)
  return { ok: true }
}
