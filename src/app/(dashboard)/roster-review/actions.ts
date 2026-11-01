'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister, isDeveloper } from '@/lib/permissions'
import { writeAuditLog } from '@/lib/audit'
import { hasControlChars } from '@/lib/account-issue'
import { todayJst } from '@/lib/left'
import { deriveLegacyRole, standardPermissionOf, widerPermission } from '@/lib/legacy-role'
import { goesToStore, isApplicable, NOTE_MAX, STAGE_LABEL } from '@/lib/roster-review'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { issueAccounts } from '@/app/(dashboard)/admin/account-issue/actions'
import type { RosterReviewAction, RosterReviewItemRow, RosterReviewStage, SystemPermission } from '@/types/database'

type Result = { error?: string }
type Me = NonNullable<Awaited<ReturnType<typeof getRealEmployee>>>

const PATH = '/roster-review'
const done = () => { revalidatePath(PATH); revalidatePath('/') }

async function loadBatch(batchId: string) {
  const db = createAdminClient()
  const { data } = await db.from('roster_review_batches').select('id, stage, senior_ids, title').eq('id', batchId).maybeSingle()
  return data
}

async function loadItem(itemId: string) {
  const db = createAdminClient()
  const { data: item } = await db.from('roster_review_items').select('*').eq('id', itemId).maybeSingle()
  if (!item) return null
  const batch = await loadBatch(item.batch_id)
  return batch ? { item: item as RosterReviewItemRow, batch } : null
}

/** 店長として答えられる行か（その店舗のリーダーに登録されている） */
async function leadsTeam(me: Me, teamId: string | null): Promise<boolean> {
  if (!teamId) return false
  const db = createAdminClient()
  const { data } = await db.from('team_managers').select('team_id').eq('employee_id', me.id).eq('team_id', teamId).maybeSingle()
  return !!data
}

/**
 * 案を直せる人と段階: 須貝（開発者）は下書き、原島さん（運用管理者）は概要の確認〜会社としての決定。
 * 会社として決めたあと（須貝の確認・反映）は直せない（直すときは、須貝が上長の確認の段階に戻す）。
 * 反映でうまくいかなかった行だけは、反映の段階で原島さんが直せる。
 */
function canEditAt(me: Me, stage: RosterReviewStage, ops: boolean, item?: Pick<RosterReviewItemRow, 'apply_result' | 'applied_at'>): boolean {
  if (isDeveloper(me) && stage === 'draft') return true
  if (ops && (stage === 'ops_preview' || stage === 'store' || stage === 'senior')) return true
  if (ops && stage === 'apply' && item && !item.applied_at && (item.apply_result ?? '').startsWith('×')) return true
  return false
}

/** 原島さんの役（担当者承認・会社としての決定・反映）。運用管理者のうち、その確認の上長ではない方（上長は自分の承認する案を自分で通さない） */
const opsFor = (me: Me, batch: { senior_ids: string[] }) => canAdminister(me) && !batch.senior_ids.includes(me.id)

const cleanNote = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim()
  return t ? t : null
}
const badNote = (s: string | null | undefined) => (s ?? '').length > NOTE_MAX || hasControlChars((s ?? '').replace(/\r?\n/g, ' '))

async function log(batchId: string, itemId: string | null, me: Me, stage: RosterReviewStage, body: string) {
  const db = createAdminClient()
  await db.from('roster_review_comments').insert({ batch_id: batchId, item_id: itemId, author_id: me.id, stage, body })
}

export type ItemPatch = {
  action?: RosterReviewAction
  target_employment_type?: '社員' | 'メイト' | null
  target_team_id?: string | null
  target_role_ids?: string[] | null
  stop_reason?: 'left' | 'shared' | 'duplicate' | null
  confirm_team_id?: string | null
  skip_store?: boolean
  dev_note?: string | null
  ops_preview_note?: string | null
}

