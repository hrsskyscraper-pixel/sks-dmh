import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyRecipients } from './improvement'
import type { Recipient } from '@/lib/improvements'
import { notLeftFilter } from '@/lib/left'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sks-dmh.vercel.app'

/**
 * 級の取得を LINE で知らせる（2026-10-22 原島さん確定 A-5・社長承認）。
 * - 届け先: 取得した方の所属店舗のメンバー（ご本人が「知らせない」にした人を除く）＋ その店舗を「見たい店舗」に選んだ人
 * - 取得したご本人には送らない（ご本人にはホームのお祝い画面が出る）
 * - 一括休止に関係なく送る。無料枠（月200通）の手前では、送信の入口で自動的に止まる
 * - LINE の本文に利用者が書いた文は載せない（名前と級の名前だけ）
 * 失敗しても認定は成立しているので、呼び出し側は例外を握りつぶしてよい。
 */
export async function notifyGradeAchieved(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  params: { employeeId: string; label: string },
): Promise<{ sent: number }> {
  const { employeeId, label } = params
  const [{ data: who }, { data: storeRows }] = await Promise.all([
    db.from('employees').select('name').eq('id', employeeId).maybeSingle(),
    db.from('team_members').select('team_id, teams!inner(name, type)').eq('employee_id', employeeId).eq('teams.type', 'store'),
  ])
  type StoreRow = { team_id: string; teams: { name: string } | { name: string }[] | null }
  const stores = ((storeRows ?? []) as StoreRow[]).map(r => ({ id: r.team_id, name: (Array.isArray(r.teams) ? r.teams[0]?.name : r.teams?.name) ?? '' }))
  if (stores.length === 0) return { sent: 0 }
  const storeIds = stores.map(s => s.id)

  const [{ data: members }, { data: prefs }] = await Promise.all([
    db.from('team_members').select('employee_id, team_id').in('team_id', storeIds),
    db.from('store_follows').select('employee_id, team_id, mode').in('team_id', storeIds),
  ])
  // 1人ずつ、店舗ごとに判定する: 「その店舗のメンバーで、知らせないにしていない」か「その店舗を選んでいる」なら届ける
  const mode = new Map<string, string>()
  for (const p of (prefs ?? []) as { employee_id: string; team_id: string; mode: string }[]) mode.set(`${p.employee_id}:${p.team_id}`, p.mode)
  const ids = new Set<string>()
  for (const m of (members ?? []) as { employee_id: string; team_id: string }[]) {
    if (mode.get(`${m.employee_id}:${m.team_id}`) !== 'mute') ids.add(m.employee_id)
  }
  for (const p of (prefs ?? []) as { employee_id: string; mode: string }[]) {
    if (p.mode === 'follow') ids.add(p.employee_id)
  }
  ids.delete(employeeId)
  if (ids.size === 0) return { sent: 0 }

  // LINE の友だちになっている、承認済みで退職していない人だけ（.in は100件ずつ）
  const all = [...ids]
  const recipients: Recipient[] = []
  for (let i = 0; i < all.length; i += 100) {
    const { data } = await db.from('employees')
      .select('id, name, line_user_id')
      .in('id', all.slice(i, i + 100))
      .eq('status', 'approved')
      .eq('line_friend', true)
      .not('line_user_id', 'is', null)
      .or(notLeftFilter())
    for (const e of (data ?? []) as { id: string; name: string; line_user_id: string }[]) {
      recipients.push({ id: e.id, name: e.name, email: null, line_user_id: e.line_user_id })
    }
  }
  if (recipients.length === 0) return { sent: 0 }

  const storeName = stores.map(s => s.name).filter(Boolean).join('・')
  const name = who?.name ?? ''
  await notifyRecipients(
    recipients,
    `【級の取得】${name} さんが ${label} を取得`,
    '',
    `🎉【級の取得】\n${storeName ? `${storeName}の` : ''}${name} さんが「${label}」を取得しました！\nお祝いのコメントを贈りましょう♪\n\n${APP_URL}/timeline`,
    { lineBypass: true, category: 'grade' },
  )
  return { sent: recipients.length }
}
