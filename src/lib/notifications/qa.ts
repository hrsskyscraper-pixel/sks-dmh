import { notifyRecipients } from './improvement'
import { getEmployeeRecipient, getOpsTeamRecipients } from '@/lib/improvements'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'

/**
 * Q&A の通知。
 * - 質問・回答のどちらも、運営チーム（設定の「運営チームの通知先」）へ一括休止に関係なく届ける
 * - 回答は、質問した本人にも届ける（本人が自分で回答したときは送らない）
 * - 書いた本人には送らない
 * - LINE には利用者が書いた件名・本文を載せない（公式アカウントから誘導文を届けられないように）。メールは社内宛てなので載せる
 */
export async function notifyQuestionPosted(q: { id: string; title: string; body: string; asker_id: string }, askerName: string) {
  const team = (await getOpsTeamRecipients()).filter(r => r.id !== q.asker_id)
  const url = `${APP_URL}/qa/${q.id}`
  await notifyRecipients(
    team,
    `【Q&A】新しい質問: ${q.title}`,
    [`${askerName} さんから質問が届きました。`, '', `件名: ${q.title}`, `内容: ${q.body}`, '', `回答する: ${url}`].join('\n'),
    `【Q&A・新しい質問】\n${askerName} さんから質問が届きました。\n\n回答する: ${url}`,
    { important: true, category: 'qa' },
  )
}

export async function notifyAnswerPosted(
  q: { id: string; title: string; asker_id: string },
  a: { body: string; author_id: string },
  authorName: string,
) {
  const url = `${APP_URL}/qa/${q.id}`
  const [team, asker] = await Promise.all([getOpsTeamRecipients(), getEmployeeRecipient(q.asker_id)])
  const teamOnly = team.filter(r => r.id !== a.author_id && r.id !== q.asker_id)
  if (teamOnly.length > 0) {
    await notifyRecipients(
      teamOnly,
      `【Q&A】回答がつきました: ${q.title}`,
      [`${authorName} さんが回答しました。`, '', `質問: ${q.title}`, `回答: ${a.body}`, '', url].join('\n'),
      `【Q&A・回答】${authorName} さんが回答しました。\n\n${url}`,
      { important: true, category: 'qa' },
    )
  }
  if (asker && asker.id !== a.author_id) {
    await notifyRecipients(
      [asker],
      `【Q&A】あなたの質問に回答がつきました: ${q.title}`,
      [`${authorName} さんが、あなたの質問に回答しました。`, '', `質問: ${q.title}`, `回答: ${a.body}`, '', `確認する: ${url}`].join('\n'),
      `【Q&A】あなたの質問に回答がつきました。\n\n${url}`,
      { category: 'qa' },
    )
  }
}
