import Link from 'next/link'
import { ClipboardCheck, ChevronRight } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRealEmployee } from '@/lib/supabase/auth-cache'
import { canAdminister, isDeveloper } from '@/lib/permissions'
import { goesToStore, isApplicable } from '@/lib/roster-review'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import type { RosterReviewAction } from '@/types/database'

/**
 * ホームの「在職者の確認」のお願い（2026-11-01）。自分の番が来ている確認だけを出す。
 * メール・LINE は止めているので、ここと社内の連絡手段で知らせる。
 */
export async function RosterReviewNotice() {
  const me = await getRealEmployee()
  if (!me) return null
  const db = createAdminClient()
  const { data: batches } = await db.from('roster_review_batches').select('id, title, stage, senior_ids').neq('stage', 'done').limit(10)
  if (!batches?.length) return null
  const dev = isDeveloper(me), ops = canAdminister(me)
  const { data: myTeams } = await db.from('team_managers').select('team_id').eq('employee_id', me.id)
  const myTeamIds = (myTeams ?? []).map(t => t.team_id)

  const tasks: { id: string; text: string }[] = []
  for (const b of batches) {
    if (b.stage === 'draft' && dev) tasks.push({ id: b.id, text: '下書きを仕上げて、原島さんに確認を依頼してください' })
    if (b.stage === 'ops_preview' && ops && !dev && !b.senior_ids.includes(me.id)) tasks.push({ id: b.id, text: '概要の確認をお願いします' })
    if (b.stage === 'dev_check' && dev) tasks.push({ id: b.id, text: '会社としての変更案が届きました。確認してください' })
    if (b.stage === 'apply' && ops && !dev && !b.senior_ids.includes(me.id)) tasks.push({ id: b.id, text: '須貝の確認が済みました。まとめて反映をお願いします' })
    if (b.stage === 'senior' && b.senior_ids.includes(me.id)) {
      const { data: s } = await db.from('roster_review_signoffs').select('approved').eq('batch_id', b.id).eq('employee_id', me.id).maybeSingle()
      if (!s?.approved) tasks.push({ id: b.id, text: '原島さんの確認結果の承認をお願いします' })
    }
    if (b.stage === 'senior' && ops && !dev && !b.senior_ids.includes(me.id)) {
      const { data: signs } = await db.from('roster_review_signoffs').select('employee_id, approved').eq('batch_id', b.id)
      const ok = new Set((signs ?? []).filter(s => s.approved).map(s => s.employee_id))
      if (b.senior_ids.length && b.senior_ids.every((id: string) => ok.has(id))) tasks.push({ id: b.id, text: '上長の承認がそろいました。会社としての変更案を決めて、須貝に依頼してください' })
    }
    if (b.stage === 'store') {
      const rows = await fetchAllRows<{ id: string; action: RosterReviewAction; skip_store: boolean; confirm_team_id: string | null; store_answer: string | null; ops_approved: boolean }>((from, to) =>
        db.from('roster_review_items').select('id, action, skip_store, confirm_team_id, store_answer, ops_approved').eq('batch_id', b.id).order('id').range(from, to))
      if (ops && !dev && !b.senior_ids.includes(me.id)) {
        const left = rows.filter(r => isApplicable(r.action) && !r.ops_approved).length
        if (left) tasks.push({ id: b.id, text: `担当者承認がまだの行が ${left} 件あります` })
      } else if (myTeamIds.length) {
        const ids = [...new Set(rows.map(r => r.confirm_team_id).filter((x): x is string => !!x))]
        const { data: storeRows } = ids.length ? await db.from('teams').select('id').in('id', ids).eq('type', 'store') : { data: [] as { id: string }[] }
        // 店長に回る行（店舗の行で、その店舗にリーダーがいる）のうち、自分の店舗でまだ答えていないもの
        const led = new Set((storeRows ?? []).map(t => t.id).filter(id => myTeamIds.includes(id)))
        const left = rows.filter(r => goesToStore(r, led) && !r.store_answer).length
        if (left) tasks.push({ id: b.id, text: `あなたの店舗の方の変更案が ${left} 件あります。「問題ない」か「問題ある」を選んでください` })
      }
    }
  }
  if (!tasks.length) return null

  return (
    <div className="space-y-2 mb-4">
      {tasks.map(t => (
        <Link key={t.id + t.text} href={`/roster-review?batch=${t.id}`} className="flex items-center gap-3 rounded-xl border-2 border-orange-300 bg-orange-50 p-3 hover:bg-orange-100 transition-colors">
          <ClipboardCheck className="w-5 h-5 text-orange-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-800">在職者の確認のお願い</p>
            <p className="text-xs text-orange-700">{t.text}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-orange-400" />
        </Link>
      ))}
    </div>
  )
}
