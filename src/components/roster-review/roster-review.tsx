'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { addComment, applyChunk, approveAllWithoutStore, moveStage, signoff, updateBatch, type ApplyIssued } from '@/app/(dashboard)/roster-review/actions'
import { goesToStore, isApplicable, STAGE_LABEL, STAGE_ORDER } from '@/lib/roster-review'
import { claimUrl } from '@/lib/account-issue'
import type { RosterReviewBatchRow, RosterReviewItemRow, RosterReviewStage, SystemPermission } from '@/types/database'
import { ReviewItem, type ItemCtx } from './roster-review-item'

export type ReviewData = {
  me: { id: string; dev: boolean; ops: boolean; senior: boolean; ledTeamIds: string[] }
  batches: { id: string; title: string; stage: RosterReviewStage }[]
  batch: RosterReviewBatchRow
  items: RosterReviewItemRow[]
  teams: { id: string; name: string; type: 'store' | 'department' }[]
  /** 店長（リーダー）が登録されている店舗 */
  ledTeamIds: string[]
  roles: { id: string; name: string; fullName: string | null; std: SystemPermission | null }[]
  people: Record<string, { name: string; employment_type: string | null; role_ids: string[]; team_names: string[]; left: boolean; permission: SystemPermission }>
  comments: { id: string; item_id: string | null; author_id: string; stage: string; body: string; created_at: string }[]
  signoffs: { employee_id: string; approved: boolean; comment: string | null; updated_at: string }[]
  seniorCandidates: { id: string; name: string }[]
}