/** 変更案を直す */
export async function updateItem(itemId: string, patch: ItemPatch): Promise<Result> {
  const me = await getRealEmployee()
  if (!me) return { error: '権限がありません' }
  const ctx = await loadItem(itemId)
  if (!ctx) return { error: 'この行が見つかりません' }
  const { batch, item } = ctx
  if (!canEditAt(me, batch.stage, opsFor(me, batch), item)) return { error: `いまの段階（${STAGE_LABEL[batch.stage]}）では直せません` }
  if (patch.dev_note !== undefined && !isDeveloper(me)) return { error: '須貝のメモは須貝だけが書けます' }
  if (patch.action === 'undecided' && batch.stage !== 'draft') return { error: '「まだ決めていない」は下書きのときだけ選べます' }
  if (badNote(patch.dev_note) || badNote(patch.ops_preview_note)) return { error: `メモは ${NOTE_MAX} 文字までで、使えない文字は入れないでください` }
  if ((patch.target_role_ids ?? []).length > 10) return { error: '役職が多すぎます' }

  const db = createAdminClient()
  if (patch.target_team_id || patch.confirm_team_id) {
    const ids = [patch.target_team_id, patch.confirm_team_id].filter((x): x is string => !!x)
    const { data: teams } = await db.from('teams').select('id').in('id', ids).in('type', ['store', 'department'])
    if ((teams ?? []).length !== new Set(ids).size) return { error: '店舗・部署を選び直してください' }
  }
  if (patch.target_role_ids?.length) {
    const { data: roles } = await db.from('business_roles').select('id').in('id', patch.target_role_ids)
    if ((roles ?? []).length !== new Set(patch.target_role_ids).size) return { error: '役職を選び直してください' }
  }

  const next: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['action', 'target_employment_type', 'target_team_id', 'target_role_ids', 'stop_reason', 'confirm_team_id', 'skip_store'] as const) {
    if (patch[k] !== undefined) next[k] = patch[k]
  }
  if (patch.dev_note !== undefined) next.dev_note = cleanNote(patch.dev_note)
  if (patch.ops_preview_note !== undefined) next.ops_preview_note = cleanNote(patch.ops_preview_note)
  // 実際に変わった項目だけで判定する（画面は保存のたびに全部の項目を送る）
  const same = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a ?? null) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b ?? null)
  const contentChanged = (['action', 'target_employment_type', 'target_team_id', 'target_role_ids', 'stop_reason'] as const).some(k => patch[k] !== undefined && !same(patch[k], item[k]))
  // 店長の「退職済み」に合わせて案を直した（退職で止める／MB は使わない）ときは、店長の回答を残す
  const followsLeft = item.store_answer === 'left' && (
    (next.action ?? item.action) === 'skip' || ((next.action ?? item.action) === 'stop' && (next.stop_reason ?? item.stop_reason) === 'left'))
  // 店長の確認より後で案を直したら、店長の回答と担当者承認をやり直す（上長の承認もやり直す）
  if (contentChanged && (batch.stage === 'store' || batch.stage === 'senior')) {
    next.ops_approved = false
    // 店長の確認の段階なら、店長にも答え直してもらう（上長の段階では回答を残し、やりとりに記録する）
    if (batch.stage === 'store' && !followsLeft) { next.store_answer = null; next.store_message = null; next.store_answered_by = null; next.store_answered_at = null; next.store_left_date = null }
  }

  const { error } = await db.from('roster_review_items').update(next).eq('id', itemId)
  if (error) return { error: '保存できませんでした。時間をおいてもう一度お試しください' }
  if (contentChanged && batch.stage !== 'draft') {
    await log(batch.id, itemId, me, batch.stage, followsLeft ? '店長の「退職済み」に合わせて、変更案を直しました' : item.store_answer && batch.stage === 'store' ? '変更案を直しました（店長の回答はやり直しです）' : item.store_answer ? '変更案を直しました（店長の回答は、直す前の案へのものです）' : '変更案を直しました')
    if (batch.stage === 'senior') await db.from('roster_review_signoffs').update({ approved: false, updated_at: new Date().toISOString() }).eq('batch_id', batch.id)
    await writeAuditLog({ action: 'roster_review_edit', actorId: me.id, targetId: item.employee_id ?? undefined, details: { batch: batch.id, item: itemId, stage: batch.stage, patch: next } }).catch(() => {})
  }
  done()
  return {}
}

