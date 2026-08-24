import { createAdminClient } from '@/lib/supabase/admin'

/**
 * アプリ全体の設定（app_settings テーブル）の読み書き。
 *
 * app_settings は RLS で service-role 専用にしているため、必ず admin client 経由で扱う。
 * 更新はサーバーアクション側でロールチェックを済ませてから呼ぶこと。
 */

export const EMAIL_NOTIFICATIONS_ENABLED = 'email_notifications_enabled'

/**
 * メール通知が有効かどうか。
 *
 * 既定は「有効」。行が無い場合・取得に失敗した場合も有効として扱う（従来どおり送信する）。
 * 一時的なDBエラーで招待メール等が黙って消えるほうが害が大きいため、fail-open にしている。
 * 失敗時は必ずログに残すので、通知が止まらない事象は通知ログ・サーバーログから追える。
 */
export async function isEmailNotificationsEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient()
    const { data, error } = await db
      .from('app_settings')
      .select('value')
      .eq('key', EMAIL_NOTIFICATIONS_ENABLED)
      .maybeSingle()
    if (error) {
      console.error('[設定] メール通知フラグの取得に失敗（有効として続行）:', error.message)
      return true
    }
    if (!data) return true
    return data.value !== false
  } catch (e) {
    console.error('[設定] メール通知フラグの取得に失敗（有効として続行）:', e)
    return true
  }
}

/**
 * メール通知の一括スイッチを更新する。
 * 呼び出し側でシステム管理者のチェックを済ませてから使うこと。
 */
export async function setEmailNotificationsEnabled(enabled: boolean, actorId: string): Promise<{ error?: string }> {
  const db = createAdminClient()
  const { error } = await db
    .from('app_settings')
    .upsert(
      {
        key: EMAIL_NOTIFICATIONS_ENABLED,
        value: enabled,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
  if (error) return { error: error.message }
  return {}
}

/** メール通知スイッチの現在値と、最後に変更した人・日時 */
export async function getEmailNotificationsSetting(): Promise<{
  enabled: boolean
  updatedBy: string | null
  updatedAt: string | null
}> {
  try {
    const db = createAdminClient()
    const { data } = await db
      .from('app_settings')
      .select('value, updated_by, updated_at')
      .eq('key', EMAIL_NOTIFICATIONS_ENABLED)
      .maybeSingle()
    if (!data) return { enabled: true, updatedBy: null, updatedAt: null }

    let updatedBy: string | null = null
    if (data.updated_by) {
      const { data: emp } = await db
        .from('employees')
        .select('name')
        .eq('id', data.updated_by)
        .maybeSingle()
      updatedBy = emp?.name ?? null
    }

    return {
      enabled: data.value !== false,
      updatedBy,
      updatedAt: data.updated_at,
    }
  } catch (e) {
    console.error('[設定] メール通知フラグの取得に失敗（有効として続行）:', e)
    return { enabled: true, updatedBy: null, updatedAt: null }
  }
}
