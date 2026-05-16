'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentEmployee } from '@/lib/supabase/auth-cache'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 既存の line_user_id をもとに、Messaging API で友だち追加状態を再確認する。
 *
 * OAuth フローを通さずに line_friend を更新できるため、
 * 「連携済みだが友だち未追加」状態のユーザーが LINE で公式アカウントを友だち追加した後に、
 * UI から1タップで状態を反映できる。
 *
 * OAuth 再実行は: (a) コードの2重消費で token_failed になりやすい、(b) 既に line_user_id
 * を持っているユーザーには本質的に不要、という理由でこちらを優先する。
 */
export async function recheckLineFriendship(): Promise<
  | { ok: true; friend: boolean }
  | { ok: false; error: string }
> {
  const employee = await getCurrentEmployee()
  if (!employee) return { ok: false, error: 'ログインが必要です' }
  if (!employee.line_user_id) {
    return { ok: false, error: 'LINE連携が完了していません。先に「LINE連携で通知を受け取る」から連携してください。' }
  }

  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN
  if (!token) {
    console.error('[LINE] recheck: LINE_MESSAGING_ACCESS_TOKEN 未設定')
    return { ok: false, error: 'システム設定エラー（管理者にお問い合わせください）' }
  }

  let isFriend: boolean
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${employee.line_user_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      isFriend = true
    } else if (res.status === 404) {
      isFriend = false
    } else {
      const body = await res.text().catch(() => '')
      console.error('[LINE] recheck 想定外レスポンス:', { lineUserId: employee.line_user_id, status: res.status, body })
      return { ok: false, error: `LINE API エラー（${res.status}）` }
    }
  } catch (err) {
    console.error('[LINE] recheck 失敗:', err)
    return { ok: false, error: 'LINE API への接続に失敗しました' }
  }

  const db = createAdminClient()
  const { error: updateError } = await db
    .from('employees')
    .update({ line_friend: isFriend })
    .eq('id', employee.id)
  if (updateError) {
    console.error('[LINE] line_friend 更新失敗:', updateError)
    return { ok: false, error: 'データベース更新に失敗しました' }
  }

  // バナー／フローティングボタンの表示状態は line_friend に依存しているので、再評価させる
  revalidatePath('/', 'layout')
  return { ok: true, friend: isFriend }
}