/** 店長の回答（問題ない／問題ある＋メッセージ／退職済み＋退職年月日）。原島さんが店長から聞いた内容を代わりに入れることもできる */
export async function answerItem(itemId: string, answer: 'ok' | 'ng' | 'left', message: string, leftDate?: string): Promise<Result> {
  const me = await getRealEmployee()
  if (!me) return { error: '権限がありません' }
  if (answer !== 'ok' && answer !== 'ng' && answer !== 'left') return { error: '「問題ない」「問題ある」「退職済み」のどれかを選んでください' }
  if (answer === 'left') {
    const d = leftDate ?? ''
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d
    if (!valid) return { error: '退職年月日を入れてください' }
    if (d > todayJst()) return { error: '退職年月日は、今日かそれより前の日を入れてください（これから退職される方は「問題ある」に書いてください）' }
    if (d < '1990-01-01') return { error: '退職年月日を確かめてください' }
  }
  if (badNote(message)) return { error: `メッセージは ${NOTE_MAX} 文字までで、使えない文字は入れないでください` }
  if (answer === 'ng' && !message.trim()) return { error: '「問題ある」のときは、どこが違うかをメッセージに書いてください' }
  const ctx = await loadItem(itemId)
  if (!ctx) return { error: 'この行が見つかりません' }
  const { item, batch } = ctx
  if (batch.stage !== 'store') return { error: 'いまは店長の確認の段階ではありません' }
  if (!opsFor(me, batch) && !(await leadsTeam(me, item.confirm_team_id))) return { error: 'この店舗の確認はできません' }
  const db = createAdminClient()
  const { error } = await db.from('roster_review_items').update({
    store_answer: answer, store_message: cleanNote(message), store_answered_by: me.id, store_answered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    store_left_date: answer === 'left' ? leftDate : null,
    // 「問題ある」「退職済み」に変わったら、担当者承認をやり直す
    ...(answer !== 'ok' ? { ops_approved: false } : {}),
  }).eq('id', itemId).eq('batch_id', batch.id)
  if (error) return { error: '送れませんでした。時間をおいてもう一度お試しください' }
  await writeAuditLog({ action: 'roster_review_answer', actorId: me.id, targetId: item.employee_id ?? undefined, details: { batch: batch.id, item: itemId, answer, leftDate: answer === 'left' ? leftDate : undefined, before: item.store_answer } }).catch(() => {})
  done()
  return {}
}

