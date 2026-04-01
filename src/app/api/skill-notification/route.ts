import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from '@/lib/notifications/email'
import { sendLineMessages } from '@/lib/notifications/line'

export async function POST(request: Request) {
  const { employeeId, skillName } = await request.json()
  if (!employeeId || !skillName) return NextResponse.json({ ok: false })

  const db = createAdminClient()

  // 申請者情報
  const { data: applicant } = await db.from('employees').select('name, email').eq('id', employeeId).single()
  if (!applicant) return NextResponse.json({ ok: false })

  // 申請者が所属するチームのマネージャーを取得
  const { data: memberTeams } = await db.from('team_members').select('team_id').eq('employee_id', employeeId)
  const { data: mgrTeams } = await db.from('team_managers').select('team_id').eq('employee_id', employeeId)
  const teamIds = [...new Set([...(memberTeams ?? []).map(m => m.team_id), ...(mgrTeams ?? []).map(m => m.team_id)])]

  if (teamIds.length === 0) return NextResponse.json({ ok: true })

  // チームのマネージャー（認定者候補）を取得
  const { data: managers } = await db.from('team_managers').select('employee_id').in('team_id', teamIds)
  const managerIds = [...new Set((managers ?? []).map(m => m.employee_id).filter(id => id !== employeeId))]

  if (managerIds.length === 0) return NextResponse.json({ ok: true })

  const { data: managerEmployees } = await db.from('employees').select('email, line_user_id').in('id', managerIds)
  const emails = (managerEmployees ?? []).map(e => e.email)
  const lineUserIds = (managerEmployees ?? []).filter(e => e.line_user_id).map(e => e.line_user_id!)

  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'

  // メール通知
  if (emails.length > 0) {
    await sendMail({
      to: emails,
      subject: `【Growth Driver】スキル認定申請: ${applicant.name}（${skillName}）`,
      body: [
        `${applicant.name} さんからスキル認定の申請がありました。`,
        '',
        `スキル: ${skillName}`,
        '',
        `承認センターで確認してください。`,
        systemUrl + '/approvals',
      ].join('\n'),
    }).catch(err => console.error('スキル申請メール送信失敗:', err))
  }

  // LINE通知
  if (lineUserIds.length > 0) {
    await sendLineMessages(
      lineUserIds,
      `【スキル認定申請】\n${applicant.name} さんが「${skillName}」の認定を申請しました。\n\n確認: ${systemUrl}/approvals`
    ).catch(err => console.error('スキル申請LINE通知失敗:', err))
  }

  return NextResponse.json({ ok: true })
}
