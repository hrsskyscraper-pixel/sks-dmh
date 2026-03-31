import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail } from './email'
import { sendLineMessages, sendLineMessage } from './line'

interface JoinRequestParams {
  applicant: { id: string; name: string; email: string; avatar_url: string | null }
  team: { id: string; name: string }
  projectTeamName?: string
}

interface ApprovalParams {
  employee: { id: string; name: string; email: string }
  teamName: string
  approvedBy: string
}

/**
 * 参加依頼時の通知
 * - 参加依頼者本人にメール送信（依頼受付確認）
 * - 直属上長（店舗の店長・マネージャー）にメール送信（CC: システム管理者）
 * - 上長にLINE通知
 */
export async function sendJoinRequestNotification({ applicant, team, projectTeamName }: JoinRequestParams) {
  const db = createAdminClient()

  // 店舗の管理者（店長・マネージャー）を取得
  const { data: managers } = await db
    .from('team_managers')
    .select('employee_id')
    .eq('team_id', team.id)
  const managerIds = (managers ?? []).map(m => m.employee_id)

  let managerEmails: string[] = []
  let managerLineUserIds: string[] = []
  if (managerIds.length > 0) {
    const { data: managerEmployees } = await db
      .from('employees')
      .select('email, line_user_id')
      .in('id', managerIds)
    managerEmails = (managerEmployees ?? []).map(e => e.email)
    managerLineUserIds = (managerEmployees ?? []).filter(e => e.line_user_id).map(e => e.line_user_id!)
  }

  // システム管理者のメールを取得
  const { data: sysAdmins } = await db
    .from('employees')
    .select('email')
    .in('role', ['admin', 'ops_manager', 'executive'])
    .eq('status', 'approved')
  const sysAdminEmails = (sysAdmins ?? []).map(e => e.email)

  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
  const approvalUrl = `${systemUrl}/approval`

  // 1. 本人宛メール（No-Reply）
  await sendMail({
    to: applicant.email,
    subject: '【Growth Driver】参加依頼を受け付けました',
    body: [
      `${applicant.name} 様`,
      '',
      'システムへの参加依頼を受け付けました。',
      '',
      '管理者の確認が完了すると、',
      `${applicant.email} に確認完了のメールが送信されます。`,
      '',
      '確認完了メールを受信後、システムがご利用可能となります。',
      'その後、改めて以下のURLからログインしてください。',
      '',
      systemUrl,
      '',
      `申請店舗／部署: ${team.name}`,
      ...(projectTeamName ? [`申請チーム: ${projectTeamName}`] : []),
    ].join('\n'),
  }).catch(err => console.error('本人宛メール送信失敗:', err))

  // 2. 管理者宛メール（直属上長宛、CC: システム管理者）
  const toAddresses = managerEmails.length > 0 ? managerEmails : sysAdminEmails
  const ccAddresses = managerEmails.length > 0 ? sysAdminEmails : undefined
  if (toAddresses.length > 0) {
    await sendMail({
      to: toAddresses,
      cc: ccAddresses,
      subject: `【Growth Driver】参加許諾依頼: ${applicant.name}（${team.name}）`,
      body: [
        `${applicant.name} さん（${applicant.email}）からシステムへの参加依頼がありました。`,
        '',
        `申請店舗／部署: ${team.name}`,
        ...(projectTeamName ? [`申請チーム: ${projectTeamName}`] : []),
        '',
        '以下のリンクから参加許諾画面にアクセスし、',
        '必要な設定を行った上で承認してください。',
        '',
        `参加許諾画面: ${approvalUrl}`,
      ].join('\n'),
    }).catch(err => console.error('管理者宛メール送信失敗:', err))
  }

  // 3. 管理者にLINE通知
  if (managerLineUserIds.length > 0) {
    await sendLineMessages(
      managerLineUserIds,
      `【参加依頼】\n${applicant.name} さんが「${team.name}」への参加を希望しています。\n\n確認: ${approvalUrl}`
    ).catch(err => console.error('管理者LINE通知失敗:', err))
  }
}

/**
 * 参加承認時の通知
 * - 承認された本人にメール送信（CC: 管理者）
 * - 承認された本人にLINE通知
 */
export async function sendApprovalNotification({ employee, teamName, approvedBy }: ApprovalParams) {
  const db = createAdminClient()

  // 承認者情報
  const { data: approver } = await db
    .from('employees')
    .select('name, email')
    .eq('id', approvedBy)
    .single()

  // システム管理者のメールを取得（CC用）
  const { data: sysAdmins } = await db
    .from('employees')
    .select('email')
    .in('role', ['admin', 'ops_manager', 'executive'])
    .eq('status', 'approved')
  const sysAdminEmails = (sysAdmins ?? []).map(e => e.email)

  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'

  // 1. 本人宛メール（CC: 管理者）
  await sendMail({
    to: employee.email,
    cc: sysAdminEmails,
    subject: '【Growth Driver】システム参加の準備が整いました',
    body: [
      `${employee.name} 様`,
      '',
      'システム参加の準備が整いました。',
      '',
      `所属: ${teamName}`,
      `承認者: ${approver?.name ?? '管理者'}`,
      '',
      '以下のURLからログインしてご利用ください。',
      '',
      systemUrl,
    ].join('\n'),
  }).catch(err => console.error('承認メール送信失敗:', err))

  // 2. 本人にLINE通知
  const { data: emp } = await db
    .from('employees')
    .select('line_user_id')
    .eq('id', employee.id)
    .single()
  if (emp?.line_user_id) {
    await sendLineMessage(
      emp.line_user_id,
      `【Growth Driver】\nシステム参加の準備が整いました。\n\nログインしてご利用ください。\n${systemUrl}`
    ).catch(err => console.error('承認LINE通知失敗:', err))
  }
}
