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

  const { achievementIds, action, comment, praise } = await request.json()
  const praiseText: string | null = action === 'certified' && typeof praise === 'string' && praise.trim() ? praise.trim() : null
  if (
    !Array.isArray(achievementIds) ||
    achievementIds.length === 0 ||
    achievementIds.length > 500 ||
    !achievementIds.every((x: unknown) => typeof x === 'string') ||
    !action ||
    !['certified', 'rejected'].includes(action)
  ) {
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

  // 対象の achievement を取得（スキル名 + 申請者を結合）
  const { data: fetched } = await db
    .from('achievements')
    .select('id, employee_id, skill_id, status, skills(name, milestone_kind, milestone_cert), employees!achievements_employee_id_fkey(name, email, line_user_id)')
    .in('id', achievementIds)
  if (!fetched || fetched.length === 0) {
    return NextResponse.json({ error: '対象が見つかりません' }, { status: 404 })
  }

  // 自己承認の禁止と、担当の範囲（担当チームのメンバー・上の承認者として受け持つ店長）だけを処理できるかを確かめる
  // 1件でも範囲外が混ざっていたら、まとめて止める（一部だけ処理されると、画面と食い違うため）
  const scopeErr = await certifyScopeError(db, certifier, fetched)
  if (scopeErr) return NextResponse.json({ error: scopeErr }, { status: 403 })

  const trimmedComment = comment?.trim() || null

  // 一括更新。読んだときの状態のままの行だけを書く（2人が同時に押しても、処理・通知は1回だけ）。
  // 管理者は申請中以外も扱えるので、読んだ状態ごとに分けて更新する
  const patch = {
    status: action,
    certified_by: certifier.id,
    certified_at: new Date().toISOString(),
    certify_comment: trimmedComment,
    praise_comment: praiseText,
    is_read: false,
  }
  type AchStatus = (typeof fetched)[number]['status']
  const byStatus: Partial<Record<AchStatus, string[]>> = {}
  // すでに同じ状態のもの（古い画面から押し直したなど）は飛ばす。履歴・お知らせ・通知が二重にならないように
  for (const a of fetched) if (a.status !== action) (byStatus[a.status] ??= []).push(a.id)
  const updatedIds = new Set<string>()
  for (const [status, group] of Object.entries(byStatus) as [AchStatus, string[]][]) {
    const { data: rows, error: updateErr } = await db.from('achievements').update(patch).in('id', group).eq('status', status).select('id')
    if (updateErr) {
      console.error('スキル認定の一括更新に失敗:', updateErr.message)
      return NextResponse.json({ error: '更新できませんでした。時間をおいてもう一度お試しください' }, { status: 500 })
    }
    for (const r of rows ?? []) updatedIds.add(r.id)
  }
  // 後の処理（履歴・一言・社内資格・通知）は、実際に書けた行だけ
  const achievements = fetched.filter(a => updatedIds.has(a.id))
  if (achievements.length === 0) {
    return NextResponse.json({ error: 'ほかの方がすでに処理しました。画面を更新してください' }, { status: 409 })
  }
  const ids = achievements.map(a => a.id)

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

  // 本人への一言（公開）: 申請者ごとに1件のお知らせ（スキル名は列挙）
  if (praiseText) {
    const byEmp: Record<string, string[]> = {}
    for (const a of achievements) {
      const sk = a.skills as { name: string } | null
      ;(byEmp[a.employee_id] ??= []).push(sk?.name ?? '')
    }
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error: prErr } = await db.from('announcements').insert(
      Object.entries(byEmp).map(([employee_id, names]) => ({
        kind: 'praise' as const,
        subject_employee_id: employee_id,
        title: names.filter(Boolean).join('、'),
        body: praiseText,
        created_by: certifier.id,
        expires_at: expires,
      })),
    )
    if (prErr) console.error('一言のお知らせ投稿に失敗:', prErr.message)
  }

  // 級の行が認定されたら、社内資格の自動登録と級合格のお知らせ（1件ずつ。失敗しても認定は成立）
  if (action === 'certified') {
    for (const a of achievements) {
      const sk = a.skills as { milestone_cert?: string | null } | null
      if (!sk?.milestone_cert) continue
      await registerGradeCertification(db, { employeeId: a.employee_id, certName: sk.milestone_cert, actorId: certifier.id })
        .catch(err => console.error('社内資格の自動登録に失敗:', err))
    }
  }

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

  // 書けた件数を返す（ほかの方が先に処理した分は含まない）
  return NextResponse.json({ ok: true, count: ids.length, skipped: fetched.length - ids.length })
}
