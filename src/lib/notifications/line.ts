const LINE_API_BASE = 'https://api.line.me/v2/bot'

/**
 * LINE Messaging API で個別にメッセージを送信
 */
export async function sendLineMessage(lineUserId: string, message: string) {
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN
  if (!token) {
    console.warn('[LINE] ACCESS_TOKEN 未設定のため送信スキップ:', { lineUserId, message })
    return
  }

  try {
    const res = await fetch(`${LINE_API_BASE}/message/push`, {
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

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[LINE] 送信失敗:', err)
      throw new Error(`LINE API error: ${res.status}`)
    }
    console.log('[LINE] 送信成功:', { lineUserId })
  } catch (err) {
    console.error('[LINE] 送信エラー:', err)
    throw err
  }
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
