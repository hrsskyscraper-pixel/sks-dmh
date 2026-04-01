import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessage } from '@/lib/notifications/line'

export async function POST(request: Request) {
  const { employeeId, skillName, action, comment, certifierName } = await request.json()
  if (!employeeId || !skillName || !action) return NextResponse.json({ ok: false })

  const db = createAdminClient()
  const { data: emp } = await db.from('employees').select('name, email, line_user_id').eq('id', employeeId).single()
  if (!emp) return NextResponse.json({ ok: false })

  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
  const isCertified = action === 'certified'
  const statusText = isCertified ? '認定されました' : '差し戻されました'

  // メール通知
  await sendMail({
    to: emp.email,
    subject: `【Growth Driver】スキル${isCertified ? '認定' : '差し戻し'}: ${skillName}`,
    body: [
      `${emp.name} 様`,
      '',
      `スキル「${skillName}」が${statusText}。`,
      '',
      `認定者: ${certifierName ?? '管理者'}`,
      ...(comment ? [`コメント: ${comment}`] : []),
      '',
      `詳細はこちらから確認できます。`,
      systemUrl,
    ].join('\n'),
  }).catch(err => console.error('スキル結果メール送信失敗:', err))

  // LINE通知
  if (emp.line_user_id) {
    await sendLineMessage(
      emp.line_user_id,
      `【Growth Driver】\nスキル「${skillName}」が${statusText}。\n${comment ? `コメント: ${comment}\n` : ''}確認: ${systemUrl}`
    ).catch(err => console.error('スキル結果LINE通知失敗:', err))
  }

  return NextResponse.json({ ok: true })
}
