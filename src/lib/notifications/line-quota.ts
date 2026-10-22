/**
 * LINE の無料枠（コミュニケーションプランは月200通）を超えないための歯止め（2026-10-22 社長承認）。
 * LINE の API で「今月の上限」と「今月使った数」を取り、残りが予備を切ったら送らない。
 * 数えるのは「届いた人数」（1つのお知らせを5人に送れば5通）。
 *
 * 注意: 残りの記憶はサーバーのインスタンスごと（60秒）で、同時に送ると予備の範囲で少しはみ出しうる。
 * 無料のプランなら超えた分は LINE 側で断られる（429）だけで請求は起きないが、有料プランに上げると
 * 超えた分が従量で課金される。プランを変えるときは、この歯止めを見直すこと。
 */

const LINE_API_BASE = 'https://api.line.me/v2/bot'
/** 上限の手前で止める予備（ほかの経路の送信や、取得の遅れに備える） */
export const LINE_QUOTA_RESERVE = 10
/** 取得した値を使い回す時間（同じ関数の中で何度も問い合わせない） */
const CACHE_MS = 60 * 1000
/** 取得できなかったときに「送らない」を続ける時間（一時的なエラーで長く止めないよう短くする） */
const FAIL_CACHE_MS = 10 * 1000

let cache: { at: number; remaining: number | null; failed?: boolean } | null = null

/** 今月あと何通送れるか（予備を引いた数）。上限なしのプランなら null。取得できなければ 0（送らない側に倒す） */
export async function getLineQuotaRemaining(): Promise<number | null> {
  if (cache && Date.now() - cache.at < (cache.failed ? FAIL_CACHE_MS : CACHE_MS)) return cache.remaining
  const token = process.env.LINE_MESSAGING_ACCESS_TOKEN
  if (!token) return 0
  try {
    const headers = { Authorization: `Bearer ${token}` }
    const [qRes, cRes] = await Promise.all([
      fetch(`${LINE_API_BASE}/message/quota`, { headers, cache: 'no-store' }),
      fetch(`${LINE_API_BASE}/message/quota/consumption`, { headers, cache: 'no-store' }),
    ])
    if (!qRes.ok || !cRes.ok) {
      console.error('[LINE] 無料枠の取得に失敗（送らない側に倒す）:', qRes.status, cRes.status)
      cache = { at: Date.now(), remaining: 0, failed: true }
      return 0
    }
    const quota = (await qRes.json()) as { type?: string; value?: number }
    const used = (await cRes.json()) as { totalUsage?: number }
    const remaining = quota.type === 'limited' && typeof quota.value === 'number'
      ? Math.max(0, quota.value - (used.totalUsage ?? 0) - LINE_QUOTA_RESERVE)
      : null
    cache = { at: Date.now(), remaining }
    return remaining
  } catch (e) {
    console.error('[LINE] 無料枠の取得に失敗（送らない側に倒す）:', e)
    cache = { at: Date.now(), remaining: 0, failed: true }
    return 0
  }
}

/** 送った分を手元の残りから引く（次の問い合わせまでのあいだ、同じ関数で送りすぎないように） */
export function consumeLineQuota(n: number) {
  if (cache && cache.remaining !== null) cache.remaining = Math.max(0, cache.remaining - n)
}
