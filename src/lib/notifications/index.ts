import { createAdminClient } from '@/lib/supabase/admin'
import { sendMail, type SendResult } from './email'
import { sendLineMessages, sendLineMessage, type LineResult } from './line'
import { logNotification } from './log'

// メール送信結果を notification_log に記録する（宛先は要約文字列）。
async function logMail(category: string, recipient: string, subject: string, res: SendResult) {
  await logNotification({
    category,
    channel: 'email',
    recipient: recipient || '(宛先なし)',
    subject,
    status: res.ok ? 'success' : 'failed',
    error: res.ok ? undefined : res.skipped ? `skip: ${res.error}` : res.error,
  })
}

// LINE送信結果を notification_log に記録する。
async function logLine(category: string, subject: string, results: { lineUserId: string; result: LineResult }[]) {
  await Promise.all(
    results.map(r =>
      logNotification({
        category,
        channel: 'line',
        recipient: r.lineUserId,
        subject,
        status: r.result.ok ? 'success' : 'failed',
        error: r.result.ok ? undefined : r.result.skipped ? `skip: ${r.result.error}` : r.result.error,
      })
    )
  )
}

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
  const CATEGORY = 'join_request'

  // 依頼先店舗の管理者（店長・リーダー）
  const { data: managers } = await db
    .from('team_managers')
    .select('employee_id')
    .eq('team_id', team.id)
  const managerIds = (managers ?? []).map(m => m.employee_id)

  let managerEmails: string[] = []
  let managerLineIds: string[] = []
  if (managerIds.length > 0) {
    const { data: managerEmployees } = await db
      .from('employees')
      .select('email, line_user_id')
      .in('id', managerIds)
      .eq('status', 'approved')
    managerEmails = (managerEmployees ?? []).map(e => e.email).filter((e): e is string => !!e)
    managerLineIds = (managerEmployees ?? []).map(e => e.line_user_id).filter((e): e is string => !!e)
  }

  // システム管理者（最終保険：店舗に管理者が未設定でも必ず承認者へ届くように、常に通知に含める）
  const { data: sysAdmins } = await db
    .from('employees')
    .select('email, line_user_id')
    .in('system_permission', ['developer', 'ops_admin'])
    .eq('status', 'approved')
  const sysAdminEmails = (sysAdmins ?? []).map(e => e.email).filter((e): e is string => !!e)
  const sysAdminLineIds = (sysAdmins ?? []).map(e => e.line_user_id).filter((e): e is string => !!e)

  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
  const approvalUrl = `${systemUrl}/approval`

  // 1. 本人宛メール（No-Reply）
  const applicantSubject = '【Mission Board】参加依頼を受け付けました'
  const r1 = await sendMail({
    to: applicant.email,
    subject: applicantSubject,
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
  })
  await logMail(CATEGORY, applicant.email, applicantSubject, r1)

  // 2. 承認者宛メール（店舗の管理者宛、CC: システム管理者。管理者未設定ならシステム管理者宛）
  //    重複を除いた上で、宛先が空にならないよう常にシステム管理者を含める。
  const primaryTo = managerEmails.length > 0 ? managerEmails : sysAdminEmails
  const ccAddresses = managerEmails.length > 0 ? sysAdminEmails.filter(e => !primaryTo.includes(e)) : []
  const approverSubject = `【Mission Board】参加許諾依頼: ${applicant.name}（${team.name}）`
  const r2 = await sendMail({
    to: primaryTo,
    cc: ccAddresses.length > 0 ? ccAddresses : undefined,
    subject: approverSubject,
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
  })
  await logMail(CATEGORY, [...primaryTo, ...ccAddresses].join(', '), approverSubject, r2)

  // 3. 承認者へLINE通知（店舗の管理者へ。未設定ならシステム管理者へ。重複除去）
  const lineTargets = [...new Set(managerLineIds.length > 0 ? managerLineIds : sysAdminLineIds)]
  if (lineTargets.length > 0) {
    const lineResults = await sendLineMessages(
      lineTargets,
      `【参加依頼】\n${applicant.name} さんが「${team.name}」への参加を希望しています。\n\n確認: ${approvalUrl}`
    )
    await logLine(CATEGORY, `参加許諾依頼: ${applicant.name}`, lineResults)
  }
}

interface InvitationParams {
  invitationId: string
  inviter: { name: string }
  target: { name: string; email: string; line_user_id: string | null }
  teamName: string
  projectTeamName?: string
  customMessage?: string
}

/**
 * チーム招待の通知（既存メンバー宛）
 * - 宛先本人にメール送信
 * - 宛先本人にLINE通知（連携済みの場合）
 */
export async function sendInvitationNotification({
  invitationId,
  inviter,
  target,
  teamName,
  projectTeamName,
  customMessage,
}: InvitationParams) {
  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
  const inviteUrl = `${systemUrl}/invite/${invitationId}`

  const bodyLines = [
    `${target.name} 様`,
    '',
    `${inviter.name}さんから、以下のチームへの参加依頼が届いています。`,
    '内容をご確認の上、下記の招待リンクから参加手続きをお願いします。',
    '',
    `  店舗・部署: ${teamName}`,
    ...(projectTeamName ? [`  チーム: ${projectTeamName}`] : []),
    '',
  ]
  if (customMessage && customMessage.trim()) {
    bodyLines.push('-- メッセージ --', customMessage.trim(), '')
  }
  bodyLines.push('▼参加する', inviteUrl)

  const inviteSubject = `【Mission Board】${inviter.name}さんから参加依頼が届いています`
  const rMail = await sendMail({
    to: target.email,
    subject: inviteSubject,
    body: bodyLines.join('\n'),
  })
  await logMail('invitation', target.email, inviteSubject, rMail)

  if (target.line_user_id) {
    const lineLines = [
      `【チーム参加依頼】`,
      `${inviter.name}さんから参加依頼が届いています。`,
      '',
      `店舗・部署: ${teamName}`,
      ...(projectTeamName ? [`チーム: ${projectTeamName}`] : []),
    ]
    if (customMessage && customMessage.trim()) {
      lineLines.push('', customMessage.trim())
    }
    lineLines.push('', `▼参加する\n${inviteUrl}`)
    const rLine = await sendLineMessage(target.line_user_id, lineLines.join('\n'))
    await logLine('invitation', 'チーム参加依頼', [{ lineUserId: target.line_user_id, result: rLine }])
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
    .in('system_permission', ['developer', 'ops_admin'])
    .eq('status', 'approved')
  const sysAdminEmails = (sysAdmins ?? []).map(e => e.email)

  const systemUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'

  // 1. 本人宛メール（CC: 管理者）
  const approvalSubject = '【Mission Board】システム参加の準備が整いました'
  const rMail = await sendMail({
    to: employee.email,
    cc: sysAdminEmails,
    subject: approvalSubject,
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
  })
  await logMail('approval', employee.email, approvalSubject, rMail)

  // 2. 本人にLINE通知
  const { data: emp } = await db
    .from('employees')
    .select('line_user_id')
    .eq('id', employee.id)
    .single()
  if (emp?.line_user_id) {
    const rLine = await sendLineMessage(
      emp.line_user_id,
      `【Mission Board】\nシステム参加の準備が整いました。\n\nログインしてご利用ください。\n${systemUrl}`
    )
    await logLine('approval', 'システム参加の準備が整いました', [{ lineUserId: emp.line_user_id, result: rLine }])
  }
}
