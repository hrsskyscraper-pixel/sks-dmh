import type { RosterReviewAction, RosterReviewItemRow, RosterReviewStage, SystemPermission } from '@/types/database'
import { standardPermissionOf, widerPermission } from '@/lib/legacy-role'

const PERMISSION_LABEL: Record<SystemPermission, string> = { training_member: 'メンバー', training_leader: 'リーダー', ops_admin: '運用管理者', developer: '開発者' }

/**
 * 在職者の確認（2026-11-01）。社員リストと MB のアカウントの違いを、1人1行の「変更案」にして順に回す。
 *
 * 流れ: 須貝（下書き）→ 原島さん（概要の確認）→ 店長（問題ない／問題ある）と原島さん（担当者承認）→
 *       上長（菅原部長・諸沢社長。同時に承認・コメント）と原島さん（会社として決定）→ 須貝（確認）→ 原島さん（まとめて反映）
 * 店舗の無い方（部署・役員など）の行と、原島さんが概要の確認で決めた行は、店長を飛ばす。
 */

export const STAGE_ORDER: RosterReviewStage[] = ['draft', 'ops_preview', 'store', 'senior', 'dev_check', 'apply', 'done']

export const STAGE_LABEL: Record<RosterReviewStage, string> = {
  draft: '① 下書き（須貝）',
  ops_preview: '② 概要の確認（原島さん）',
  store: '③ 店長の確認・担当者承認（原島さん）',
  senior: '④ 上長の確認・会社としての決定',
  dev_check: '⑤ 須貝の確認',
  apply: '⑥ 反映（原島さん）',
  done: '反映済み',
}

export const ACTION_LABEL: Record<RosterReviewAction, string> = {
  undecided: 'まだ決めていない',
  none: '変えない',
  change: '内容を直す',
  stop: 'アカウントを止める',
  issue: 'アカウントを発行する',
  skip: 'MB は使わない',
}

export const STOP_REASON_LABEL: Record<'left' | 'shared' | 'duplicate', string> = {
  left: '退職',
  shared: '共有アカウント',
  duplicate: '重複アカウント',
}

/** 段階を1つ進めた先 */
export function nextStage(stage: RosterReviewStage): RosterReviewStage | null {
  const i = STAGE_ORDER.indexOf(stage)
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null
}

/** 店長に回す行か（店長を飛ばす行・決めていない行・変えない行は回さない） */
export function goesToStore(item: Pick<RosterReviewItemRow, 'skip_store' | 'confirm_team_id' | 'action'>, storeTeamIdsWithLeader: Set<string>): boolean {
  if (item.skip_store || !isApplicable(item.action)) return false
  return !!item.confirm_team_id && storeTeamIdsWithLeader.has(item.confirm_team_id)
}

/** 反映の対象になる行（変えない・MB は使わない は、何もしない） */
export const isApplicable = (action: RosterReviewAction) => action === 'change' || action === 'stop' || action === 'issue'

export type CurrentState = {
  employment_type: string | null
  team_names: string[]
  role_names: string[]
  role_ids: string[]
  permission: SystemPermission | null
}

/**
 * 「このように変更します」の行を作る（店長・上長に見せる文）。
 * 今の MB の状態と、変更後を比べて、違うところだけを並べる。
 */
export function describeChange(
  item: Pick<RosterReviewItemRow, 'action' | 'target_employment_type' | 'target_team_id' | 'target_role_ids' | 'stop_reason'>,
  current: CurrentState | null,
  names: { team: (id: string) => string; role: (id: string) => string; std?: (id: string) => SystemPermission | null },
): string[] {
  const roles = (ids: string[] | null) => (ids ?? []).map(names.role).join('・') || 'なし'
  switch (item.action) {
    case 'stop':
      return [`アカウントを止めます（${item.stop_reason ? STOP_REASON_LABEL[item.stop_reason] : '理由は未入力'}）`]
    case 'issue':
      return [
        'アカウントを発行します（承認の権限は役職の標準。リーダーなら、その店舗・部署のリーダーにも登録します）',
        `区分: ${item.target_employment_type ?? '未入力'}`,
        `店舗・部署: ${item.target_team_id ? names.team(item.target_team_id) : '未入力'}`,
        `役職: ${roles(item.target_role_ids)}`,
      ]
    case 'change': {
      const lines: string[] = []
      if (item.target_employment_type && item.target_employment_type !== current?.employment_type) {
        lines.push(`区分: ${current?.employment_type ?? 'なし'} → ${item.target_employment_type}`)
      }
      if (item.target_team_id) {
        const to = names.team(item.target_team_id)
        if (!current?.team_names.includes(to)) lines.push(`店舗・部署: ${current?.team_names.join('・') || 'なし'} → ${to}`)
      }
      if (item.target_role_ids) {
        const from = current?.role_names.join('・') || 'なし'
        const to = roles(item.target_role_ids)
        if (from !== to) {
          lines.push(`役職: ${from} → ${to}`)
          // 役職を付けると、承認の権限がその役職の標準まで上がる（反映のときと同じ決め方）
          const cur = current?.permission
          if (cur && cur !== 'developer' && names.std) {
            const added = (item.target_role_ids ?? []).filter(id => !current.role_ids.includes(id))
            const next = widerPermission(cur, standardPermissionOf(added.map(id => ({ name: '', standard_permission: names.std!(id) }))))
            if (next !== cur) lines.push(`承認の権限: ${PERMISSION_LABEL[cur]} → ${PERMISSION_LABEL[next]}（役職の標準まで上がります）`)
          }
        }
      }
      return lines.length ? lines : ['（いまの MB と同じです。変えるところはありません）']
    }
    case 'skip':
      return ['MB のアカウントは作りません']
    case 'none':
      return ['変えません']
    default:
      return ['まだ決めていません']
  }
}

/** 文字の長さの上限（コメント・メモ） */
export const NOTE_MAX = 1000

/** 氏名の比べ方（空白・全角半角の違いを無視する）。重複アカウントを見つけるのに使う */
export const normName = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s/g, '')

export type AccountUsage = { id: string; certified: number; applied: number; last_login_at: string | null; created_at: string }

/** 重複アカウントのうち、活かす方の原案（認定の多い方 → 申請の多い方 → 最近使った方 → 先に作った方） */
export function pickKeep<T extends AccountUsage>(accounts: T[]): T {
  return [...accounts].sort((a, b) =>
    b.certified - a.certified || b.applied - a.applied ||
    (b.last_login_at ?? '').localeCompare(a.last_login_at ?? '') || a.created_at.localeCompare(b.created_at))[0]
}
