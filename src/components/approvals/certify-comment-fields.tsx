'use client'

import { Textarea } from '@/components/ui/textarea'

/**
 * 認定／差し戻しダイアログの入力欄（承認センター・チーム画面で共通）。
 *
 * 並び順は 2026-09-20 の決定どおり:
 *   1. 本人への一言（公開・任意）— 認定時のみ。お知らせ・タイムラインに店長からの一言として出る
 *   2. 本人だけに届くコメント（任意）— 差し戻し時は理由として必須
 *
 * 一言の例文は「承認した → 良かった点 → 次の一歩」の順で、読んだ本人が嬉しくなり、
 * もっと頑張ろうと思える文章にする（指導の要素を含める）。
 */
export const PRAISE_EXAMPLE =
  '例: ライス盛り、定量ぴったりで安定してきたね！毎回きちんと確認する姿勢が素晴らしい。次はスピードも意識して、ひとり調理に挑戦しよう。期待しています！'

interface Props {
  /** 'certified' | 'rejected' はダイアログを開く前に決まっている場合、'both' は同じダイアログの中で認定／差し戻しを選ぶ場合 */
  mode: 'certified' | 'rejected' | 'both'
  /** まとめて処理（全件に同じ内容が適用される） */
  bulk?: boolean
  comment: string
  onCommentChange: (v: string) => void
  praise: string
  onPraiseChange: (v: string) => void
  disabled?: boolean
}

export function CertifyCommentFields({ mode, bulk = false, comment, onCommentChange, praise, onPraiseChange, disabled }: Props) {
  const showPraise = mode !== 'rejected'
  const commentLabel =
    mode === 'rejected'
      ? `差し戻しの理由（必須${bulk ? '・全件に適用' : ''}）`
      : mode === 'both'
        ? '本人だけに届くコメント（認定は任意・差し戻しは必須）'
        : `本人だけに届くコメント（任意${bulk ? '・全件に適用' : ''}）`
  const commentPlaceholder =
    mode === 'rejected'
      ? 'どこを直すと認定できるかを具体的に'
      : mode === 'both'
        ? '認定の補足、または差し戻しの理由'
        : '認定の補足など。本人以外には見えません'

  return (
    <div className="space-y-3">
      {showPraise && (
        <div>
          <p className="text-xs font-medium text-gray-700 mb-1">
            本人への一言<span className="text-gray-500 font-normal">（公開・任意{bulk ? '・全員に同じ一言' : ''}）</span>
          </p>
          <Textarea
            value={praise}
            onChange={e => onPraiseChange(e.target.value)}
            placeholder={PRAISE_EXAMPLE}
            rows={3}
            disabled={disabled}
            className="text-sm"
          />
          <p className="text-[11px] text-sky-700 mt-1 leading-relaxed">
            {mode === 'both' ? '認定したときだけ、' : ''}「本日のお知らせ」とタイムラインに、店長からの一言として全員に公開されます。
            <span className="block text-gray-500">「できたこと → 良かった点 → 次の一歩」の順に書くと、本人に届きます。</span>
          </p>
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-gray-700 mb-1">{commentLabel}</p>
        <Textarea
          value={comment}
          onChange={e => onCommentChange(e.target.value)}
          placeholder={commentPlaceholder}
          rows={2}
          disabled={disabled}
          className="text-sm"
        />
        {mode !== 'certified' && (
          <p className="text-[11px] text-red-500 mt-1">差し戻しには理由の入力が必須です。本人に通知されます。</p>
        )}
      </div>
    </div>
  )
}
