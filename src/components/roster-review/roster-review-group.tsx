'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { addComment, answerItem, answerItemsOk, approveItem, approveItems, updateItem } from '@/app/(dashboard)/roster-review/actions'
import { ACTION_LABEL, isApplicable } from '@/lib/roster-review'
import type { RosterReviewItemRow } from '@/types/database'
import { ANSWER_LABEL, changeLines, fmt, fmtDate, ItemEditor, type ItemCtx } from './roster-review-item'

/**
 * 同じ店舗で、変更案がまったく同じ方を、1枚のカードにまとめる（2026-11-03）。
 * 変更案は1回だけ見せ、方ごとに「問題ある」「退職済み」を入れられる。まだ答えていない方は、まとめて「問題ない」で送れる。
 * 行（データ）は1人1行のまま。まとめるのは画面だけ。
 */
export function groupKey(it: RosterReviewItemRow, ctx: ItemCtx): string | null {
  // 重複アカウントを見比べる行・まとめた行は、1人ずつのカードのまま
  if (it.merged_into || (it.dup_stop_ids ?? []).length) return null
  if ((ctx.data.dupes[it.id] ?? []).some(id => ctx.data.people[id])) return null
  if (it.action === 'undecided') return null
  // 店舗の無い行（原島さんへ直接）は、1人ずつのまま
  if (!it.confirm_team_id) return null
  return [it.confirm_team_id ?? '', String(it.skip_store), it.action, it.stop_reason ?? '', ...changeLines(it, ctx.data)].join('\u0001')
}

const nameOf = (it: RosterReviewItemRow, ctx: ItemCtx) => {
  const p = it.employee_id ? ctx.data.people[it.employee_id] : null
  return it.roster.name || [it.roster.last_name, it.roster.first_name].filter(Boolean).join(' ') || p?.name || '（氏名なし）'
}

