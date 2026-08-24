import { sendMail } from './email'
import { sendLineMessages } from './line'
import { logNotification } from './log'
import { getOpsAdmins, getDevelopers, getExecs, getEmployeeRecipient, type Recipient } from '@/lib/improvements'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'
const LOG_CATEGORY = 'improvement'

export interface ImprovementReq {
  id: string
  title: string
  description: string
  requester_id: string
  ops_proposal?: string | null
  reject_reason?: string | null
  completion_note?: string | null
}

function url(req: ImprovementReq) {
  return `${APP_URL}/improvements/${req.id}`
}

function dedupe(list: Recipient[]): Recipient[] {
  const seen = new Set<string>()
  return list.filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

/** 宛先一覧へメール＋LINEを送り、結果を notification_log に記録する。 */
async function notify(recipients: Recipient[], subject: string, emailBody: string, lineMsg: string) {
  const people = dedupe(recipients)
  const emails = [...new Set(people.map(r => r.email).filter((e): e is string => !!e))]
  const lineIds = [...new Set(people.map(r => r.line_user_id).filter((e): e is string => !!e))]

  if (emails.length > 0) {
    const res = await sendMail({ to: emails, subject, body: emailBody })
    await logNotification({
      category: LOG_CATEGORY,
      channel: 'email',
      recipient: emails.join(', '),
      subject,
      status: res.ok ? 'success' : res.skipped ? 'skipped' : 'failed',
      error: res.ok ? undefined : res.error,
    })
  }
  if (lineIds.length > 0) {
    const results = await sendLineMessages(lineIds, lineMsg)
    await Promise.all(
      results.map(r =>
        logNotification({
          category: LOG_CATEGORY,
          channel: 'line',
          recipient: r.lineUserId,
          subject,
          status: r.result.ok ? 'success' : r.result.skipped ? 'skipped' : 'failed',
          error: r.result.ok ? undefined : r.result.error,
        })
      )
    )
  }
}

// ① 申請時 → 運営管理者 + 開発者（開発者は申請時点から共有）。申請者には受付連絡。
export async function notifyImprovementSubmitted(req: ImprovementReq) {
  const [ops, devs, requester] = await Promise.all([getOpsAdmins(), getDevelopers(), getEmployeeRecipient(req.requester_id)])
  await notify(
    [...ops, ...devs],
    `【改善提案】新規申請: ${req.title}`,
    [
      `改善提案が申請されました。運営管理者による確認・承認をお願いします。`,
      '',
      `件名: ${req.title}`,
      `内容: ${req.description}`,
      '',
      `確認: ${url(req)}`,
    ].join('\n'),
    `【改善提案・新規】\n${req.title}\n\n運営確認をお願いします。\n${url(req)}`
  )
  if (requester) {
    await notify(
      [requester],
      `【改善提案】申請を受け付けました: ${req.title}`,
      [`改善提案の申請を受け付けました。`, '', `件名: ${req.title}`, '', `進捗はこちらから確認できます:`, url(req)].join('\n'),
      `【改善提案】申請を受け付けました。\n${req.title}\n\n進捗: ${url(req)}`
    )
  }
}

// ② 運営承認（改善案提案）→ 意思決定者(役員) + 開発者。申請者に進捗連絡。
export async function notifyImprovementOpsApproved(req: ImprovementReq) {
  const [execs, devs, requester] = await Promise.all([getExecs(), getDevelopers(), getEmployeeRecipient(req.requester_id)])
  await notify(
    [...execs, ...devs],
    `【改善提案】役員承認のお願い: ${req.title}`,
    [
      `運営管理者が改善提案を承認し、改善案を提案しました。役員承認をお願いします。`,
      '',
      `件名: ${req.title}`,
      `改善案: ${req.ops_proposal ?? '(なし)'}`,
      '',
      `承認: ${url(req)}`,
    ].join('\n'),
    `【改善提案・役員承認待ち】\n${req.title}\n\n${url(req)}`
  )
  if (requester) {
    await notify(
      [requester],
      `【改善提案】運営が確認しました: ${req.title}`,
      [`あなたの改善提案を運営管理者が確認し、次のステップ（役員承認）に進みました。`, '', `件名: ${req.title}`, '', `進捗: ${url(req)}`].join('\n'),
      `【改善提案】運営が確認しました。\n${req.title}\n次の承認へ進みました。`
    )
  }
}

// ③ 運営却下 → 申請者 + 開発者。
export async function notifyImprovementOpsRejected(req: ImprovementReq) {
  const [devs, requester] = await Promise.all([getDevelopers(), getEmployeeRecipient(req.requester_id)])
  await notify(
    [...(requester ? [requester] : []), ...devs],
    `【改善提案】見送りとなりました: ${req.title}`,
    [`改善提案は運営管理者の確認の結果、今回は見送りとなりました。`, '', `件名: ${req.title}`, `理由: ${req.reject_reason ?? '(記載なし)'}`, '', url(req)].join('\n'),
    `【改善提案】今回は見送りとなりました。\n${req.title}\n理由: ${req.reject_reason ?? '(記載なし)'}`
  )
}

// ④ 役員承認 → 開発者 + 運営管理者 + 申請者。
export async function notifyImprovementExecApproved(req: ImprovementReq) {
  const [devs, ops, requester] = await Promise.all([getDevelopers(), getOpsAdmins(), getEmployeeRecipient(req.requester_id)])
  await notify(
    [...devs, ...ops, ...(requester ? [requester] : [])],
    `【改善提案】役員承認されました（開発対応へ）: ${req.title}`,
    [`改善提案が役員承認されました。開発対応に進みます。`, '', `件名: ${req.title}`, `改善案: ${req.ops_proposal ?? '(なし)'}`, '', url(req)].join('\n'),
    `【改善提案・承認】\n${req.title}\n開発対応に進みます。\n${url(req)}`
  )
}

// ⑤ 役員却下 → 申請者 + 運営管理者。
export async function notifyImprovementExecRejected(req: ImprovementReq) {
  const [ops, requester] = await Promise.all([getOpsAdmins(), getEmployeeRecipient(req.requester_id)])
  await notify(
    [...(requester ? [requester] : []), ...ops],
    `【改善提案】役員判断で見送りとなりました: ${req.title}`,
    [`改善提案は役員の判断により今回は見送りとなりました。`, '', `件名: ${req.title}`, `理由: ${req.reject_reason ?? '(記載なし)'}`, '', url(req)].join('\n'),
    `【改善提案】役員判断で見送りとなりました。\n${req.title}\n理由: ${req.reject_reason ?? '(記載なし)'}`
  )
}

// ⑥ 開発着手 → 申請者 + 運営管理者。
export async function notifyImprovementDevStarted(req: ImprovementReq) {
  const [ops, requester] = await Promise.all([getOpsAdmins(), getEmployeeRecipient(req.requester_id)])
  await notify(
    [...(requester ? [requester] : []), ...ops],
    `【改善提案】開発対応を開始しました: ${req.title}`,
    [`改善提案の開発対応を開始しました。`, '', `件名: ${req.title}`, '', `進捗: ${url(req)}`].join('\n'),
    `【改善提案】開発対応を開始しました。\n${req.title}`
  )
}

// ⑦ 完了 → 申請者 + 運営管理者 + 意思決定者（完了報告）。
export async function notifyImprovementCompleted(req: ImprovementReq) {
  const [ops, execs, requester] = await Promise.all([getOpsAdmins(), getExecs(), getEmployeeRecipient(req.requester_id)])
  await notify(
    [...(requester ? [requester] : []), ...ops, ...execs],
    `【改善提案】対応が完了しました: ${req.title}`,
    [`改善提案の対応が完了しました。ご協力ありがとうございました。`, '', `件名: ${req.title}`, `完了報告: ${req.completion_note ?? '(なし)'}`, '', url(req)].join('\n'),
    `【改善提案・完了】\n${req.title}\n${req.completion_note ?? ''}\n${url(req)}`
  )
}
