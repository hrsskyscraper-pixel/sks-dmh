import type { Role, SystemPermission } from '@/types/database'
import { canAdminister } from '@/lib/permissions'

/**
 * メールアドレスの表示可否（個人情報保護）
 *
 * 背景: あるユーザーから「個人情報（メールアドレス）を他の人に見せないでほしい」という
 * 要望があり、メールアドレスは「本人」と「システム管理者
 * （canAdminister = developer / ops_admin。旧 admin / ops_manager / executive / testuser 相当）」
 * 以外には表示しないことにした。
 *
 * ★後で全員に表示を戻す場合:
 *   下の EMAIL_VISIBILITY_RESTRICTED を false にするだけでよい。
 *   canViewEmail が常に true を返し、各画面のマスク処理が無効化されて元の挙動に戻る。
 *
 * 実装方針:
 *   - 一覧・詳細などはサーバーコンポーネント側で maskEmails / canViewEmail を使って
 *     閲覧不可の email を空文字にしてからクライアントへ渡す（ネットワーク経由の露出も防ぐ）。
 *   - 表示側コンポーネントは email が空なら描画しない。
 */
export const EMAIL_VISIBILITY_RESTRICTED = true

type ViewerLike = {
  id?: string | null
  role?: Role | null
  system_permission?: SystemPermission | null
}

/** viewer が targetEmployeeId のメールアドレスを閲覧してよいか */
export function canViewEmail(
  viewer: ViewerLike | null | undefined,
  targetEmployeeId: string | null | undefined,
): boolean {
  if (!EMAIL_VISIBILITY_RESTRICTED) return true
  if (!viewer) return false
  // 本人
  if (viewer.id && targetEmployeeId && viewer.id === targetEmployeeId) return true
  // システム管理者
  return canAdminister(viewer)
}

/**
 * メール付きの社員配列を、viewer が閲覧してよい行だけ実値を残し、
 * それ以外は email を空文字にしたコピーを返す（サーバー側マスク用）。
 */
export function maskEmails<T extends { id: string; email?: string | null }>(
  rows: T[],
  viewer: ViewerLike | null | undefined,
): T[] {
  return rows.map(r => (canViewEmail(viewer, r.id) ? r : ({ ...r, email: '' } as T)))
}
