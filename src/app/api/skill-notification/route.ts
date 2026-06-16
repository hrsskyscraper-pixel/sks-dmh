import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessages } from '@/lib/notifications/line'
import { canApprove } from '@/lib/permissions'

export async function POST(request: Request) {
  const { employeeId, skillName, skillNames, isReapply, comment } = await request.json()
  // 単一の skillName（従来）または skillNames[]（まとめて申請）のどちらかを受け付ける
  const names: string[] = Array.isArray(skillNames)
    ? skillNames.filter((n: unknown): n is string => typeof n === 'string')
    : skillName
      ? [skillName]
      : []
  if (!employeeId || names.length === 0) return NextResponse.json({ ok: false })
  const skillSummary = names.length === 1 ? names[0] : `${names.length}件のスキル`
  const skillListText = names.length === 1 ? names[0] : names.map(n => `・${n}`).join('\n')

  const db = createAdminClient()

  const { data: applicant } = await db.from('employees').select('name, email').eq('id', employeeId).single()
  if (!applicant) return NextResponse.json({ ok: false })

  const { data: memberTeams } = await db.from('team_members').select('team_id').eq('employee_id', employeeId)
  const { data: mgrTeams } = await db.from('team_managers').select('team_id').eq('employee_id', employeeId)
  const teamIds = [...new Set([...(memberTeams ?? []).map(m => m.team_id), ...(mgrTeams ?? []).map(m => m.team_id)])]
  if (teamIds.length === 0) return NextResponse.json({ ok: true })

  const { data: managers } = await db.from('team_managers').select('employee_id').in('team_id', teamIds)
  const managerIds = [...new Set((managers ?? []).map(m => m.employee_id).filter(id => id !== employeeId))]

  // 通知先は「承認権限を持つリーダー」に限定する。リーダー登録だけでは承認できないため、
  // 権限の無いリーダーに「承認してください」と送ると行き止まりになる（秋田の事例）。
  let recipients: { email: string; line_user_id: string | null }[] = []
  if (managerIds.length > 0) {
    const { data: managerEmployees } = await db
      .from('employees')
      .select('email, line_user_id, role, system_permission')
      .in('id', managerIds)
    recipients = (managerEmployees ?? []).filter(e => canApprove(e))
  }

  // 担当チームに承認できるリーダーが1人もいない場合は、申請が宙に浮かないよう
  // 上長（運用管理者・開発者）にエスカレーションする。
  if (recipients.length === 0) {
    const { data: admins } = await db
      .from('employees')
      .select('id, email, line_user_id')
      .in('system_permission', ['ops_admin', 'developer'])
      .eq('status', 'approved')
    recipients = (admins ?? []).filter(a => a.id !== employeeId)
  }
  if (recipients.length === 0) return NextResponse.json({ ok: true })

  const emails = recipients.map(e => e.email)
  const lineUserIds = recipients.filter(e => e.line_user_id).map(e => e.line_user_id!)

  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
  const approvalUrl = `${systemUrl}/approvals?tab=skill`
  const actionLabel = isReapply ? '再申請' : '申請'

  if (emails.length > 0) {
    await sendMail({
      to: emails,
      subject: `【Mission Board】スキル認定${actionLabel}: ${applicant.name}（${skillSummary}）`,
      body: [
        `${applicant.name} さんからスキル認定の${actionLabel}がありました。`,
        '',
        names.length === 1 ? `スキル: ${skillListText}` : `スキル:\n${skillListText}`,
        ...(comment ? [`コメント: ${comment}`] : []),
        '',
        `承認センターで確認してください。`,
        approvalUrl,
      ].join('\n'),
    }).catch(err => console.error('スキル申請メール送信失敗:', err))
  }

  if (lineUserIds.length > 0) {
    await sendLineMessages(
      lineUserIds,
      `【スキル認定 ${actionLabel}】\n${applicant.name} さんが次のスキルの認定を${actionLabel}しました。\n${skillListText}\n${comment ? `コメント: ${comment}\n` : ''}\n確認: ${approvalUrl}\nMission Board`
    ).catch(err => console.error('スキル申請LINE通知失敗:', err))
  }

  return NextResponse.json({ ok: true })
}
