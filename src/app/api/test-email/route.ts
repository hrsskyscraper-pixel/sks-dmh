import { NextResponse } from 'next/server'
import { sendMail } from '@/lib/notifications/email'

export async function GET() {
  const gmailUser = process.env.GMAIL_USER
  const gmailPass = process.env.GMAIL_APP_PASSWORD

  if (!gmailUser || !gmailPass) {
    return NextResponse.json({
      status: 'error',
      message: 'Gmail環境変数が未設定です',
      GMAIL_USER: gmailUser ? '設定済み' : '未設定',
      GMAIL_APP_PASSWORD: gmailPass ? '設定済み（' + gmailPass.length + '文字）' : '未設定',
    })
  }

  try {
    await sendMail({
      to: gmailUser,
      subject: '【できました表】メール送信テスト',
      body: 'このメールが届いていれば、Gmail SMTP の設定は正常です。',
    })
    return NextResponse.json({ status: 'ok', message: `テストメールを ${gmailUser} に送信しました` })
  } catch (e) {
    const err = e as Error
    return NextResponse.json({
      status: 'error',
      message: 'メール送信に失敗しました',
      error: err.message ?? String(e),
    })
  }
}
