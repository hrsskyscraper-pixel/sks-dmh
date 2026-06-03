/**
 * 公式アカウント Mission Board の友だち追加URL（Basic ID: @556bhmpg）。
 *
 * 未認証 LINE 公式アカウントは LINE アプリ内検索に表示されないため、
 * ユーザーに「LINEで Mission Board を検索→追加」を案内しても見つからない。
 * このURLを直接タップすれば LINE が開き、友だち追加画面が出る。
 *
 * OA を別アカウントに切り替える場合はここを更新する。
 */
export const LINE_OA_FRIEND_ADD_URL = 'https://line.me/R/ti/p/@556bhmpg'

/**
 * LINE Login の認可URLを組み立てる（クライアント側で使用）。
 *
 * `bot_prompt=aggressive` を付けることで、連携時に「リンクされた LINE 公式アカウント」の
 * 友だち追加画面を表示する。公式アカウントを友だち追加していないユーザーには
 * Messaging API の push（通知）が届かないため、これを必ず付ける。
 *
 * 前提: LINE Developers Console で、この LINE Login チャネルに「リンクされた
 * LINE 公式アカウント（Messaging API チャネル）」を設定しておくこと。
 * 未設定だと `bot_prompt` は無視され、友だち追加画面が出ない。
 *
 * @param baseUrl アプリのオリジン（例: https://sks-dmh.vercel.app）
 * @returns 認可URL。`NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID` 未設定なら null。
 */
export function buildLineLoginAuthorizeUrl(baseUrl: string): string | null {
  const channelId = process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID
  if (!channelId) return null

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: channelId,
    redirect_uri: `${baseUrl}/auth/line/callback`,
    state: crypto.randomUUID(),
    scope: 'profile',
    bot_prompt: 'aggressive',
  })
  return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`
}
