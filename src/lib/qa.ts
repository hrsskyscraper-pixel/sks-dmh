/**
 * Q&A（2026-09-19 MTG 決定 ④）
 * - 誰でも質問・回答・閲覧できる。権限による出し分けは「解決済みにできる人」だけ
 *   （質問した本人と運営チーム＝運用管理者・開発者）。
 * - データは admin client 経由（RLS 有効・ポリシー無し）。API ルートで認証を確認してから書く。
 */
import { isDeveloper, isOpsAdmin } from '@/lib/permissions'
import type { Role, SystemPermission } from '@/types/database'

export type QaStatus = 'open' | 'resolved'

export const QA_STATUS_LABEL: Record<QaStatus, string> = {
  open: '回答待ち',
  resolved: '解決済み',
}

export interface QaQuestionRow {
  id: string
  asker_id: string
  title: string
  body: string
  status: QaStatus
  answer_count: number
  resolved_at: string | null
  resolved_by: string | null
  hidden_at?: string | null
  hidden_by?: string | null
  created_at: string
  updated_at: string
}

export interface QaAnswerRow {
  id: string
  question_id: string
  author_id: string
  body: string
  hidden_at?: string | null
  hidden_by?: string | null
  created_at: string
}

type EmpLike = { id: string; role?: Role | null; system_permission?: SystemPermission | null }

/** 解決済みの切り替えができる人: 質問した本人・運用管理者・開発者 */
export function canResolveQuestion(me: EmpLike, q: { asker_id: string }): boolean {
  return me.id === q.asker_id || isOpsAdmin(me) || isDeveloper(me)
}

/**
 * 不適切な投稿を非表示にできる人（2026-10-21 原島さん確定 A-8）: 設定画面の「Q&A の投稿を非表示にできる人」。
 * 誰も設定されていないときは、開発者だけ（運用管理者全員には広げない）。
 * 一覧に入っていても、運用管理者・開発者から外れた人はできない（権限を下げたときに残らないように）。
 */
export function canModerateQa(me: EmpLike, moderatorIds: string[]): boolean {
  if (!isOpsAdmin(me) && !isDeveloper(me)) return false
  return moderatorIds.length > 0 ? moderatorIds.includes(me.id) : isDeveloper(me)
}

export const QA_TITLE_MAX = 120
export const QA_BODY_MAX = 4000
/** 1人あたりの投稿の上限（直近1時間）。運営チームへの通知（休止中も届く）を外から食わせないため */
export const QA_QUESTIONS_PER_HOUR = 5
export const QA_ANSWERS_PER_HOUR = 20
