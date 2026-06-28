'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminister } from '@/lib/permissions'
import { revalidatePath } from 'next/cache'

/**
 * 習得カリキュラム（skill_projects）の名称・説明を更新する。
 * - システム管理者のみ。
 * - このカリキュラムに紐づく「PJチーム」のうち、旧カリキュラム名と同名のもの（＝カリキュラムと対になるチーム）を
 *   新名称へ追従リネームする。店舗・部署や別名のチームは触らない。
 * - 変更がアプリ全体（みんなの頑張り等）へ反映されるよう revalidate する。
 */
export async function updateProject(
  projectId: string,
  name: string,
  description: string | null,
): Promise<{ error?: string; data?: { id: string; name: string; description: string | null; is_active: boolean }; renamedTeams?: number }> {
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
  if (!me || !canAdminister(me)) return { error: '権限がありません' }

  const trimmed = name.trim()
  if (!trimmed) return { error: '名称を入力してください' }
  const desc = description?.trim() || null

  // 旧名（紐づくPJチームの同名リネーム判定に使う）
  const { data: old } = await db.from('skill_projects').select('name').eq('id', projectId).single()
  const oldName = old?.name ?? null

  const { data, error } = await db
    .from('skill_projects')
    .update({ name: trimmed, description: desc })
    .eq('id', projectId)
    .select('id, name, description, is_active')
    .single()
  if (error) return { error: error.message }

  // 旧カリキュラム名と同名の「PJチーム」（このカリキュラムに紐づくもの）を追従リネーム
  let renamedTeams = 0
  if (oldName && oldName !== trimmed) {
    const { data: pts } = await db.from('project_teams').select('team_id').eq('project_id', projectId)
    const teamIds = (pts ?? []).map(p => p.team_id)
    if (teamIds.length > 0) {
      const { data: paired } = await db
        .from('teams')
        .select('id')
        .eq('type', 'project')
        .eq('name', oldName)
        .in('id', teamIds)
      const pairedIds = (paired ?? []).map(t => t.id)
      if (pairedIds.length > 0) {
        await db.from('teams').update({ name: trimmed }).in('id', pairedIds)
        renamedTeams = pairedIds.length
      }
    }
  }

  // アプリ全体へ反映（みんなの頑張り・スキルページ等）
  revalidatePath('/', 'layout')
  return { data, renamedTeams }
}