/** 担当者承認（原島さん）。承認を外すこともできる */
export async function approveItem(itemId: string, approved: boolean, note: string): Promise<Result> {
  const me = await getRealEmployee()
  if (!me) return { error: '権限がありません' }
  if (badNote(note)) return { error: `メモは ${NOTE_MAX} 文字までで、使えない文字は入れないでください` }
  const ctx = await loadItem(itemId)
  if (!ctx) return { error: 'この行が見つかりません' }
  if (!opsFor(me, ctx.batch)) return { error: '権限がありません（上長の方は、担当者承認はしません）' }
  if (ctx.batch.stage !== 'store' && ctx.batch.stage !== 'senior') return { error: 'いまは担当者承認の段階ではありません' }
  if (approved && ctx.item.action === 'undecided') return { error: '変更案を決めてから承認してください' }
  const db = createAdminClient()
  const { error } = await db.from('roster_review_items').update({
    ops_approved: approved, ops_note: cleanNote(note), ops_by: me.id, ops_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', itemId)
  if (error) return { error: '保存できませんでした' }
  await writeAuditLog({ action: 'roster_review_approve', actorId: me.id, targetId: ctx.item.employee_id ?? undefined, details: { batch: ctx.batch.id, item: itemId, approved } }).catch(() => {})
  done()
  return {}
}

/** 店長がいる店舗（店長に回せる店舗） */
async function storesWithLeader(): Promise<Set<string>> {
  const db = createAdminClient()
  const [{ data: stores }, managers] = await Promise.all([
    db.from('teams').select('id').eq('type', 'store'),
    fetchAllRows<{ team_id: string; employee_id: string }>((from, to) => db.from('team_managers').select('team_id, employee_id').order('team_id').order('employee_id').range(from, to)),
  ])
  const ids = new Set((stores ?? []).map(t => t.id))
  return new Set(managers.map(m => m.team_id).filter(id => ids.has(id)))
}

async function batchItems(batchId: string) {
  const db = createAdminClient()
  return fetchAllRows<Pick<RosterReviewItemRow, 'id' | 'action' | 'ops_approved' | 'skip_store' | 'confirm_team_id' | 'store_answer' | 'employee_id' | 'target_team_id' | 'target_employment_type' | 'stop_reason' | 'roster'>>((from, to) =>
    db.from('roster_review_items').select('id, action, ops_approved, skip_store, confirm_team_id, store_answer, employee_id, target_team_id, target_employment_type, stop_reason, roster').eq('batch_id', batchId).order('id').range(from, to))
}

/** 反映できない形の行の数（段階を進める前に止める） */
function invalidCount(rows: Awaited<ReturnType<typeof batchItems>>): number {
  return rows.filter(r =>
    (r.action === 'issue' && (!!r.employee_id || !r.target_team_id || !r.target_employment_type || !(r.roster.last_name || r.roster.name))) ||
    ((r.action === 'change' || r.action === 'stop') && !r.employee_id) ||
    (r.action === 'stop' && !r.stop_reason)).length
}

/** 店長に回さない行（店舗の無い方・原島さんが決めた行）を、まとめて担当者承認する。店長に回す行は1行ずつ */
export async function approveAllWithoutStore(batchId: string): Promise<Result> {
  const me = await getRealEmployee()
  if (!me) return { error: '権限がありません' }
  const batch = await loadBatch(batchId)
  if (!batch || !opsFor(me, batch)) return { error: '権限がありません' }
  if ((batch.stage !== 'store' && batch.stage !== 'senior')) return { error: 'いまは担当者承認の段階ではありません' }
  const led = await storesWithLeader()
  const ids = (await batchItems(batchId)).filter(r => isApplicable(r.action) && !r.ops_approved && !goesToStore(r, led)).map(r => r.id)
  if (ids.length === 0) return {}
  const db = createAdminClient()
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await db.from('roster_review_items').update({ ops_approved: true, ops_by: me.id, ops_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('batch_id', batchId).in('id', ids.slice(i, i + 200))
    if (error) return { error: '保存できませんでした' }
  }
  await writeAuditLog({ action: 'roster_review_approve_all', actorId: me.id, details: { batch: batchId, count: ids.length } }).catch(() => {})
  done()
  return {}
}

/** やりとり（全体または1行）。この確認に関わる人だけが書ける */
export async function addComment(batchId: string, itemId: string | null, body: string): Promise<Result> {
  const me = await getRealEmployee()
  if (!me) return { error: '権限がありません' }
  const text = body.trim()
  if (!text) return { error: '内容を書いてください' }
  if (badNote(text)) return { error: `${NOTE_MAX} 文字までで、使えない文字は入れないでください` }
  const batch = await loadBatch(batchId)
  if (!batch || batch.stage === 'done') return { error: 'この確認は終わっています' }
  let allowed = canAdminister(me) || batch.senior_ids.includes(me.id)
  if (!allowed && itemId && batch.stage === 'store') {
    const ctx = await loadItem(itemId)
    allowed = !!ctx && ctx.item.batch_id === batchId && (await leadsTeam(me, ctx.item.confirm_team_id))
  }
  if (!allowed) return { error: '権限がありません' }
  if (itemId) {
    const ctx = await loadItem(itemId)
    if (!ctx || ctx.item.batch_id !== batchId) return { error: 'この行が見つかりません' }
  }
  await log(batchId, itemId, me, batch.stage, text)
  done()
  return {}
}

/** 上長の承認・コメント（菅原部長・諸沢社長。同時に書ける） */
export async function signoff(batchId: string, approved: boolean, comment: string): Promise<Result> {
  const me = await getRealEmployee()
  if (!me) return { error: '権限がありません' }
  if (badNote(comment)) return { error: `コメントは ${NOTE_MAX} 文字までで、使えない文字は入れないでください` }
  const batch = await loadBatch(batchId)
  if (!batch || !batch.senior_ids.includes(me.id)) return { error: '権限がありません' }
  if (batch.stage !== 'senior') return { error: 'いまは上長の確認の段階ではありません' }
  const db = createAdminClient()
  const { error } = await db.from('roster_review_signoffs').upsert({ batch_id: batchId, employee_id: me.id, approved, comment: cleanNote(comment), updated_at: new Date().toISOString() })
  if (error) return { error: '保存できませんでした' }
  await writeAuditLog({ action: 'roster_review_signoff', actorId: me.id, details: { batch: batchId, approved } }).catch(() => {})
  done()
  return {}
}

/** 概要と上長（須貝・原島さん。下書きと概要の確認のとき） */
export async function updateBatch(batchId: string, patch: { overview?: string | null; senior_ids?: string[]; title?: string }): Promise<Result> {
  const me = await getRealEmployee()
  // 概要と上長は、須貝が下書きのときに決める（原島さんの確認結果を承認する上長を、原島さんが選び直せないように）
  if (!me || !isDeveloper(me)) return { error: '概要と上長は、須貝が下書きのときに決めます' }
  const batch = await loadBatch(batchId)
  if (!batch || batch.stage !== 'draft') return { error: '概要と上長は、下書きのときだけ直せます' }
  if (badNote(patch.overview)) return { error: `概要は ${NOTE_MAX} 文字までで、使えない文字は入れないでください` }
  if (patch.title !== undefined && (typeof patch.title !== 'string' || !patch.title.trim() || patch.title.length > 80 || hasControlChars(patch.title))) return { error: '名前は80文字までで入れてください' }
  const db = createAdminClient()
  if (patch.senior_ids) {
    const ids = [...new Set(patch.senior_ids)]
    if (ids.length > 5) return { error: '上長は5人までです' }
    if (ids.includes(me.id)) return { error: '自分は上長に選べません' }
    // 上長は、在籍中・承認済みの運用管理者・開発者だけ
    const { data: rows } = await db.from('employees').select('id, left_at, status, system_permission').in('id', ids)
    const ok = (rows ?? []).filter(r => r.status === 'approved' && (r.system_permission === 'ops_admin' || r.system_permission === 'developer') && !(r.left_at && r.left_at <= todayJst()))
    if (ok.length !== ids.length) return { error: '上長を選び直してください（在籍中の運用管理者から選びます）' }
  }
  const next: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.overview !== undefined) next.overview = cleanNote(patch.overview)
  if (patch.senior_ids) next.senior_ids = [...new Set(patch.senior_ids)]
  if (patch.title !== undefined) next.title = patch.title.trim()
  const { error } = await db.from('roster_review_batches').update(next).eq('id', batchId).eq('stage', 'draft')
  if (error) return { error: '保存できませんでした' }
  if (patch.senior_ids && [...patch.senior_ids].sort().join() !== [...batch.senior_ids].sort().join()) {
    await writeAuditLog({ action: 'roster_review_seniors', actorId: me.id, details: { batch: batchId, from: batch.senior_ids, to: next.senior_ids } }).catch(() => {})
  }
  done()
  return {}
}

/**
 * 段階を進める・戻す。だれが・どこからどこへ動かせるかを、ここで決める。
 * 進めるときの条件:
 *  - 下書き → 概要の確認: 須貝。「まだ決めていない」行が無いこと、上長が決まっていること
 *  - 概要の確認 → 店長の確認: 原島さん
 *  - 店長の確認 → 上長の確認: 原島さん。反映する行がすべて担当者承認済み
 *  - 上長の確認 → 須貝の確認（＝会社として決定）: 原島さん。上長全員が承認済み・反映する行がすべて担当者承認済み
 *  - 須貝の確認 → 反映: 須貝
 * 戻すとき: 概要の確認 → 下書き（原島さん・須貝）／須貝の確認 → 上長の確認（須貝。原島さんと調整するとき）
 */
export async function moveStage(batchId: string, to: RosterReviewStage, message?: string): Promise<Result> {
  const me = await getRealEmployee()
  if (!me) return { error: '権限がありません' }
  if (badNote(message)) return { error: `ひとことは ${NOTE_MAX} 文字までで、使えない文字は入れないでください` }
  const batch = await loadBatch(batchId)
  if (!batch) return { error: 'この確認が見つかりません' }
  const from = batch.stage
  const dev = isDeveloper(me), ops = opsFor(me, batch)
  const db = createAdminClient()
  const rows = await batchItems(batchId)
  const unapproved = rows.filter(r => isApplicable(r.action) && !r.ops_approved).length

  const key = `${from}>${to}`
  switch (key) {
    case 'draft>ops_preview':
      if (!dev) return { error: '下書きを回せるのは須貝だけです' }
      if (rows.some(r => r.action === 'undecided')) return { error: '「まだ決めていない」行があります。決めてから回してください' }
      if (batch.senior_ids.length === 0) return { error: '上長（原島さんの確認結果を承認する方）を選んでください' }
      if (invalidCount(rows)) return { error: `反映できない形の行が ${invalidCount(rows)} 件あります（発行なのに MB のアカウントがある・店舗や区分が空、直す・止めるなのにアカウントがつながっていない、止める理由が空）` }
      break
    case 'ops_preview>draft':
    case 'ops_preview>store':
      if (!ops) return { error: '権限がありません' }
      break
    case 'store>senior': {
      if (!ops) return { error: '権限がありません' }
      if (unapproved) return { error: `担当者承認がまだの行が ${unapproved} 件あります` }
      if (invalidCount(rows)) return { error: `反映できない形の行が ${invalidCount(rows)} 件あります` }
      const led = await storesWithLeader()
      const noAnswer = rows.filter(r => goesToStore(r, led) && !r.store_answer).length
      if (noAnswer) return { error: `店長の回答がまだの行が ${noAnswer} 件あります（店長から聞いた内容を、代わりに入れることもできます）` }
      break
    }
    case 'senior>dev_check': {
      if (!ops) return { error: '権限がありません' }
      if (unapproved) return { error: `担当者承認がまだの行が ${unapproved} 件あります` }
      const { data: signs } = await db.from('roster_review_signoffs').select('employee_id, approved').eq('batch_id', batchId)
      const ok = new Set((signs ?? []).filter(s => s.approved).map(s => s.employee_id))
      const waiting = batch.senior_ids.filter(id => !ok.has(id)).length
      if (waiting) return { error: `上長の承認がまだの方が ${waiting} 名います` }
      break
    }
    case 'dev_check>senior':
    case 'dev_check>apply':
      if (!dev) return { error: '須貝の確認は須貝だけが進められます' }
      break
    default:
      return { error: 'この段階には動かせません' }
  }

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { stage: to, stage_changed_at: now, updated_at: now }
  if (key === 'senior>dev_check') { patch.decided_by = me.id; patch.decided_at = now }
  // 条件つきで更新し、同時に押されたときに2回動かさない
  const { data: moved, error } = await db.from('roster_review_batches').update(patch).eq('id', batchId).eq('stage', from).select('id')
  if (error || !moved?.length) return { error: 'ほかの方が先に進めました。画面を開き直してください' }
  const text = message?.trim()
  const auto = key === 'senior>dev_check' ? 'アカウントの変更処理を会社として決定しました。これで依頼します。' : `${STAGE_LABEL[from]} → ${STAGE_LABEL[to]}`
  await log(batchId, null, me, from, text ? `${auto}\n${text}` : auto)
  await writeAuditLog({ action: 'roster_review_stage', actorId: me.id, details: { batch: batchId, from, to } }).catch(() => {})
  done()
  return {}
}

export type ApplyIssued = { name: string; claimId: string }

/**
 * まとめて反映（原島さん）。反映の段階だけ。時間がかからないよう、1回に 15 行ずつ反映し、残りの件数を返す。
 * 画面は、反映する行が無くなるまで続けて呼ぶ（runStart＝押した時刻。この回にうまくいかなかった行は、同じ回では拾い直さない）。
 * 担当者承認した行だけを反映する。うまくいかなかった行は「反映待ち」に戻し、直してからもう一度押せば反映する。
 * 全部反映できたら「反映済み」にする。
 */
export async function applyChunk(batchId: string, runStart: string): Promise<{ remaining: number; processed: number; issued: ApplyIssued[]; errors: string[]; error?: string }> {
  const empty = { remaining: 0, processed: 0, issued: [] as ApplyIssued[], errors: [] as string[] }
  const me = await getRealEmployee()
  if (!me) return { ...empty, error: '権限がありません' }
  if (typeof runStart !== 'string' || Number.isNaN(Date.parse(runStart))) return { ...empty, error: '画面を開き直してください' }
  const batch = await loadBatch(batchId)
  if (!batch || !opsFor(me, batch)) return { ...empty, error: '権限がありません' }
  if (batch.stage !== 'apply') return { ...empty, error: 'いまは反映の段階ではありません' }
  const db = createAdminClient()
  const since = new Date(runStart).toISOString()
  const { data: pending } = await db.from('roster_review_items').select('*').eq('batch_id', batchId).is('applied_at', null).eq('ops_approved', true)
    .in('action', ['change', 'stop', 'issue']).or(`apply_result.is.null,updated_at.lt.${since}`).order('seq').limit(15)
  const list = (pending ?? []) as RosterReviewItemRow[]
  const issued: ApplyIssued[] = []
  const errors: string[] = []
  const { data: roleRows } = await db.from('business_roles').select('id, name, is_executive, standard_permission')
  const roleMap = new Map((roleRows ?? []).map(r => [r.id, r]))

  for (const it of list) {
    // 先に「反映中」の印を付けて、同時に押されても2回反映しない
    const { data: claimed } = await db.from('roster_review_items').update({ applied_at: new Date().toISOString(), apply_result: '反映しています' }).eq('id', it.id).is('applied_at', null).select('id')
    if (!claimed?.length) continue
    const name = it.roster.name ?? `${it.roster.last_name ?? ''}${it.roster.first_name ?? ''}`
    let result = ''
    try {
      result = await applyOne(it, roleMap, me, issued)
    } catch {
      result = '×うまく反映できませんでした'
    }
    const failed = result.startsWith('×')
    if (failed) errors.push(`${name}: ${result.slice(1)}`)
    // うまくいかなかった行は反映待ちに戻す（直して、もう一度「まとめて反映」）
    await db.from('roster_review_items').update({ apply_result: result, updated_at: new Date().toISOString(), ...(failed ? { applied_at: null } : {}) }).eq('id', it.id)
  }

  const { count } = await db.from('roster_review_items').select('id', { count: 'exact', head: true }).eq('batch_id', batchId).is('applied_at', null).eq('ops_approved', true).in('action', ['change', 'stop', 'issue'])
  const remaining = count ?? 0
  if (remaining === 0) {
    const now = new Date().toISOString()
    const { data: moved } = await db.from('roster_review_batches').update({ stage: 'done', applied_by: me.id, applied_at: now, stage_changed_at: now, updated_at: now }).eq('id', batchId).eq('stage', 'apply').select('id')
    if (moved?.length) {
      await log(batchId, null, me, 'apply', 'まとめて反映しました')
      await writeAuditLog({ action: 'roster_review_applied', actorId: me.id, details: { batch: batchId } }).catch(() => {})
    }
  }
  done()
  return { remaining, processed: list.length, issued, errors }
}

type RoleSetting = { id: string; name: string; is_executive: boolean | null; standard_permission: SystemPermission | null }

/** 1行を反映する。結果の文を返す（うまくいかなかったときは先頭に ×） */
async function applyOne(it: RosterReviewItemRow, roleMap: Map<string, RoleSetting>, me: Me, issued: ApplyIssued[]): Promise<string> {
  const db = createAdminClient()
  if (it.action === 'issue') {
    if (it.employee_id) return '×MB にアカウントがある方です（発行ではなく「内容を直す」にしてください）'
    const last = it.roster.last_name?.trim() || it.roster.name?.trim() || ''
    if (!last || !it.target_team_id || !it.target_employment_type) return '×氏名・区分・店舗のどれかが空です'
    const res = await issueAccounts([{
      lastName: last,
      firstName: it.roster.last_name ? (it.roster.first_name ?? '') : '',
      lastKana: it.roster.last_kana ?? null,
      firstKana: it.roster.first_kana ?? null,
      employeeNumber: it.roster.employee_number ?? null,
      employmentType: it.target_employment_type,
      teamId: it.target_team_id,
      businessRoleIds: it.target_role_ids ?? [],
      permission: 'training_member',
    }], { rosterChecked: true })
    if (res.error || !res.issued.length) return `×${res.error ?? '発行できませんでした'}`
    issued.push({ name: res.issued[0].name, claimId: res.issued[0].claimId })
    await writeAuditLog({ action: 'roster_review_apply', actorId: me.id, targetId: res.issued[0].employeeId, details: { item: it.id, action: 'issue' } }).catch(() => {})
    return '発行しました（本人用のリンクを渡してください）'
  }

  if (!it.employee_id) return '×MB のアカウントがつながっていません'
  const { data: emp } = await db.from('employees').select('id, employment_type, business_role_ids, system_permission, left_at').eq('id', it.employee_id).maybeSingle()
  if (!emp) return '×MB のアカウントが見つかりません'

  if (it.action === 'stop') {
    if (emp.left_at && emp.left_at <= todayJst()) return 'すでに止まっています'
    // 運用管理者・開発者を止めると、管理する人が締め出されることがあるので、ここでは止めない
    if (emp.system_permission === 'ops_admin' || emp.system_permission === 'developer') return '×運用管理者・開発者の方は、ここでは止めません（プロフィールで権限を外してから止めてください）'
    // 店長が「退職済み」と答えた行は、その退職年月日で止める
    const leftAt = it.stop_reason === 'left' && it.store_answer === 'left' && it.store_left_date ? it.store_left_date : todayJst()
    const { error } = await db.from('employees').update({ left_at: leftAt }).eq('id', emp.id)
    if (error) return '×止められませんでした'
    await writeAuditLog({ action: 'roster_review_apply', actorId: me.id, targetId: emp.id, details: { item: it.id, action: 'stop', reason: it.stop_reason, from: { left_at: emp.left_at }, to: { left_at: leftAt } } }).catch(() => {})
    const { count } = await db.from('team_managers').select('team_id', { count: 'exact', head: true }).eq('employee_id', emp.id)
    return (count ?? 0) > 0 ? '止めました（リーダーの登録が残っています。所属一覧で外してください）' : '止めました'
  }

  // 内容を直す
  const notes: string[] = []
  const patch: Record<string, unknown> = {}
  if (it.target_employment_type && it.target_employment_type !== emp.employment_type) patch.employment_type = it.target_employment_type
  if (it.target_role_ids) {
    const nextIds = it.target_role_ids.filter(id => roleMap.has(id))
    const same = nextIds.length === (emp.business_role_ids ?? []).length && nextIds.every(id => (emp.business_role_ids ?? []).includes(id))
    if (!same) {
      patch.business_role_ids = nextIds
      const titles = nextIds.map(id => roleMap.get(id)!)
      const added = nextIds.filter(id => !(emp.business_role_ids ?? []).includes(id)).map(id => roleMap.get(id)!)
      const cur = emp.system_permission as SystemPermission
      // 新しく付けた役職の標準の承認の権限まで上げる（下げはしない。開発者はそのまま。社内役職マスタでの付け替えと同じ決め方）
      const perm = cur === 'developer' ? cur : widerPermission(cur, standardPermissionOf(added))
      if (perm !== cur) { patch.system_permission = perm; notes.push('承認の権限を役職の標準まで上げました') }
      patch.role = deriveLegacyRole(perm, titles)
    }
  }
  if (Object.keys(patch).length) {
    const { error } = await db.from('employees').update(patch).eq('id', emp.id)
    if (error) return '×区分・役職を直せませんでした'
  }
  if (it.target_team_id && (emp.system_permission === 'ops_admin' || emp.system_permission === 'developer')) {
    // 上長（運用管理者・開発者）は育成の対象に入れない（店舗のメンバーにしない）
    notes.push('運用管理者の方なので、店舗・部署のメンバーにはしていません')
  } else if (it.target_team_id) {
    const { data: mem } = await db.from('team_members').select('team_id, teams!inner(type)').eq('employee_id', emp.id)
    const current = (mem ?? []).filter(m => { const t = m.teams as unknown as { type: string }; return t.type === 'store' || t.type === 'department' }).map(m => m.team_id)
    if (!current.includes(it.target_team_id)) {
      const { error: insErr } = await db.from('team_members').insert({ team_id: it.target_team_id, employee_id: emp.id, sort_order: 999 })
      if (insErr) return '×店舗・部署を直せませんでした'
      if (current.length) await db.from('team_members').delete().eq('employee_id', emp.id).in('team_id', current)
      const { count } = await db.from('team_managers').select('team_id', { count: 'exact', head: true }).eq('employee_id', emp.id).in('team_id', current.length ? current : ['00000000-0000-0000-0000-000000000000'])
      if ((count ?? 0) > 0) notes.push('前の店舗のリーダーの登録が残っています。所属一覧で直してください')
    }
  }
  await writeAuditLog({
    action: 'roster_review_apply', actorId: me.id, targetId: emp.id,
    details: { item: it.id, action: 'change', from: { employment_type: emp.employment_type, business_role_ids: emp.business_role_ids, system_permission: emp.system_permission }, to: patch, team: it.target_team_id },
  }).catch(() => {})
  return notes.length ? `直しました（${notes.join('・')}）` : '直しました'
}