export function ReviewGroup({ rows, ctx }: { rows: RosterReviewItemRow[]; ctx: ItemCtx }) {
  const { data, stage } = ctx
  const preview = !!ctx.preview
  const [isPending, startTransition] = useTransition()
  const first = rows[0]
  const lines = changeLines(first, data)
  const team = first.confirm_team_id ? data.teams.find(t => t.id === first.confirm_team_id)?.name : null
  const toStore = ctx.toStore(first)
  const optional = !toStore && !!ctx.seenByStore?.(first)
  const showStore = preview || (stage !== 'draft' && stage !== 'ops_preview' && (toStore || optional))
  const canAnswerAll = !preview && stage === 'store' && rows.every(ctx.canAnswer)
  const unanswered = rows.filter(it => !it.store_answer)
  const canApprove = !preview && data.me.ops && (stage === 'store' || stage === 'senior') && isApplicable(first.action)
  const unapproved = rows.filter(it => !it.ops_approved && it.store_answer !== 'ng' && it.store_answer !== 'left')

  const run = (fn: () => Promise<{ error?: string; count?: number }>, ok: (n?: number) => string) => startTransition(async () => {
    const res = await fn()
    if (res.error) { toast.error(res.error); return }
    toast.success(ok(res.count))
  })

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex flex-wrap items-start gap-2">
        <p className="flex-1 min-w-0 text-sm font-semibold text-gray-800">{rows.length} 名（同じ変更案）{team && !preview ? <span className="ml-1 text-[11px] font-normal text-gray-500">{team}</span> : ''}</p>
        <Badge variant="secondary" className="text-[11px]">{ACTION_LABEL[first.action]}</Badge>
        {!preview && !toStore && isApplicable(first.action) && stage !== 'draft' && <Badge variant="outline" className="text-[11px]">原島さんへ直接</Badge>}
      </div>

      <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
        <p className="text-[11px] text-orange-700 font-semibold">変更案：このように変更を予定しています（下の {rows.length} 名とも同じです）</p>
        <ul className="text-sm text-gray-800 list-disc pl-5">{lines.map(l => <li key={l}>{l}</li>)}</ul>
      </div>

      {showStore && (
        <div className="space-y-1">
          {first.action === 'none'
            ? <p className="text-xs font-semibold text-gray-700">店長への確認：いまのままの予定です。すでに退職された方や、変更の必要がある方がいらっしゃったら、その方の欄でお知らせください（答えは任意です）。</p>
            : <p className="text-xs font-semibold text-gray-700">店長への確認：変更案のとおりで、問題ありませんか？</p>}
          {(preview || stage === 'store') && <p className="text-[11px] text-gray-600">（問題ある方・すでに退職された方がいらっしゃったら、その方の欄で「問題ある」「退職済み」を押してください。ほかの方は、下の「まとめて問題ない」で送れます。）</p>}
        </div>
      )}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
        {rows.map(it => <GroupPerson key={it.id} it={it} ctx={ctx} showStore={showStore} />)}
      </ul>

      {preview && showStore && <Button size="sm" className="bg-emerald-600" disabled>まだ答えていない方を、まとめて「問題ない」で送る</Button>}
      {showStore && canAnswerAll && unanswered.length > 0 && (
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={isPending}
          onClick={() => run(() => answerItemsOk(unanswered.map(it => ({ id: it.id, updated_at: it.updated_at }))), n => `${n ?? 0} 名を「問題ない」で送りました`)}>
          まだ答えていない方（{unanswered.length} 名）を、まとめて「問題ない」で送る
        </Button>
      )}
      {showStore && canAnswerAll && unanswered.length > 0 && data.me.ops && !data.me.ledTeamIds.includes(first.confirm_team_id ?? '') && (
        <p className="text-[11px] text-gray-500">店長から聞いた内容を、代わりに入れることもできます（入れた人として記録されます）。店長に確かめていないときは押さないでください。</p>
      )}
      {canApprove && unapproved.length > 0 && (
        <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-700" disabled={isPending}
          onClick={() => run(() => approveItems(rows.map(it => ({ id: it.id, updated_at: it.updated_at }))), n => `${n ?? 0} 名を承認しました`)}>
          まだ承認していない方（{unapproved.length} 名）を、まとめて担当者として承認（「問題ある」「退職済み」の方は、1人ずつ承認）
        </Button>
      )}
    </li>
  )
}

