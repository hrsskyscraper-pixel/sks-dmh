import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessage } from '@/lib/notifications/line'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const db = createAdminClient()

  // 認定者の権限確認
  const { data: certifier } = await db
    .from('employees')
    .select('id, name, role')
    .eq('auth_user_id', user.id)
    .single()
  if (!certifier || !['store_manager', 'manager', 'admin', 'ops_manager', 'executive'].includes(certifier.role)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { achievementId, action, comment } = await request.json()
  if (!achievementId || !action || !['certified', 'rejected'].includes(action)) {
    return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 })
  }

  // 対象の achievement を取得
  const { data: achievement } = await db
    .from('achievements')
    .select('id, employee_id, skill_id, status, skills(name), employees!achievements_employee_id_fkey(name, email, line_user_id)')
    .eq('id', achievementId)
    .single()
  if (!achievement) return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })

  // 更新
  const { error: updateErr } = await db.from('achievements').update({
    status: action,
    certified_by: certifier.id,
    certified_at: new Date().toISOString(),
    certify_comment: comment?.trim() || null,
    is_read: false,
  }).eq('id', achievementId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 履歴記録
  await db.from('achievement_history').insert({
    achievement_id: achievementId,
    action: action === 'certified' ? 'certify' : 'reject',
    actor_id: certifier.id,
    comment: comment?.trim() || null,
  })

  // 通知
  const emp = achievement.employees as { name: string; email: string; line_user_id: string | null } | null
  const skill = achievement.skills as { name: string } | null
  const isCertified = action === 'certified'
  const statusText = isCertified ? '認定されました' : '差し戻されました'
  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'

  const skillsUrl = `${systemUrl}/skills?tab=${isCertified ? 'certified' : 'pending'}`

  if (emp && skill) {
    // メール
    await sendMail({
      to: emp.email,
      subject: `【Growth Driver】スキル${isCertified ? '認定' : '差し戻し'}: ${skill.name}`,
      body: [
        `${emp.name} 様`,
        '',
        `スキル「${skill.name}」が${statusText}。`,
        '',
        `${isCertified ? '認定者' : '差し戻し者'}: ${certifier.name}`,
        ...(comment?.trim() ? [`コメント: ${comment.trim()}`] : []),
        '',
        `詳細はこちらから確認できます。`,
        skillsUrl,
      ].join('\n'),
    }).catch(err => console.error('スキル結果メール送信失敗:', err))

    // LINE
    if (emp.line_user_id) {
      await sendLineMessage(
        emp.line_user_id,
        `【スキル認定 ${isCertified ? '承認' : '差し戻し'}】\nスキル「${skill.name}」が${statusText}。\n${isCertified ? '認定者' : '差し戻し者'}: ${certifier.name}\n${comment?.trim() ? `コメント: ${comment.trim()}\n` : ''}\n確認: ${skillsUrl}\nGrowth Driver`
      ).catch(err => console.error('スキル結果LINE通知失敗:', err))
    }
  }

  return NextResponse.json({ ok: true })
}
