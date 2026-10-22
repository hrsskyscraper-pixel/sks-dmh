'use server'

import { revalidatePath } from 'next/cache'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 級の取得を知らせてほしい店舗を切り替える（ご本人だけ。view-as では入れ替えない）。
 * 所属店舗: 既定で知らせる。オフにすると mute 行を作る。
 * それ以外の店舗: 既定で知らせない。オンにすると follow 行を作る。
 */
export async function setStoreFollow(teamId: string, wanted: boolean): Promise<{ error?: string }> {
  const me = await getRealEmployee()
  if (!me || me.status !== 'approved') return { error: 'ログインが必要です' }
  if (typeof teamId !== 'string' || !/^[0-9a-f-]{36}$/.test(teamId)) return { error: '店舗を選んでください' }

  const db = createAdminClient()
  const [{ data: team }, { data: mine }] = await Promise.all([
    db.from('teams').select('id, type, is_test').eq('id', teamId).maybeSingle(),
    db.from('team_members').select('team_id').eq('employee_id', me.id).eq('team_id', teamId).maybeSingle(),
  ])
  if (!team || team.type !== 'store' || team.is_test) return { error: '店舗を選んでください' }

  const isMember = !!mine
  // 所属店舗で「知らせる」・ほかの店舗で「知らせない」は既定の状態なので、行を消す
  const mode: 'follow' | 'mute' | null = isMember ? (wanted ? null : 'mute') : (wanted ? 'follow' : null)
  const { error } = mode
    ? await db.from('store_follows').upsert({ employee_id: me.id, team_id: teamId, mode }, { onConflict: 'employee_id,team_id' })
    : await db.from('store_follows').delete().eq('employee_id', me.id).eq('team_id', teamId)
  if (error) {
    console.error('見たい店舗の保存に失敗:', error.message)
    return { error: '保存できませんでした。時間をおいてもう一度お試しください' }
  }
  revalidatePath('/store-follows')
  return {}
}
