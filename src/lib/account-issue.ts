/**
 * 管理者側でのアカウント発行（2026-10-27）の共通部品。
 * 発行したばかりの社員データは、まだ Google アカウントにつながっていない（auth_user_id が空）。
 * メール列は必須・重複不可なので、つながるまでは仮の値（<社員のid>@issue.invalid）を入れておく。
 * 「.invalid」はどこにも届かないことが保証されたドメイン（RFC 2606）。
 */
export const ISSUE_EMAIL_DOMAIN = 'issue.invalid'

export const placeholderEmail = (employeeId: string) => `${employeeId}@${ISSUE_EMAIL_DOMAIN}`

export const isPlaceholderEmail = (email: string | null | undefined) =>
  !!email && email.toLowerCase().endsWith(`@${ISSUE_EMAIL_DOMAIN}`)

/** 本人用のログインリンク。LINE の内蔵ブラウザでは Google ログインできないので、外部ブラウザで開かせる */
export const claimUrl = (origin: string, claimId: string) => `${origin}/claim/${claimId}?openExternalBrowser=1`

/** カタカナをひらがなに（MB のふりがなは、ひらがな・姓と名の間は半角スペース） */
export function toHiragana(s: string): string {
  return s.normalize('NFKC').replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).trim()
}

export function joinKana(last: string | null | undefined, first: string | null | undefined): string | null {
  const k = [toHiragana(last ?? ''), toHiragana(first ?? '')].filter(Boolean).join(' ')
  return k || null
}

/** 名簿の区分の書き方の揺れを、MB の区分にそろえる。分からないときは null（発行させない） */
export function parseEmploymentType(raw: string | null | undefined): '社員' | 'メイト' | null {
  const t = (raw ?? '').trim().normalize('NFKC')
  if (!t) return null
  if (/^(pa|p\/a|パート|アルバイト|メイト|バイト|パートナー)/i.test(t)) return 'メイト'
  if (/社員|正社員|契約|役員/.test(t)) return '社員'
  return null
}

/** 社員番号のそろえ方（画面とサーバーで同じ判定にする）: 全角半角・空白・大文字小文字の違いを無視 */
export const normEmployeeNumber = (s: string | null | undefined) => (s ?? '').normalize('NFKC').replace(/\s+/g, '').toUpperCase()

/** 氏名・ふりがなに、制御文字・書式文字（ゼロ幅文字や文字の向きを変える記号など）が入っていないか */
export const hasControlChars = (s: string | null | undefined) => /\p{C}/u.test(s ?? '')

/** YYYY-MM-DD が実在する日付か（2026-13-45 などを弾く） */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** 発行で付けられる承認の権限（運用管理者は、発行したあとにプロフィールで付ける） */
export const ISSUABLE_PERMISSIONS = ['training_member', 'training_leader'] as const

/**
 * リンクの作り直し・つなぐ処理の対象にする権限。発行のあと、ログイン前に運用管理者へ上げた方もつなげるようにする。
 * 開発者の行は対象にしない（なりすましで最も強い権限を取らせないため）
 */
export const CLAIMABLE_PERMISSIONS = ['training_member', 'training_leader', 'ops_admin'] as const

/** ログイン中の Google アカウントが、すでにつながっている社員データの状態に合わせた断りの文言（退職日の区切りは JST） */
export function alreadyRegisteredMessage(row: { status: string; left_at?: string | null }): string {
  if (row.left_at && row.left_at <= new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)) return 'この Google アカウントには、以前の（退職済みの）アカウントがつながっています。運用管理者に、以前のアカウントの扱いをご相談ください'
  if (row.status === 'pending') return 'この Google アカウントで、承認待ちの登録が別にあります。運用管理者にお知らせください'
  return 'この Google アカウントは、すでに Mission Board に登録されています。別の方のリンクを開いていないか、確かめてください'
}
