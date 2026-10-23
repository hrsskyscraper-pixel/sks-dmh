import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessage } from '@/lib/notifications/line'
import { canApprove } from '@/lib/permissions'
import { registerGradeCertification } from '@/lib/grade-registration'
import { certifyScopeError } from '@/lib/approval-scope'
import { notLeftFilter } from '@/lib/left'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const db = createAdminClient()

  // 認定者の権限確認
  const { data: certifier } = await db
    .from('employees')
    .select('id, name, role, system_permission')
    .eq('auth_user_id', user.id)
    .or(notLeftFilter())
    .single()
  if (!certifier || !canApprove(certifier)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { achievementId, action, comment, praise } = await request.json()
  const praiseText: string | null = action === 'certified' && typeof praise === 'string' && praise.trim() ? praise.trim() : null
  if (!achievementId || !action || !['certified', 'rejected'].includes(action)) {
    return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 })
  }
  // 一言・コメントの長さに上限（公開のお知らせ・LINE の文字数を超えないように）
  if ((typeof comment === 'string' && comment.length > 1000) || (typeof praise === 'string' && praise.length > 1000)) {
    return NextResponse.json({ error: 'コメント・一言は1000文字以内にしてください' }, { status: 400 })
  }
  // 差し戻し（rejected）は理由コメントを必須にする（本人に理由を伝えるため）
  if (action === 'rejected' && !comment?.trim()) {
    return NextResponse.json({ error: '差し戻しの場合はコメント（理由）が必須です' }, { status: 400 })
  }

  // 対象の achievement を取得
  const { data: achievement } = await db
    .from('achievements')
    .select('id, employee_id, skill_id, status, skills(name, milestone_kind, milestone_cert), employees!achievements_employee_id_fkey(name, email, line_user_id)')
    .eq('id', achievementId)
    .single()
  if (!achievement) return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })

  // 自己承認の禁止と、担当の範囲（担当チームのメンバー・上の承認者として受け持つ店長）だけを処理できるかを確かめる
  let scopeErr: string | null
  try {
    scopeErr = await certifyScopeError(db, certifier, [achievement])
  } catch (e) {
    console.error('承認範囲の確認に失敗:', e)
    return NextResponse.json({ error: '確認に失敗しました。時間をおいてもう一度お試しください' }, { status: 503 })
  }
  if (scopeErr) return NextResponse.json({ error: scopeErr }, { status: 403 })
  // すでに同じ状態（古い画面から押し直したなど）なら、何もしない。履歴・お知らせ・通知が二重にならないように
  if (achievement.status === action) {
    return NextResponse.json({ error: 'ほかの方がすでに処理しました。画面を更新してください' }, { status: 409 })
  }

  // 更新。読んだときの状態のままのときだけ書く（2人が同時に押しても、処理・通知は1回だけ）
  const { data: updated, error: updateErr } = await db.from('achievements').update({
    status: action,
    certified_by: certifier.id,
    certified_at: new Date().toISOString(),
    certify_comment: comment?.trim() || null,
    praise_comment: praiseText,
    is_read: false,
  }).eq('id', achievementId).eq('status', achievement.status).select('id')

  if (updateErr) {
    console.error('スキル認定の更新に失敗:', updateErr.message)
    return NextResponse.json({ error: '更新できませんでした。時間をおいてもう一度お試しください' }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'ほかの方がすでに処理しました。画面を更新してください' }, { status: 409 })
  }

  // 履歴記録
  await db.from('achievement_history').insert({
    achievement_id: achievementId,
    action: action === 'certified' ? 'certify' : 'reject',
    actor_id: certifier.id,
    comment: comment?.trim() || null,
  })

  // 本人への一言（公開）: お知らせ（kind='praise'）として本日のお知らせ／タイムラインに出す
  if (praiseText) {
    const sk = achievement.skills as { name: string } | null
    await db.from('announcements').insert({
      kind: 'praise',
      subject_employee_id: achievement.employee_id,
      title: sk?.name ?? null,
      body: praiseText,
      created_by: certifier.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }).then(({ error }) => { if (error) console.error('一言のお知らせ投稿に失敗:', error.message) })
  }

  // 級の行が認定されたら、社内資格の自動登録と級合格のお知らせ（失敗しても認定は成立しているので握りつぶす）
  if (action === 'certified') {
    const sk = achievement.skills as { milestone_cert?: string | null } | null
    if (sk?.milestone_cert) {
      await registerGradeCertification(db, { employeeId: achievement.employee_id, certName: sk.milestone_cert, actorId: certifier.id })
        .catch(err => console.error('社内資格の自動登録に失敗:', err))
    }
  }

  // 通知（メール / LINE）はレスポンス送出後に実行する。
  // メール/LINE送信は数秒かかることがあり、待つと操作がもっさりするため。
  // after() は Vercel 上でレスポンス後も関数を生かして実行を保証する。
  after(async () => {
    const emp = achievement.employees as { name: string; email: string; line_user_id: string | null } | null
    const skill = achievement.skills as { name: string } | null
    if (!emp || !skill) return

    const isCertified = action === 'certified'
    const statusText = isCertified ? '認定されました' : '差し戻されました'
    const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
    const skillsUrl = `${systemUrl}/skills?tab=${isCertified ? 'certified' : 'rejected'}`

    // メール
    await sendMail({
      to: emp.email,
      subject: `【Mission Board】スキル${isCertified ? '認定' : '差し戻し'}: ${skill.name}`,
      body: [
        `${emp.name} 様`,
        '',
        `スキル「${skill.name}」が${statusText}。`,
        '',
        `${isCertified ? '認定者' : '差し戻し者'}: ${certifier.name}`,
        ...(comment?.trim() ? [`コメント: ${comment.trim()}`] : []),
        ...(praiseText ? [`一言: ${praiseText}`] : []),
        '',
        `詳細はこちらから確認できます。`,
        skillsUrl,
      ].join('\n'),
    }).catch(err => console.error('スキル結果メール送信失敗:', err))

    // LINE
    if (emp.line_user_id) {
      await sendLineMessage(
        emp.line_user_id,
        `【スキル認定 ${isCertified ? '承認' : '差し戻し'}】\nスキル「${skill.name}」が${statusText}。\n${isCertified ? '認定者' : '差し戻し者'}: ${certifier.name}\n${comment?.trim() ? `コメント: ${comment.trim()}\n` : ''}${praiseText ? `一言: ${praiseText}\n` : ''}\n確認: ${skillsUrl}\nMission Board`
      ).catch(err => console.error('スキル結果LINE通知失敗:', err))
    }
  })

  return NextResponse.json({ ok: true })
}
