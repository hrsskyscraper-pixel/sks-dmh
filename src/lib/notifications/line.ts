const LINE_API_BASE = 'https://api.line.me/v2/bot'

/**
 * LINE Messaging API で個別にメッセージを送信。
 *
 * よくある失敗:
 * - LINE_MESSAGING_ACCESS_TOKEN 未設定 → 送信スキップ（warn のみ）
 * - 相手が公式アカウントを友だち追加していない / ブロック → 400 が返る
 * - LINE Login チャネルと Messaging API チャネルが別プロバイダー → userId 不正で 400
 */
export async function sendLineMessage(lineUserId: string, message: string) {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN
  if (!token) {
    console.warn('[LINE] LINE_MESSAGING_ACCESS_TOKEN 未設定のため送信スキップ:', { lineUserId })
    return
  }

  let res: Response
  try {
    res = await fetch(`${LINE_API_BASE}/message/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: lineUserId,
        messages: [{ type: 'text', text: message }],
      }),
    })
  } catch (err) {
    console.error('[LINE] 送信エラー（ネットワーク）:', { lineUserId, err })
    throw err
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    console.error('[LINE] 送信失敗:', { lineUserId, status: res.status, body: bodyText })
    throw new Error(`LINE API error: ${res.status} ${bodyText}`)
  }
  console.log('[LINE] 送信成功:', { lineUserId })
}

/**
 * 複数ユーザーにLINEメッセージを送信
 */
export async function sendLineMessages(lineUserIds: string[], message: string) {
  const results = await Promise.allSettled(
    lineUserIds.map(id => sendLineMessage(id, message))
  )
  const failed = results.filter(r => r.status === 'rejected')
  if (failed.length > 0) {
    console.error(`[LINE] ${failed.length}/${lineUserIds.length} 件送信失敗`)
  }
}