function GroupPerson({ it, ctx, showStore }: { it: RosterReviewItemRow; ctx: ItemCtx; showStore: boolean }) {
  const { data, stage } = ctx
  const preview = !!ctx.preview
  const canEdit = !preview && (ctx.canEdit || (stage === 'apply' && data.me.ops && !it.applied_at && (it.apply_result ?? '').startsWith('×')))
  const [isPending, startTransition] = useTransition()
  const [mode, setMode] = useState<null | 'ng' | 'left'>(null)
  const [msg, setMsg] = useState(it.store_message ?? '')
  const [leftDate, setLeftDate] = useState(it.store_left_date ?? '')
  const [editing, setEditing] = useState(false)
  const [openThread, setOpenThread] = useState(false)
  const [comment, setComment] = useState('')
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
  const roleName = (id: string) => data.roles.find(r => r.id === id)?.name ?? '（不明）'
  const person = it.employee_id ? data.people[it.employee_id] : null
  const thread = data.comments.filter(c => c.item_id === it.id)
  const answeredBy = it.store_answered_by ? data.people[it.store_answered_by]?.name : null
  const canAnswer = !preview && stage === 'store' && showStore && ctx.canAnswer(it)
  const followsLeft = it.action === 'skip' || (it.action === 'stop' && it.stop_reason === 'left')
  const showApprove = !preview && data.me.ops && (stage === 'store' || stage === 'senior') && (isApplicable(it.action) || (it.action === 'none' && (it.store_answer === 'ng' || it.store_answer === 'left')))

  const run = (fn: () => Promise<{ error?: string }>, ok: string, after?: () => void) => startTransition(async () => {
    const res = await fn()
    if (res.error) { toast.error(res.error); return }
    toast.success(ok)
    after?.()
  })

  return (
    <li className={`p-2 space-y-1 ${it.store_answer === 'ng' ? 'bg-red-50' : it.store_answer === 'left' ? 'bg-slate-50' : ''}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-[10rem]">
          <p className="text-sm font-semibold text-gray-800">{nameOf(it, ctx)}</p>
          <p className="text-[11px] text-gray-500">
            社員リスト: {[it.roster.employment_type, it.roster.store, it.roster.title].filter(Boolean).join('・') || '—'}
            {it.roster.employee_number && !preview ? `（社員番号 ${it.roster.employee_number}）` : ''}
          </p>
          <p className="text-[11px] text-gray-500">
            いまの MB: {person ? [person.employment_type, person.team_names.join('・'), person.role_ids.map(roleName).join('・')].filter(Boolean).join('・') || '—' : 'アカウントなし'}
            {person?.left ? '（止まっています）' : ''}
          </p>
          {person && <p className="text-[11px] text-gray-500">スキルの申請 {person.applied ?? 0} 件・認定 {person.certified ?? 0} 件・登録 {fmtDate(person.created_at)}・最終ログイン {fmtDate(person.last_login_at, '記録なし')}</p>}
        </div>
        {!preview && it.ops_approved && <Badge className="text-[11px] bg-emerald-600">担当者承認済み</Badge>}
        {(canAnswer || preview) && (
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" className="h-7 text-[11px] border-emerald-400 text-emerald-700" disabled={preview || isPending} onClick={() => { setMode(null); run(() => answerItem(it.id, 'ok', ''), '送りました') }}>問題ない</Button>
            <Button size="sm" variant="outline" className={`h-7 text-[11px] border-red-300 text-red-700 ${mode === 'ng' ? 'bg-red-50' : ''}`} disabled={preview || isPending} onClick={() => setMode(m => m === 'ng' ? null : 'ng')}>問題ある</Button>
            <Button size="sm" variant="outline" className={`h-7 text-[11px] border-slate-400 text-slate-700 ${mode === 'left' ? 'bg-slate-100' : ''}`} disabled={preview || isPending} onClick={() => setMode(m => m === 'left' ? null : 'left')}>退職済み</Button>
          </div>
        )}
      </div>

      {!preview && (it.roster.check || it.dev_note || it.ops_preview_note) && (
        <div className="text-[11px] text-gray-600 space-y-0.5">
          {it.roster.check && <p>確認事項: {it.roster.check}</p>}
          {it.dev_note && <p>須貝のメモ: {it.dev_note}</p>}
          {it.ops_preview_note && <p>原島さん（概要の確認で分かったこと）: {it.ops_preview_note}</p>}
        </div>
      )}

      {showStore && it.store_answer && (
        <p className={`text-xs ${it.store_answer === 'ok' ? 'text-emerald-700' : it.store_answer === 'left' ? 'text-slate-700' : 'text-red-700'}`}>
          {ANSWER_LABEL[it.store_answer]}{it.store_answer === 'left' && it.store_left_date ? `（退職年月日 ${fmtDate(`${it.store_left_date}T00:00:00+09:00`)}）` : ''}{it.store_message ? `：${it.store_message}` : ''}
          <span className="ml-1 text-[11px] text-gray-500">（{answeredBy ?? ''} {it.store_answered_at ? fmt(it.store_answered_at) : ''}）</span>
        </p>
      )}

      {showStore && !preview && !it.store_answer && stage !== 'store' && <p className="text-[11px] text-gray-500">回答はありません</p>}
      {canAnswer && mode === 'ng' && (
        <div className="space-y-1">
          <Textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="どこが違うかを書いてください（書くと送れます）" className="text-sm min-h-[48px]" disabled={isPending} />
          <div className="flex gap-2">
            <Button size="sm" className="bg-red-600 hover:bg-red-700" disabled={isPending || !msg.trim()} onClick={() => run(() => answerItem(it.id, 'ng', msg), '送りました', () => setMode(null))}>「問題ある」で送る</Button>
            <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => setMode(null)}>やめる</button>
          </div>
        </div>
      )}
      {canAnswer && mode === 'left' && (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-slate-50 px-2 py-2">
          <label className="text-[11px] text-slate-700">退職年月日
            <input type="date" value={leftDate} max={today} onChange={e => setLeftDate(e.target.value)} className="ml-1 rounded border border-gray-300 px-1 py-0.5 text-sm" disabled={isPending} />
          </label>
          <Textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="メッセージ（任意）" className="text-sm min-h-[36px] flex-1 min-w-[10rem]" disabled={isPending} />
          <Button size="sm" className="bg-slate-600 hover:bg-slate-700" disabled={isPending || !leftDate} onClick={() => run(() => answerItem(it.id, 'left', msg, leftDate), '送りました', () => setMode(null))}>退職済みとして送る</Button>
          <button type="button" className="text-[11px] text-gray-500 underline" onClick={() => setMode(null)}>やめる</button>
        </div>
      )}

      {!preview && data.me.ops && it.store_answer === 'left' && !followsLeft && (stage === 'store' || stage === 'senior') && canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-slate-100 px-2 py-1.5">
          <p className="text-[11px] text-slate-700 flex-1 min-w-[12rem]">店長から「退職済み」の回答です。案を合わせてから、担当者として承認してください。この方は、直すとこのカードから外れて1人のカードになります。</p>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={isPending}
            onClick={() => run(() => updateItem(it.id, it.employee_id ? { action: 'stop', stop_reason: 'left' } : { action: 'skip' }), '案を直しました')}>
            {it.employee_id ? '「アカウントを止める（退職）」にする' : '「MB は使わない」にする'}
          </Button>
        </div>
      )}

      {!preview && (
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          {canEdit && <button type="button" className="text-orange-700 underline" onClick={() => setEditing(v => !v)}>{editing ? '閉じる' : 'この方だけ案を直す'}</button>}
          {showApprove && (it.ops_approved
            ? <button type="button" className="text-gray-600 underline" disabled={isPending} onClick={() => run(() => approveItem(it.id, false, it.ops_note ?? ''), '承認を外しました')}>承認を外す</button>
            : <button type="button" className="text-emerald-700 underline" disabled={isPending} onClick={() => run(() => approveItem(it.id, true, it.ops_note ?? ''), '承認しました')}>この方を担当者として承認</button>)}
          <button type="button" className="flex items-center gap-1 text-gray-500" onClick={() => setOpenThread(v => !v)}>
            {openThread ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}<MessageSquare className="w-3 h-3" />やりとり（{thread.length}）
          </button>
        </div>
      )}
      {it.ops_note && !preview && <p className="text-[11px] text-gray-600">担当者のメモ: {it.ops_note}</p>}
      {!preview && it.apply_result && <p className={`text-xs ${it.apply_result.startsWith('×') ? 'text-red-700' : 'text-emerald-700'}`}>反映: {it.apply_result.replace(/^×/, '')}</p>}
      {editing && <ItemEditor it={it} data={data} stage={stage} pending={isPending} onSave={p => run(() => updateItem(it.id, p), '保存しました')} />}
      {openThread && !preview && (
        <div className="space-y-1">
          {thread.map(c => (
            <p key={c.id} className="text-xs text-gray-700 whitespace-pre-wrap"><span className="text-gray-500">{data.people[c.author_id]?.name ?? ''} {fmt(c.created_at)}:</span> {c.body}</p>
          ))}
          {stage !== 'done' && (data.me.ops || data.me.senior || stage === 'store') && (
            <div className="flex gap-2">
              <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="この方について書く" className="text-sm min-h-[40px]" disabled={isPending} />
              <Button size="sm" variant="outline" disabled={isPending || !comment.trim()} onClick={() => run(async () => { const r = await addComment(data.batch.id, it.id, comment); if (!r.error) setComment(''); return r }, '送りました')}>送る</Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
