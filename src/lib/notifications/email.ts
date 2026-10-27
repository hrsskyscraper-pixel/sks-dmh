import nodemailer from 'nodemailer'
import { isEmailNotificationsEnabled } from '@/lib/settings'
import { isPlaceholderEmail } from '@/lib/account-issue'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})

interface SendMailParams {
  to: string | string[]
  cc?: string | string[]
  subject: string
  body: string
  /** 一括休止に関係なく送る（運営チーム宛ての改善提案・Q&A など、件数が少なく確実に届けたいもの） */
  bypassPause?: boolean
}

export interface SendResult {
  ok: boolean
  skipped?: boolean
  error?: string
}

const MAX_ATTEMPTS = 3

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * メール送信。一時的な失敗に備えて最大3回リトライする（指数バックオフ）。
 * 例外は投げず、結果を { ok, error } で返す（呼び出し側でログ・可視化する）。
 *
 * 管理画面（設定 → メール通知）で一括停止されている場合は、ここで送信を止める。
 * メール送信の入口はこの関数だけなので、ここ1箇所で全通知に確実に効く。
 */
export async function sendMail({ to, cc, subject, body, bypassPause = false }: SendMailParams): Promise<SendResult> {
  const from = `Mission Board <${process.env.GMAIL_USER}>`
  // 発行したばかりでまだログインしていない方の仮のアドレス（@issue.invalid）には送らない（「名前 <x@…>」の形も見る）
  const real = (xs: string | string[]) => (Array.isArray(xs) ? xs : [xs]).filter(x => x && !isPlaceholderEmail(x.match(/<([^>]+)>/)?.[1] ?? x.trim()))
  // 宛先がすべて仮のアドレスで消えたときは送らない（写しを宛先に繰り上げると、本人宛の文面が別の人に届くため。
  // 承認者宛の通知は、宛先を集める側で仮のアドレスを先に外している）
  const toList = real(to)
  const ccList = cc ? real(cc) : []
  const toStr = toList.join(', ')
  const ccStr = ccList.length ? ccList.join(', ') : undefined

  if (!bypassPause && !(await isEmailNotificationsEnabled())) {
    console.warn('[メール] 通知休止中のため送信スキップ:', { to: toStr, subject })
    return { ok: false, skipped: true, error: 'メール通知は休止中' }
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[メール] Gmail 未設定のため送信スキップ:', { to: toStr, subject })
    return { ok: false, skipped: true, error: 'Gmail 未設定' }
  }
  if (!toStr) {
    return { ok: false, skipped: true, error: '宛先なし' }
  }

  let lastError = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await transporter.sendMail({
        from,
        to: toStr,
        cc: ccStr,
        subject,
        text: body,
        replyTo: undefined, // No-Reply
      })
      console.log(`[メール] 送信成功${attempt > 1 ? `（${attempt}回目）` : ''}:`, { to: toStr, subject })
      return { ok: true }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`[メール] 送信失敗（${attempt}/${MAX_ATTEMPTS}回目）:`, { to: toStr, subject, error: lastError })
      if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt) // 0.5s → 1.0s
    }
  }
  return { ok: false, error: lastError }
}
