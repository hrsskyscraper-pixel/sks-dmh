import { isLineNotificationsEnabled } from '@/lib/settings'

const LINE_API_BASE = 'https://api.line.me/v2/bot'

export interface LineSendOptions {
  /** 一括休止に関係なく送る（運営チーム宛ての改善提案・Q&A など） */
  bypassPause?: boolean
}

export interface LineResult {
  ok: boolean
  skipped?: boolean
  error?: string
}

const MAX_ATTEMPTS = 3

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * LINE Messaging API で個別にメッセージを送信。一時的な失敗はリトライする。
 * 例外は投げず、結果を { ok, error } で返す（呼び出し側でログ・可視化する）。
 *
 * よくある失敗:
 * - LINE_MESSAGING_ACCESS_TOKEN 未設定 → 送信スキップ
 * - 相手が公式アカウントを友だち追加していない / ブロック → 400（リトライ不可）
 * - 月間の無料メッセージ上限超過 → 429
 */
export async function sendLineMessage(lineUserId: string, message: string, opts: LineSendOptions = {}): Promise<LineResult> {
  // 管理画面（設定 → LINE通知）で一括休止されている場合は、ここで送信を止める（送信の入口はこの関数だけ）
  if (!opts.bypassPause && !(await isLineNotificationsEnabled())) {
    console.warn('[LINE] 通知休止中のため送信スキップ:', { lineUserId })
    return { ok: false, skipped: true, error: 'LINE通知は休止中' }
  }
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN
  if (!token) {
    console.warn('[LINE] LINE_MESSAGING_ACCESS_TOKEN 未設定のため送信スキップ:', { lineUserId })
    return { ok: false, skipped: true, error: 'LINE 未設定' }
  }

  let lastError = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(`${LINE_API_BASE}/message/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages: [{ type: 'text', text: message }],
        }),
      })
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`[LINE] 送信エラー（ネットワーク・${attempt}/${MAX_ATTEMPTS}回目）:`, { lineUserId, error: lastError })
      if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt)
      continue
    }

    if (res.ok) {
      console.log('[LINE] 送信成功:', { lineUserId })
      return { ok: true }
    }

    const bodyText = await res.text().catch(() => '')
    lastError = `LINE API ${res.status} ${bodyText}`
    // 4xx（友だち未追加・ブロック・不正 userId 等）はリトライしても無駄なので即中断
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      console.error('[LINE] 送信失敗（リトライ不可）:', { lineUserId, status: res.status, body: bodyText })
      return { ok: false, error: lastError }
    }
    console.error(`[LINE] 送信失敗（${attempt}/${MAX_ATTEMPTS}回目）:`, { lineUserId, status: res.status })
    if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt)
  }
  return { ok: false, error: lastError }
}

/**
 * 複数ユーザーにLINEメッセージを送信し、各ユーザーの結果を返す。
 */
export async function sendLineMessages(
  lineUserIds: string[],
  message: string,
  opts: LineSendOptions = {}
): Promise<{ lineUserId: string; result: LineResult }[]> {
  const results = await Promise.all(
    lineUserIds.map(async id => ({ lineUserId: id, result: await sendLineMessage(id, message, opts) }))
  )
  const failed = results.filter(r => !r.result.ok && !r.result.skipped)
  if (failed.length > 0) {
    console.error(`[LINE] ${failed.length}/${lineUserIds.length} 件送信失敗`)
  }
  return results
}
