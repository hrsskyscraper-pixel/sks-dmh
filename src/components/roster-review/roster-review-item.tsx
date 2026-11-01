'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { addComment, answerItem, approveItem, updateItem, type ItemPatch } from '@/app/(dashboard)/roster-review/actions'
import { ACTION_LABEL, describeChange, isApplicable, STOP_REASON_LABEL } from '@/lib/roster-review'
import type { RosterReviewAction, RosterReviewItemRow, RosterReviewStage } from '@/types/database'
import type { ReviewData } from './roster-review'

const fmt = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export type ItemCtx = {
  data: ReviewData
  stage: RosterReviewStage
  canEdit: boolean
  /** 店長として答えられる（その店舗のリーダー）か、代わりに入れられる（原島さん） */
  canAnswer: (it: RosterReviewItemRow) => boolean
  toStore: (it: RosterReviewItemRow) => boolean
  /** 店長の画面の見本（須貝・原島さん・上長が、店長にどう見えるかを確かめる。操作はできない） */
  preview?: boolean
}

export function ReviewItem({ it, ctx }: { it: RosterReviewItemRow; ctx: ItemCtx }) {
  const { data, stage } = ctx
  const preview = !!ctx.preview
  // 反映でうまくいかなかった行は、反映の段階でも原島さんが直せる
  const canEdit = !preview && (ctx.canEdit || (stage === 'apply' && data.me.ops && !it.applied_at && (it.apply_result ?? '').startsWith('×')))
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [openThread, setOpenThread] = useState(false)
  const [msg, setMsg] = useState(it.store_message ?? '')
  const [note, setNote] = useState(it.ops_note ?? '')
  const [comment, setComment] = useState('')

  const person = it.employee_id ? data.people[it.employee_id] : null
  const teamName = (id: string) => data.teams.find(t => t.id === id)?.name ?? '（不明）'
  const roleName = (id: string) => data.roles.find(r => r.id === id)?.name ?? '（不明）'
  const current = person ? { employment_type: person.employment_type, team_names: person.team_names, role_names: person.role_ids.map(roleName), role_ids: person.role_ids, permission: person.permission } : null
  const lines = describeChange(it, current, { team: teamName, role: roleName, std: id => data.roles.find(r => r.id === id)?.std ?? null })
  const name = it.roster.name || [it.roster.last_name, it.roster.first_name].filter(Boolean).join(' ') || person?.name || '（氏名なし）'
  const thread = data.comments.filter(c => c.item_id === it.id)
  const toStore = ctx.toStore(it)
  const answeredBy = it.store_answered_by ? data.people[it.store_answered_by]?.name : null
  const showStore = preview || (stage !== 'draft' && stage !== 'ops_preview' && toStore)
  const showApprove = !preview && data.me.ops && (stage === 'store' || stage === 'senior') && isApplicable(it.action)

  const run = (fn: () => Promise<{ error?: string }>, ok?: string) => startTransition(async () => {
    const res = await fn()
    if (res.error) { toast.error(res.error); return }
    if (ok) toast.success(ok)
  })

  return (
    <li className={`rounded-xl border bg-white p-3 space-y-2 ${it.store_answer === 'ng' ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{name}</p>
          <p className="text-[11px] text-gray-500">
            社員リスト: {[it.roster.employment_type, it.roster.store, it.roster.title].filter(Boolean).join('・') || '—'}
            {it.roster.employee_number && !preview ? `（社員番号 ${it.roster.employee_number}）` : ''}
          </p>
          <p className="text-[11px] text-gray-500">
            いまの MB: {person ? [person.employment_type, person.team_names.join('・'), person.role_ids.map(roleName).join('・')].filter(Boolean).join('・') || '—' : 'アカウントなし'}
            {person?.left ? '（止まっています）' : ''}
          </p>
        </div>
        <Badge variant="secondary" className="text-[11px]">{ACTION_LABEL[it.action]}</Badge>
        {!preview && !toStore && isApplicable(it.action) && stage !== 'draft' && <Badge variant="outline" className="text-[11px]">原島さんへ直接</Badge>}
        {!preview && it.ops_approved && <Badge className="text-[11px] bg-emerald-600">担当者承認済み</Badge>}
      </div>

      <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
        <p className="text-[11px] text-orange-700 font-semibold">このように変更します</p>
        <ul className="text-sm text-gray-800 list-disc pl-5">{lines.map(l => <li key={l}>{l}</li>)}</ul>
      </div>

      {!preview && (it.roster.check || it.dev_note || it.ops_preview_note) && (
        <div className="text-[11px] text-gray-600 space-y-0.5">
          {it.roster.check && <p>確認事項: {it.roster.check}</p>}
          {it.dev_note && <p>須貝のメモ: {it.dev_note}</p>}
          {it.ops_preview_note && <p>原島さん（概要の確認で分かったこと）: {it.ops_preview_note}</p>}
        </div>
      )}

      {canEdit && (
        <div>
          <button type="button" className="text-xs text-orange-700 underline" onClick={() => setEditing(v => !v)}>{editing ? '閉じる' : '案を直す'}</button>
          {editing && <ItemEditor it={it} data={data} stage={stage} pending={isPending} onSave={p => run(() => updateItem(it.id, p), '保存しました')} />}
        </div>
      )}

      {showStore && (
        <div className="rounded-lg border border-gray-200 p-2 space-y-1.5">
          <p className="text-xs font-semibold text-gray-700">店長の確認: このように変更しますが、問題ありませんか？</p>
          {it.store_answer && (
            <p className={`text-sm ${it.store_answer === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>
              {it.store_answer === 'ok' ? '問題ない' : '問題ある'}{it.store_message ? `：${it.store_message}` : ''}
              <span className="ml-1 text-[11px] text-gray-500">（{answeredBy ?? ''} {it.store_answered_at ? fmt(it.store_answered_at) : ''}）</span>
            </p>
          )}
          {preview && (
            <>
              <Textarea placeholder="メッセージ（自由記入。「問題ある」のときは、どこが違うかを書いてください）" className="text-sm min-h-[56px]" disabled />
              <div className="flex gap-2">
                <Button size="sm" className="bg-emerald-600" disabled>問題ない</Button>
                <Button size="sm" variant="outline" className="border-red-300 text-red-700" disabled>問題ある</Button>
              </div>
            </>
          )}
          {!preview && !it.store_answer && stage !== 'store' && <p className="text-xs text-gray-500">回答はありません</p>}
          {!preview && stage === 'store' && ctx.canAnswer(it) && (
            <>
              <Textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="メッセージ（自由記入。「問題ある」のときは、どこが違うかを書いてください）" className="text-sm min-h-[56px]" disabled={isPending} />
              <div className="flex gap-2">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={isPending} onClick={() => run(() => answerItem(it.id, 'ok', msg), '送りました')}>問題ない</Button>
                <Button size="sm" variant="outline" className="border-red-300 text-red-700" disabled={isPending} onClick={() => run(() => answerItem(it.id, 'ng', msg), '送りました')}>問題ある</Button>
              </div>
              {data.me.ops && !data.me.ledTeamIds.includes(it.confirm_team_id ?? '') && <p className="text-[11px] text-gray-500">店長から聞いた内容を、代わりに入れることもできます（入れた人として記録されます）。</p>}
            </>
          )}
        </div>
      )}

      {showApprove && (
        <div className="flex flex-wrap items-end gap-2">
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="担当者のメモ（任意）" className="text-sm min-h-[40px] flex-1 min-w-[200px]" disabled={isPending} />
          {it.ops_approved
            ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => approveItem(it.id, false, note), '承認を外しました')}>承認を外す</Button>
            : <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={isPending} onClick={() => run(() => approveItem(it.id, true, note), '承認しました')}>担当者として承認</Button>}
        </div>
      )}
      {!preview && !showApprove && it.ops_note && <p className="text-[11px] text-gray-600">担当者のメモ: {it.ops_note}</p>}

      {!preview && it.apply_result && <p className={`text-xs ${it.apply_result.startsWith('×') ? 'text-red-700' : 'text-emerald-700'}`}>反映: {it.apply_result.replace(/^×/, '')}</p>}

      {!preview && <div>
        <button type="button" className="flex items-center gap-1 text-[11px] text-gray-500" onClick={() => setOpenThread(v => !v)}>
          {openThread ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}<MessageSquare className="w-3 h-3" />この方についてのやりとり（{thread.length}）
        </button>
        {openThread && (
          <div className="mt-1 space-y-1">
            {thread.map(c => (
              <p key={c.id} className="text-xs text-gray-700 whitespace-pre-wrap"><span className="text-gray-500">{data.people[c.author_id]?.name ?? ''} {fmt(c.created_at)}:</span> {c.body}</p>
            ))}
            {stage !== 'done' && (data.me.ops || data.me.senior || stage === 'store') && (
              <div className="flex gap-2">
                <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="この方について書く" className="text-sm min-h-[40px]" disabled={isPending} />
                <Button size="sm" variant="outline" disabled={isPending || !comment.trim()} onClick={() => run(async () => { const r = await addComment(data.batch.id, it.id, comment); if (!r.error) setComment(''); return r })}>送る</Button>
              </div>
            )}
          </div>
        )}
      </div>}
    </li>
  )
}

