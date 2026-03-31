import nodemailer from 'nodemailer'

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

export async function sendMail({ to, cc, subject, body }: SendMailParams) {
  const from = `Growth Driver <${process.env.GMAIL_USER}>`
  const toStr = Array.isArray(to) ? to.join(', ') : to
  const ccStr = cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[メール] Gmail 未設定のため送信スキップ:', { to: toStr, subject })
    return
  }

  try {
    await transporter.sendMail({
      from,
      to: toStr,
      cc: ccStr,
      subject,
      text: body,
      replyTo: undefined, // No-Reply
    })
    console.log('[メール] 送信成功:', { to: toStr, subject })
  } catch (err) {
    console.error('[メール] 送信失敗:', err)
    throw err
  }
}
