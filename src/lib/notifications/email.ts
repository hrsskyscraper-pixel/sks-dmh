import nodemailer from 'nodemailer'
import { isEmailNotificationsEnabled } from '@/lib/settings'

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
export async function sendMail({ to, cc, subject, body }: SendMailParams): Promise<SendResult> {
  const from = `Mission Board <${process.env.GMAIL_USER}>`
  const toStr = Array.isArray(to) ? to.join(', ') : to
  const ccStr = cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined

  if (!(await isEmailNotificationsEnabled())) {
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