function ItemEditor({ it, data, stage, pending, onSave }: { it: RosterReviewItemRow; data: ReviewData; stage: RosterReviewStage; pending: boolean; onSave: (p: ItemPatch) => void }) {
  const [action, setAction] = useState<RosterReviewAction>(it.action)
  const [type, setType] = useState(it.target_employment_type ?? '')
  const [team, setTeam] = useState(it.target_team_id ?? '')
  const [roles, setRoles] = useState<string[]>(it.target_role_ids ?? [])
  const [setRolesOn, setSetRolesOn] = useState(it.target_role_ids !== null)
  const [reason, setReason] = useState(it.stop_reason ?? '')
  const [confirmTeam, setConfirmTeam] = useState(it.confirm_team_id ?? '')
  const [skipStore, setSkipStore] = useState(it.skip_store)
  const [devNote, setDevNote] = useState(it.dev_note ?? '')
  const [previewNote, setPreviewNote] = useState(it.ops_preview_note ?? '')
  const actions: RosterReviewAction[] = stage === 'draft' ? ['undecided', 'change', 'issue', 'stop', 'skip', 'none'] : ['change', 'issue', 'stop', 'skip', 'none']
  const sel = 'rounded border border-gray-300 px-1 py-0.5 text-sm'

  const save = () => onSave({
    action,
    target_employment_type: (type || null) as '社員' | 'メイト' | null,
    target_team_id: team || null,
    target_role_ids: setRolesOn ? roles : null,
    stop_reason: (reason || null) as 'left' | 'shared' | 'duplicate' | null,
    confirm_team_id: confirmTeam || null,
    skip_store: skipStore,
    ...(data.me.dev ? { dev_note: devNote } : {}),
    ...(stage === 'ops_preview' ? { ops_preview_note: previewNote } : {}),
  })

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-gray-50 p-2 text-sm">
      <label className="block text-[11px] text-gray-600">どうするか
        <select className={`ml-1 ${sel}`} value={action} onChange={e => setAction(e.target.value as RosterReviewAction)}>
          {actions.map(a => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
        </select>
      </label>
      {(action === 'change' || action === 'issue') && (
        <>
          <label className="block text-[11px] text-gray-600">区分
            <select className={`ml-1 ${sel}`} value={type} onChange={e => setType(e.target.value)}>
              <option value="">{action === 'change' ? '変えない' : '選ぶ'}</option><option value="社員">社員</option><option value="メイト">メイト</option>
            </select>
          </label>
          <label className="block text-[11px] text-gray-600">店舗・部署
            <select className={`ml-1 ${sel} max-w-[16rem]`} value={team} onChange={e => setTeam(e.target.value)}>
              <option value="">{action === 'change' ? '変えない' : '選ぶ'}</option>
              {data.teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.type === 'department' ? '（部署）' : ''}</option>)}
            </select>
          </label>
          <div className="text-[11px] text-gray-600">
            <label className="flex items-center gap-1"><input type="checkbox" checked={setRolesOn} onChange={e => setSetRolesOn(e.target.checked)} />役職を決める{action === 'change' ? '（外すと役職は変えない）' : ''}</label>
            {setRolesOn && (
              <div className="mt-1 flex flex-wrap gap-1">
                {data.roles.map(r => (
                  <button key={r.id} type="button" title={r.fullName ?? undefined}
                    className={`rounded-full border px-2 py-0.5 text-xs ${roles.includes(r.id) ? 'border-orange-500 bg-orange-100 text-orange-800' : 'border-gray-300 bg-white text-gray-600'}`}
                    onClick={() => setRoles(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])}>{r.name}</button>
                ))}
                {roles.length === 0 && <span className="text-xs text-gray-500">（役職なし）</span>}
              </div>
            )}
          </div>
        </>
      )}
      {action === 'stop' && (
        <label className="block text-[11px] text-gray-600">理由
          <select className={`ml-1 ${sel}`} value={reason} onChange={e => setReason(e.target.value)}>
            <option value="">選ぶ</option>
            {(Object.keys(STOP_REASON_LABEL) as (keyof typeof STOP_REASON_LABEL)[]).map(k => <option key={k} value={k}>{STOP_REASON_LABEL[k]}</option>)}
          </select>
        </label>
      )}
      <label className="block text-[11px] text-gray-600">確認してもらう店舗（店長に回す）
        <select className={`ml-1 ${sel} max-w-[16rem]`} value={confirmTeam} onChange={e => setConfirmTeam(e.target.value)}>
          <option value="">なし（原島さんへ直接）</option>
          {data.teams.filter(t => t.type === 'store').map(t => <option key={t.id} value={t.id}>{t.name}{data.ledTeamIds.includes(t.id) ? '' : '（店長の登録なし）'}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1 text-[11px] text-gray-600"><input type="checkbox" checked={skipStore} onChange={e => setSkipStore(e.target.checked)} />店長には回さない（ここで決まった）</label>
      {data.me.dev && <Textarea value={devNote} onChange={e => setDevNote(e.target.value)} placeholder="須貝のメモ（店長には見えません）" className="text-sm min-h-[40px]" />}
      {stage === 'ops_preview' && <Textarea value={previewNote} onChange={e => setPreviewNote(e.target.value)} placeholder="この時点で分かること（原島さん）" className="text-sm min-h-[40px]" />}
      <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={pending} onClick={save}>保存</Button>
    </div>
  )
}
