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
  created_at: string
  updated_at: string
}

export interface QaAnswerRow {
  id: string
  question_id: string
  author_id: string
  body: string
  created_at: string
}

type EmpLike = { id: string; role?: Role | null; system_permission?: SystemPermission | null }

/** 解決済みの切り替えができる人: 質問した本人・運用管理者・開発者 */
export function canResolveQuestion(me: EmpLike, q: { asker_id: string }): boolean {
  return me.id === q.asker_id || isOpsAdmin(me) || isDeveloper(me)
}

export const QA_TITLE_MAX = 120
export const QA_BODY_MAX = 4000
