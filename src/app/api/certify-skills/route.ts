import { NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessage } from '@/lib/notifications/line'
import { canApprove } from '@/lib/permissions'

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
    .single()
  if (!certifier || !canApprove(certifier)) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { achievementIds, action, comment } = await request.json()
  if (
    !Array.isArray(achievementIds) ||
    achievementIds.length === 0 ||
    !action ||
    !['certified', 'rejected'].includes(action)
  ) {
    return NextResponse.json({ error: '不正なリクエスト' }, { status: 400 })
  }
  // 差し戻し（rejected）は理由コメントを必須にする（本人に理由を伝えるため）
  if (action === 'rejected' && !comment?.trim()) {
    return NextResponse.json({ error: '差し戻しの場合はコメント（理由）が必須です' }, { status: 400 })
  }

  // 対象の achievement を取得（スキル名 + 申請者を結合）
  const { data: achievements } = await db
    .from('achievements')
    .select('id, employee_id, skill_id, status, skills(name), employees!achievements_employee_id_fkey(name, email, line_user_id)')
    .in('id', achievementIds)
  if (!achievements || achievements.length === 0) {
    return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })
  }

  const ids = achievements.map(a => a.id)
  const trimmedComment = comment?.trim() || null

  // 一括更新
  const { error: updateErr } = await db.from('achievements').update({
    status: action,
    certified_by: certifier.id,
    certified_at: new Date().toISOString(),
    certify_comment: trimmedComment,
    is_read: false,
  }).in('id', ids)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 履歴記録（各件）
  const historyAction: 'certify' | 'reject' = action === 'certified' ? 'certify' : 'reject'
  await db.from('achievement_history').insert(
    ids.map(achievement_id => ({
      achievement_id,
      action: historyAction,
      actor_id: certifier.id,
      comment: trimmedComment,
    }))
  )

  // 通知（メール / LINE）はレスポンス送出後に実行する。申請者ごとに1通にまとめる。
  after(async () => {
    type Applicant = { name: string; email: string; line_user_id: string | null }

    // 申請者ごとに対象スキル名をまとめる
    const byApplicant = new Map<string, { applicant: Applicant; skillNames: string[] }>()
    for (const a of achievements) {
      const applicant = a.employees as Applicant | null
      const skill = a.skills as { name: string } | null
      if (!applicant) continue
      const skillName = skill?.name ?? 'スキル'
      const entry = byApplicant.get(a.employee_id)
      if (entry) entry.skillNames.push(skillName)
      else byApplicant.set(a.employee_id, { applicant, skillNames: [skillName] })
    }

    const isCertified = action === 'certified'
    const statusText = isCertified ? '認定されました' : '差し戻されました'
    const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
    const skillsUrl = `${systemUrl}/skills?tab=${isCertified ? 'certified' : 'rejected'}`

    for (const { applicant, skillNames } of byApplicant.values()) {
      const skillList = skillNames.map(n => `・${n}`).join('\n')
      const skillSummary = skillNames.length === 1 ? `「${skillNames[0]}」` : `${skillNames.length}件のスキル`

      // メール
      await sendMail({
        to: applicant.email,
        subject: `【Mission Board】スキル${isCertified ? '認定' : '差し戻し'}: ${skillSummary}`,
        body: [
          `${applicant.name} 様`,
          '',
          `次のスキルが${statusText}。`,
          skillList,
          '',
          `${isCertified ? '認定者' : '差し戻し者'}: ${certifier.name}`,
          ...(trimmedComment ? [`コメント: ${trimmedComment}`] : []),
          '',
          `詳細はこちらから確認できます。`,
          skillsUrl,
        ].join('\n'),
      }).catch(err => console.error('スキル結果メール送信失敗:', err))

      // LINE
      if (applicant.line_user_id) {
        await sendLineMessage(
          applicant.line_user_id,
          `【スキル認定 ${isCertified ? '承認' : '差し戻し'}】\n次のスキルが${statusText}。\n${skillList}\n${isCertified ? '認定者' : '差し戻し者'}: ${certifier.name}\n${trimmedComment ? `コメント: ${trimmedComment}\n` : ''}\n確認: ${skillsUrl}\nMission Board`
        ).catch(err => console.error('スキル結果LINE通知失敗:', err))
      }
    }
  })

  return NextResponse.json({ ok: true })
}
