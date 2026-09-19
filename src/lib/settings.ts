import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

/**
 * アプリ全体の設定（app_settings テーブル）の読み書き。
 *
 * app_settings は RLS で service-role 専用にしているため、必ず admin client 経由で扱う。
 * 更新はサーバーアクション側でロールチェックを済ませてから呼ぶこと。
 *
 * キー:
 * - email_notifications_enabled : メール通知の一括スイッチ（既定 true）
 * - line_notifications_enabled  : LINE 通知の一括スイッチ（既定 true）。2026-09-20 追加。
 *   LINE の無料枠（月200通）は毎月リセットされ、上限までは届き超えた分は失敗する。
 *   「月初だけ届く」状態を避けるため、メールと同じく明示的に止められるようにした。
 * - ops_team_recipient_ids      : 改善提案・Q&A の通知を「一括休止に関係なく」届ける運営チームの社員ID配列。
 *   未設定なら 運用管理者＋開発者 を宛先にする（従来どおり）。
 */

export const EMAIL_NOTIFICATIONS_ENABLED = 'email_notifications_enabled'
export const LINE_NOTIFICATIONS_ENABLED = 'line_notifications_enabled'
export const OPS_TEAM_RECIPIENT_IDS = 'ops_team_recipient_ids'

export type SettingMeta = { updatedBy: string | null; updatedAt: string | null }

/**
 * 真偽の設定を読む。既定は「有効」。行が無い場合・取得に失敗した場合も有効として扱う（fail-open）。
 * 一時的なDBエラーで招待メール等が黙って消えるほうが害が大きいため。失敗時は必ずログに残す。
 */
async function getBoolSetting(key: string): Promise<boolean> {
  try {
    const db = createAdminClient()
    const { data, error } = await db.from('app_settings').select('value').eq('key', key).maybeSingle()
    if (error) {
      console.error(`[設定] ${key} の取得に失敗（有効として続行）:`, error.message)
      return true
    }
    if (!data) return true
    return data.value !== false
  } catch (e) {
    console.error(`[設定] ${key} の取得に失敗（有効として続行）:`, e)
    return true
  }
}

async function setSetting(key: string, value: Json, actorId: string): Promise<{ error?: string }> {
  const db = createAdminClient()
  const { error } = await db
    .from('app_settings')
    .upsert({ key, value, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return { error: error.message }
  return {}
}

async function getSettingRow(key: string): Promise<{ value: unknown; updatedBy: string | null; updatedAt: string | null } | null> {
  try {
    const db = createAdminClient()
    const { data } = await db.from('app_settings').select('value, updated_by, updated_at').eq('key', key).maybeSingle()
    if (!data) return null
    let updatedBy: string | null = null
    if (data.updated_by) {
      const { data: emp } = await db.from('employees').select('name').eq('id', data.updated_by).maybeSingle()
      updatedBy = emp?.name ?? null
    }
    return { value: data.value, updatedBy, updatedAt: data.updated_at }
  } catch (e) {
    console.error(`[設定] ${key} の取得に失敗:`, e)
    return null
  }
}

// ---------- メール ----------
export const isEmailNotificationsEnabled = () => getBoolSetting(EMAIL_NOTIFICATIONS_ENABLED)
export const setEmailNotificationsEnabled = (enabled: boolean, actorId: string) => setSetting(EMAIL_NOTIFICATIONS_ENABLED, enabled, actorId)
export async function getEmailNotificationsSetting(): Promise<{ enabled: boolean } & SettingMeta> {
  const row = await getSettingRow(EMAIL_NOTIFICATIONS_ENABLED)
  return row ? { enabled: row.value !== false, updatedBy: row.updatedBy, updatedAt: row.updatedAt } : { enabled: true, updatedBy: null, updatedAt: null }
}

// ---------- LINE ----------
export const isLineNotificationsEnabled = () => getBoolSetting(LINE_NOTIFICATIONS_ENABLED)
export const setLineNotificationsEnabled = (enabled: boolean, actorId: string) => setSetting(LINE_NOTIFICATIONS_ENABLED, enabled, actorId)
export async function getLineNotificationsSetting(): Promise<{ enabled: boolean } & SettingMeta> {
  const row = await getSettingRow(LINE_NOTIFICATIONS_ENABLED)
  return row ? { enabled: row.value !== false, updatedBy: row.updatedBy, updatedAt: row.updatedAt } : { enabled: true, updatedBy: null, updatedAt: null }
}

// ---------- 運営チームの通知先（改善提案・Q&A） ----------
export async function getOpsTeamRecipientIds(): Promise<string[]> {
  const row = await getSettingRow(OPS_TEAM_RECIPIENT_IDS)
  const v = row?.value
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
export const setOpsTeamRecipientIds = (ids: string[], actorId: string) => setSetting(OPS_TEAM_RECIPIENT_IDS, ids, actorId)
export async function getOpsTeamRecipientSetting(): Promise<{ ids: string[] } & SettingMeta> {
  const row = await getSettingRow(OPS_TEAM_RECIPIENT_IDS)
  const v = row?.value
  return { ids: Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [], updatedBy: row?.updatedBy ?? null, updatedAt: row?.updatedAt ?? null }
}