type Filter = 'all' | 'todo' | 'store' | 'direct' | 'ng' | 'unapproved'
const fmt = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export function RosterReview({ data }: { data: ReviewData }) {
  const { me, batch, items } = data
  const stage = batch.stage
  const [isPending, startTransition] = useTransition()
  const [filter, setFilter] = useState<Filter>(me.ops || me.senior ? 'all' : 'todo')
  const [q, setQ] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [confirm, setConfirm] = useState<null | { to: RosterReviewStage; title: string; body: string; label: string }>(null)
  const [stageMsg, setStageMsg] = useState('')
  const [applying, setApplying] = useState(false)
  const [issued, setIssued] = useState<ApplyIssued[]>([])
  const [applyErrors, setApplyErrors] = useState<string[]>([])

  const led = useMemo(() => new Set(data.ledTeamIds), [data.ledTeamIds])
  const toStore = (it: RosterReviewItemRow) => goesToStore(it, led)
  const editable = (me.dev && stage === 'draft') || (me.ops && ['ops_preview', 'store', 'senior'].includes(stage))
  const canAnswer = (it: RosterReviewItemRow) => me.ops || (!!it.confirm_team_id && me.ledTeamIds.includes(it.confirm_team_id))
  const ctx: ItemCtx = { data, stage, canEdit: editable, canAnswer, toStore }

  const applicable = items.filter(it => isApplicable(it.action))
  const storeItems = items.filter(toStore)
  const answered = storeItems.filter(it => it.store_answer).length
  const ngCount = storeItems.filter(it => it.store_answer === 'ng').length
  const approved = applicable.filter(it => it.ops_approved).length
  const undecided = items.filter(it => it.action === 'undecided').length
  const mySign = data.signoffs.find(s => s.employee_id === me.id)
  const seniorsOk = batch.senior_ids.every(id => data.signoffs.some(s => s.employee_id === id && s.approved))

  const shown = items.filter(it => {
    if (teamFilter && it.confirm_team_id !== teamFilter && it.target_team_id !== teamFilter) return false
    if (q) {
      const hay = [it.roster.name, it.roster.last_name, it.roster.first_name, it.roster.last_kana, it.roster.first_kana, it.employee_id ? data.people[it.employee_id]?.name : ''].join(' ')
      if (!hay.includes(q.trim())) return false
    }
    switch (filter) {
      case 'todo':
        if (stage === 'draft') return it.action === 'undecided'
        if (stage === 'store' && !me.ops) return toStore(it) && !it.store_answer
        if (stage === 'store' || stage === 'senior') return isApplicable(it.action) && !it.ops_approved
        return true
      case 'store': return toStore(it)
      case 'direct': return isApplicable(it.action) && !toStore(it)
      case 'ng': return it.store_answer === 'ng'
      case 'unapproved': return isApplicable(it.action) && !it.ops_approved
      default: return true
    }
  })

  const run = (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) => startTransition(async () => {
    const res = await fn()
    if (res.error) { toast.error(res.error); return }
    if (ok) toast.success(ok)
    after?.()
  })
  const ask = (to: RosterReviewStage, title: string, body: string, label: string) => { setStageMsg(''); setConfirm({ to, title, body, label }) }

  const doApply = async () => {
    setApplying(true)
    const runStart = new Date().toISOString()
    const got: ApplyIssued[] = []
    const errs: string[] = []
    try {
      for (let i = 0; i < 200; i++) {
        const res = await applyChunk(batch.id, runStart)
        if (res.error) { toast.error(res.error); break }
        got.push(...res.issued); errs.push(...res.errors)
        setIssued([...got]); setApplyErrors([...errs])
        if (res.remaining === 0) { toast.success('まとめて反映しました'); break }
        if (res.processed === 0) { toast.error(`反映できなかった行が ${res.remaining} 件あります。行を直してから、もう一度「まとめて反映」を押してください`); break }
      }
    } catch {
      toast.error('途中で止まりました。画面を開き直して、もう一度「まとめて反映」を押してください（反映済みの行は2回反映しません）')
    } finally {
      setApplying(false)
      setConfirm(null)
    }
  }

  const teamsInItems = data.teams.filter(t => items.some(it => it.confirm_team_id === t.id || it.target_team_id === t.id))
  const directCount = items.filter(it => isApplicable(it.action) && !toStore(it) && !it.ops_approved).length

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      {data.batches.length > 1 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {data.batches.map(b => <Link key={b.id} href={`/roster-review?batch=${b.id}`} className={`rounded-full border px-3 py-1 ${b.id === batch.id ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-300 text-gray-600'}`}>{b.title}</Link>)}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-base font-bold text-gray-800">{batch.title}</h2>
        <ol className="flex flex-wrap gap-1 text-[11px]">
          {STAGE_ORDER.map(s => (
            <li key={s} className={`rounded-full px-2 py-0.5 ${s === stage ? 'bg-orange-500 text-white font-bold' : STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(stage) ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{STAGE_LABEL[s]}</li>
          ))}
        </ol>
        <p className="text-xs text-gray-600">
          全 {items.length} 行（反映する行 {applicable.length}）・店長に回す {storeItems.length}（回答 {answered}{ngCount ? `・問題ある ${ngCount}` : ''}）・担当者承認 {approved}/{applicable.length}
          {stage === 'draft' && undecided ? `・まだ決めていない ${undecided}` : ''}
        </p>
        {batch.overview && <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-lg bg-gray-50 p-2"><span className="text-[11px] text-gray-500 block">須貝からの概要</span>{batch.overview}</p>}

        <StagePanel data={data} pending={isPending} run={run} ask={ask} seniorsOk={seniorsOk} mySign={mySign}
          counts={{ undecided, unapproved: applicable.length - approved, storeLeft: storeItems.length - answered, directCount }} />
      </div>

      {(stage === 'apply' || stage === 'done') && (issued.length > 0 || applyErrors.length > 0) && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          {issued.length > 0 && <p className="text-sm font-semibold text-emerald-800">発行したアカウントの本人用リンク（本人だけに個別に渡してください。14日で切れます）</p>}
          <ul className="space-y-1">
            {issued.map(x => (
              <li key={x.claimId} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{x.name}</span>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(claimUrl(window.location.origin, x.claimId)); toast.success('リンクをコピーしました') }}><Copy className="w-3 h-3 mr-1" />コピー</Button>
              </li>
            ))}
          </ul>
          {applyErrors.length > 0 && <div className="text-xs text-red-700"><p className="font-semibold">反映できなかった行</p>{applyErrors.map((e, i) => <p key={i}>{e}</p>)}</div>}
          <p className="text-[11px] text-gray-500">あとから出すときは、設定 → アカウントの発行 の「まだ使い始めていない方」からコピーできます。</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {([['all', 'すべて'], ['todo', '対応が要る行'], ['store', '店長に回す行'], ['direct', '原島さんへ直接'], ['ng', '問題ある'], ['unapproved', '承認まだ']] as [Filter, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`rounded-full border px-3 py-1 text-xs ${filter === k ? 'border-orange-500 bg-orange-50 text-orange-800' : 'border-gray-300 text-gray-600'}`}>{l}</button>
        ))}
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="氏名で探す" className="h-8 w-32 text-sm" />
        {teamsInItems.length > 1 && (
          <select className="h-8 rounded border border-gray-300 px-1 text-sm max-w-[12rem]" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
            <option value="">店舗・部署（すべて）</option>
            {teamsInItems.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-500">{shown.length} 行</span>
      </div>

      {shown.length === 0
        ? <p className="text-sm text-gray-500 text-center py-6">{filter === 'todo' ? 'いま対応が要る行はありません。' : '当てはまる行はありません。'}</p>
        : <ul className="space-y-2">{shown.map(it => <ReviewItem key={it.id} it={it} ctx={ctx} />)}</ul>}

      {(me.ops || me.senior) && <BatchThread data={data} pending={isPending} run={run} />}

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={o => { if (!o && !applying) setConfirm(null) }}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.label ?? ''}
        destructive={confirm?.to === 'done'}
        pending={isPending || applying}
        onConfirm={() => {
          if (!confirm) return
          if (confirm.to === 'done') { void doApply(); return }
          run(() => moveStage(batch.id, confirm.to, stageMsg), '進めました', () => setConfirm(null))
        }}
      >
        <p className="text-sm text-gray-600 whitespace-pre-wrap">{confirm?.body}</p>
        {confirm?.to !== 'done' && <Textarea value={stageMsg} onChange={e => setStageMsg(e.target.value)} placeholder="ひとこと（任意。やりとりに残ります）" className="mt-2 text-sm min-h-[56px]" />}
        {applying && <p className="mt-2 text-sm text-gray-600">反映しています…（{issued.length} 件発行）</p>}
      </ConfirmDialog>
    </div>
  )
}

type Run = (fn: () => Promise<{ error?: string }>, ok?: string, after?: () => void) => void

/** いまの段階で、自分がすること */
function StagePanel({ data, pending, run, ask, seniorsOk, mySign, counts }: {
  data: ReviewData; pending: boolean; run: Run
  ask: (to: RosterReviewStage, title: string, body: string, label: string) => void
  seniorsOk: boolean
  mySign: ReviewData['signoffs'][number] | undefined
  counts: { undecided: number; unapproved: number; storeLeft: number; directCount: number }
}) {
  const { me, batch } = data
  const stage = batch.stage
  const [overview, setOverview] = useState(batch.overview ?? '')
  const [seniors, setSeniors] = useState<string[]>(batch.senior_ids)
  const [signComment, setSignComment] = useState(mySign?.comment ?? '')
  const seniorName = (id: string) => data.people[id]?.name ?? data.seniorCandidates.find(c => c.id === id)?.name ?? '（不明）'
  const box = 'rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2'

  const seniorList = (
    <ul className="text-sm space-y-1">
      {batch.senior_ids.map(id => {
        const s = data.signoffs.find(x => x.employee_id === id)
        return (
          <li key={id}>
            <span className="font-semibold">{seniorName(id)}</span>
            <span className={`ml-2 text-xs ${s?.approved ? 'text-emerald-700' : 'text-gray-500'}`}>{s?.approved ? '承認しました' : s ? 'コメントのみ' : 'まだ'}</span>
            {s?.comment && <span className="block text-xs text-gray-700 whitespace-pre-wrap">「{s.comment}」<span className="text-gray-400"> {fmt(s.updated_at)}</span></span>}
          </li>
        )
      })}
    </ul>
  )

  if (stage === 'draft' && me.dev) {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-orange-800">下書きです。行ごとに変更案を決めて、原島さんに確認を依頼します</p>
        <Textarea value={overview} onChange={e => setOverview(e.target.value)} placeholder="原島さんへの概要（何件・どんな違いがあったか、見てほしいところ）" className="text-sm min-h-[72px]" />
        <div className="text-xs text-gray-700">
          <p className="font-semibold">原島さんの確認結果を承認する上長</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {data.seniorCandidates.map(c => (
              <button key={c.id} type="button" onClick={() => setSeniors(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])}
                className={`rounded-full border px-2 py-0.5 ${seniors.includes(c.id) ? 'border-orange-500 bg-white text-orange-800 font-semibold' : 'border-gray-300 text-gray-600'}`}>{c.name}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => updateBatch(batch.id, { overview, senior_ids: seniors }), '保存しました')}>概要と上長を保存</Button>
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={pending || counts.undecided > 0}
            onClick={() => ask('ops_preview', '原島さんに確認を依頼します', '概要と変更案を原島さんに回します。原島さんのホームに「確認のお願い」が出ます。社内の連絡手段でも一声かけてください。', '原島さんに確認を依頼する')}>原島さんに確認を依頼する</Button>
        </div>
        {counts.undecided > 0 && <p className="text-[11px] text-red-600">「まだ決めていない」行が {counts.undecided} 件あります。</p>}
      </div>
    )
  }
  if (stage === 'ops_preview' && me.ops) {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-orange-800">概要の確認をお願いします</p>
        <p className="text-xs text-gray-700">いま分かることは、行ごとの「案を直す」の「この時点で分かること」に書いてください。ここで決まった行は「店長には回さない」にすると、店長の確認を飛ばします。終わったら、店長に確認を依頼してください（店長のホームに「確認のお願い」が出ます。社内の連絡手段でも一声かけてください）。</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={pending}
            onClick={() => ask('store', '店長に確認を依頼します', `店長に回す行を、それぞれの店舗の店長に見せます。店舗の無い方の行と「店長には回さない」行は、原島さんの担当者承認に進みます。\n店長のホームに「確認のお願い」が出ます。社内の連絡手段でも、店長に一声かけてください。`, '店長に確認を依頼する')}>店長に確認を依頼する</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => ask('draft', '須貝に戻します', '下書きに戻します。戻す理由を、ひとことに書いてください。', '須貝に戻す')}>須貝に戻す</Button>
        </div>
      </div>
    )
  }
  if (stage === 'store' && me.ops) {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-orange-800">店長の回答を見ながら、担当者として承認してください</p>
        <p className="text-xs text-gray-700">店長の回答がまだ {counts.storeLeft} 件・担当者承認がまだ {counts.unapproved} 件。すべて承認したら、上長に確認を依頼します。</p>
        <div className="flex flex-wrap gap-2">
          {counts.directCount > 0 && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => approveAllWithoutStore(batch.id), '承認しました')}>店長に回さない行をまとめて承認（{counts.directCount}）</Button>}
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={pending || counts.unapproved > 0}
            onClick={() => ask('senior', '上長に確認を依頼します', `${batch.senior_ids.map(seniorName).join('・')} に、担当者承認した変更案を回します。おふたりのホームに「確認のお願い」が出ます。`, '上長に確認を依頼する')}>上長に確認を依頼する</Button>
        </div>
      </div>
    )
  }
  if (stage === 'store' && !me.ops) {
    return <div className={box}><p className="text-sm font-semibold text-orange-800">あなたの店舗の方の変更案です。1行ずつ「問題ない」か「問題ある」を選んでください（メッセージも書けます）</p></div>
  }
  if (stage === 'senior') {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-orange-800">上長の確認</p>
        {seniorList}
        {me.senior && (
          <div className="space-y-1">
            <Textarea value={signComment} onChange={e => setSignComment(e.target.value)} placeholder="コメント（全体について。1行ずつのコメントは各行のやりとりへ）" className="text-sm min-h-[56px]" />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={() => run(() => signoff(batch.id, true, signComment), '承認しました')}>{mySign?.approved ? '承認（コメントを直す）' : '承認する'}</Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => signoff(batch.id, false, signComment), 'コメントを送りました')}>{mySign?.approved ? '承認を取り消して、コメントだけにする' : 'コメントだけ送る'}</Button>
            </div>
          </div>
        )}
        {me.ops && (
          <div className="space-y-1 border-t border-orange-200 pt-2">
            <p className="text-xs text-gray-700">上長のコメントを受けて、必要なら上長・店長と調整し、変更案を直してください（直すと、上長の承認はやり直しになります）。会社としての変更案が決まったら、須貝に依頼します。</p>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={pending || !seniorsOk || counts.unapproved > 0}
              onClick={() => ask('dev_check', 'アカウントの変更処理を会社として決定し、須貝に依頼します', 'この内容を、会社としての変更案として確定します。須貝が確認したあと、反映をお願いします。', 'アカウントの変更処理を会社として決定。これで依頼する。')}>アカウントの変更処理を会社として決定。これで依頼する。</Button>
            {!seniorsOk && <p className="text-[11px] text-gray-500">上長全員の承認がそろうと押せます。</p>}
            {counts.unapproved > 0 && <p className="text-[11px] text-red-600">担当者承認がまだの行が {counts.unapproved} 件あります。</p>}
          </div>
        )}
      </div>
    )
  }
  if (stage === 'dev_check') {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-orange-800">会社としての変更案が決まりました（{batch.decided_at ? fmt(batch.decided_at) : ''}）。須貝が確認します</p>
        {seniorList}
        {me.dev && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={pending}
              onClick={() => ask('apply', '原島さんに反映を依頼します', '確認が済みました。原島さんの画面に「まとめて反映」が出ます。', '確認しました。反映を依頼する')}>確認しました。反映を依頼する</Button>
            <Button size="sm" variant="outline" disabled={pending}
              onClick={() => ask('senior', '原島さんと調整します', '上長の確認と会社としての決定の段階に戻します。調整したいことを、ひとことに書いてください。', '原島さんと調整する（戻す）')}>原島さんと調整する（戻す）</Button>
          </div>
        )}
      </div>
    )
  }
  if (stage === 'apply') {
    return (
      <div className={box}>
        <p className="text-sm font-semibold text-orange-800">須貝の確認が済みました。まとめて反映してください</p>
        {me.ops && (
          <Button size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={pending}
            onClick={() => ask('done', 'まとめて反映します', `反映する行をすべて、MB に反映します。\n・内容を直す: 区分・役職・店舗を変えます（役職を付けると、承認の権限が役職の標準まで上がります）\n・アカウントを止める: 今日の日付で退職日を入れ、ログインしても使えなくなります\n・アカウントを発行する: 社員データと本人用のリンクを作ります\nあとから1件ずつ直すことはできますが、まとめて元に戻すことはできません。`, 'まとめて反映する')}>まとめて反映</Button>
        )}
      </div>
    )
  }
  if (stage === 'done') {
    return <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-semibold text-emerald-800">反映しました{batch.applied_at ? `（${fmt(batch.applied_at)}）` : ''}。行ごとの結果は、各行の「反映」に出ています。</p></div>
  }
  return <div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-600">いまは「{STAGE_LABEL[stage]}」の段階です。</p></div>
}

function BatchThread({ data, pending, run }: { data: ReviewData; pending: boolean; run: Run }) {
  const [body, setBody] = useState('')
  const list = data.comments.filter(c => !c.item_id)
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      <p className="text-sm font-semibold text-gray-800">全体のやりとり</p>
      {list.length === 0 && <p className="text-xs text-gray-500">まだありません</p>}
      {list.map(c => (
        <p key={c.id} className="text-xs text-gray-700 whitespace-pre-wrap"><span className="text-gray-500">{data.people[c.author_id]?.name ?? ''} {fmt(c.created_at)}（{STAGE_LABEL[c.stage as RosterReviewStage] ?? c.stage}）:</span> {c.body}</p>
      ))}
      {data.batch.stage !== 'done' && (
        <div className="flex gap-2">
          <Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="全体について書く" className="text-sm min-h-[40px]" disabled={pending} />
          <Button size="sm" variant="outline" disabled={pending || !body.trim()} onClick={() => run(async () => { const r = await addComment(data.batch.id, null, body); if (!r.error) setBody(''); return r })}>送る</Button>
        </div>
      )}
    </div>
  )
}
