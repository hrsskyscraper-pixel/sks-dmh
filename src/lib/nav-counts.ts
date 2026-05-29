// ボトムナビ／通知ベルに表示するバッジ系カウント。
// これらは「あると便利だが描画をブロックすべきでない」情報なので、
// SSR のクリティカルパスから外し、クライアントから getNavCounts() で取得する。

export type NavCounts = {
  /** 通知ベルの未読数（リアクション/コメント/認定結果＋チーム変更申請結果） */
  notifCount: number
  /** 自分のチーム変更申請の未読結果数（チームナビのバッジ） */
  unreadTeamReqCount: number
  /** 承認待ち合計（スキル認定＋チーム変更＋参加許諾） */
  pendingApprovalCount: number
  /** 差し戻しスキル件数（スキルナビのバッジ） */
  rejectedSkillCount: number
  /** ホームのバッジ（遅れ/次の一歩） */
  dashboardBadge: { count: number; color: 'red' | 'blue' } | null
}

export const EMPTY_NAV_COUNTS: NavCounts = {
  notifCount: 0,
  unreadTeamReqCount: 0,
  pendingApprovalCount: 0,
  rejectedSkillCount: 0,
  dashboardBadge: null,
}
