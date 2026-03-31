import { NextResponse } from 'next/server'
import { sendMail } from '@/lib/notifications/email'

export async function GET() {
  // 環境変数の確認
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

  // デバッグ情報（一時的）
  return NextResponse.json({
    status: 'debug',
    GMAIL_USER: gmailUser,
    GMAIL_APP_PASSWORD_LENGTH: gmailPass.length,
    GMAIL_APP_PASSWORD_FIRST2: gmailPass.substring(0, 2),
    GMAIL_APP_PASSWORD_LAST2: gmailPass.substring(gmailPass.length - 2),
  })

  try {
    await sendMail({
      to: gmailUser,
      subject: '【できました表】メール送信テスト',
      body: 'このメールが届いていれば、Gmail SMTP の設定は正常です。',
    })
    return NextResponse.json({ status: 'ok', message: `テストメールを ${gmailUser} に送信しました` })
  } catch (err: unknown) {
    return NextResponse.json({
      status: 'error',
      message: 'メール送信に失敗しました',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
