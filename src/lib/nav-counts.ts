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
  /** 遅延スキル件数（選択中カリキュラム・スキルナビのバッジに加算） */
  overdueSkillCount: number
  /** ホームのバッジ（遅れ/次の一歩） */
  dashboardBadge: { count: number; color: 'red' | 'blue' } | null
  /** LINE通知の一括スイッチが有効か（休止中は LINE連携の案内を出さない） */
  lineNotificationsEnabled: boolean
  /** 承認者向け: 滞留している承認（申請の翌日中に承認されていないもの）。ベルの要対応と、ログイン時のモーダルに使う */
  stalledApprovals: { count: number; maxDays: number; unassignedTeams: number }
}

export const EMPTY_NAV_COUNTS: NavCounts = {
  notifCount: 0,
  unreadTeamReqCount: 0,
  pendingApprovalCount: 0,
  rejectedSkillCount: 0,
  overdueSkillCount: 0,
  dashboardBadge: null,
  stalledApprovals: { count: 0, maxDays: 0, unassignedTeams: 0 },
  lineNotificationsEnabled: true,
}
