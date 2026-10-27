'use client'

import { useMemo, useState, useTransition } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Copy, Upload, UserPlus, AlertTriangle, RefreshCw, Link2 } from 'lucide-react'
import { issueAccounts, reissueClaim, type IssueInput, type IssuedAccount } from '@/app/(dashboard)/admin/account-issue/actions'
import { declineAccountRequest } from '@/app/(dashboard)/account-request/actions'
import { claimUrl, isValidDate, normEmployeeNumber, parseEmploymentType } from '@/lib/account-issue'
import { normalizeDeptName } from '@/lib/roster-affiliation'

type Team = { id: string; name: string; type: string }
type Role = { id: string; name: string; fullName: string | null; std: 'training_member' | 'training_leader' | 'ops_admin' | null }
export type UnclaimedAccount = {
  id: string
  name: string
  employmentType: string
  teams: string[]
  issuedAt: string
  claimId: string | null
  expiresAt: string | null
}
type Perm = IssueInput['permission']
/** 役職の標準の承認の権限（案B）。発行で付けられるのはリーダーまでなので、運用管理者の役職もリーダーにする */
const stdPermOf = (roleIds: string[], roles: Role[]): Perm =>
  roles.some(r => roleIds.includes(r.id) && (r.std === 'training_leader' || r.std === 'ops_admin')) ? 'training_leader' : 'training_member'
const wider = (a: Perm, b: Perm): Perm => (a === 'training_leader' || b === 'training_leader' ? 'training_leader' : 'training_member')
export type AccountRequestItem = {
  id: string; lastName: string; firstName: string; lastKana: string | null; firstKana: string | null
  employeeNumber: string | null; employmentType: '社員' | 'メイト' | null; teamId: string | null; businessRoleIds: string[]
  hireDate: string | null; note: string | null; requestedBy: string; createdAt: string
  /** 依頼した人がリーダーとして担当していない店舗の依頼 */
  outsideTeam: boolean
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '')
const norm = (s: string) => s.replace(/[\s　]+/g, '').normalize('NFKC').toLowerCase()
const inputCls = 'w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm'

/** 見出しの揺れを吸収する（社員リストは人事の手元の形式で来るため） */
const HEADER_ALIASES: Record<string, string[]> = {
  number: ['従業員番号', '社員番号', '社員No', '社員コード'],
  last: ['姓'],
  first: ['名'],
  lastKana: ['姓(カナ)', 'セイ', '姓カナ', '姓(ふりがな)'],
  firstKana: ['名(カナ)', 'メイ', '名カナ', '名(ふりがな)'],
  type: ['社員区分', '区分', '雇用区分', '社員／PA', '社員/PA'],
  dept: ['メインの所属部署', '店舗部署', '所属', '店舗', '勤務場所'],
  roles: ['役職', '役職(組織図)'],
  hire: ['入社年月日', '入社日'],
  perm: ['承認の権限', '権限', '承認の権限(リーダー/メンバー)'],
}

function copy(text: string, done = 'コピーしました') {
  navigator.clipboard.writeText(text).then(() => toast.success(done), () => toast.error('コピーできませんでした'))
}

/** 「2026/4/1」「2026-04-01」「20260401」を YYYY-MM-DD に。読めない・ありえない日付は null */
function parseDate(raw: string | undefined): string | null {
  const t = (raw ?? '').trim().normalize('NFKC')
  let m = t.match(/^(\d{4})[/\-.年](\d{1,2})[/\-.月](\d{1,2})日?$/)
  let d: string | null = null
  if (m) d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  else if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) d = `${m[1]}-${m[2]}-${m[3]}`
  return d && isValidDate(d) ? d : null
}

type CsvRow = {
  line: number
  input: Omit<IssueInput, 'teamId' | 'businessRoleIds'> & { teamId: string | null; businessRoleIds: string[] }
  deptRaw: string
  problems: string[]
  warnings: string[]
}

/**
 * 管理者側でのアカウント発行（2026-10-27）。
 * 招待リンクから本人が登録すると、区分（社員／メイト）や店舗を選び間違えることがあるため、
 * 運用管理者が社員リスト（正）の内容で社員データを先に作り、本人には「ログインするだけ」のリンクを渡す。
 */
/** 発行の前に、人事の社員リスト（正）と照らし合わせたことを確かめるチェック */
function RosterCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
      <input type="checkbox" className="mt-1" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>人事の社員リストで確認した（氏名・区分・店舗・役職が、社員リストのとおりであること）</span>
    </label>
  )
}

export function AccountIssue({ teams, roles, aliases, existing, unclaimed, recentlyClaimed, requests, openRequestCount }: {
  teams: Team[]
  roles: Role[]
  aliases: { rosterName: string; teamId: string }[]
  existing: { name: string; employeeNumber: string | null }[]
  unclaimed: UnclaimedAccount[]
  recentlyClaimed: { id: string; name: string; email: string; claimedAt: string }[]
  requests: AccountRequestItem[]
  openRequestCount: number
}) {
  const [isPending, startTransition] = useTransition()
  const [justIssued, setJustIssued] = useState<IssuedAccount[]>([])
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const existingNames = useMemo(() => new Set(existing.map(e => norm(e.name))), [existing])
  const existingNumbers = useMemo(() => new Set(existing.map(e => e.employeeNumber).filter((x): x is string => !!x).map(normEmployeeNumber)), [existing])
  const teamByName = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const t of teams) { const k = normalizeDeptName(t.name); m.set(k, m.has(k) ? null : t.id) }
    for (const a of aliases) m.set(a.rosterName, a.teamId)
    return m
  }, [teams, aliases])
  const roleByName = useMemo(() => new Map(roles.map(r => [norm(r.name), r.id])), [roles])

  /**
   * 50件ずつに分けて発行する。発行できた分は onIssued で知らせる（表から外して、押し直しで重ねて作らないように）
   */
  const run = (inputs: IssueInput[], onIssued: (count: number) => void, after?: () => void) => startTransition(async () => {
    let total = 0
    for (let i = 0; i < inputs.length; i += 50) {
      const res = await issueAccounts(inputs.slice(i, i + 50), { rosterChecked: true, offset: i })
      if (res.issued.length > 0) { setJustIssued(prev => [...res.issued, ...prev]); onIssued(res.issued.length); total += res.issued.length }
      if (res.error) { toast.error(total > res.issued.length ? `${res.error}（ここまでに合わせて${total}人を発行しました）` : res.error); return }
    }
    toast.success(`${total}人のアカウントを発行しました`)
    after?.()
  })

  // ── 1人ずつ ──
  const blank = { last: '', first: '', lastKana: '', firstKana: '', number: '', hire: '', type: '' as '' | '社員' | 'メイト', teamId: '', roleIds: [] as string[], perm: 'training_member' as Perm }
  const [one, setOne] = useState(blank)
  // 発行する前に、人事の社員リストで確かめたことのチェック（2026-10-27 須貝さん）
  const [oneChecked, setOneChecked] = useState(false)
  // 依頼から入れた内容で発行するときの依頼の id（発行できたら依頼を「発行済み」にする）
  const [oneRequestId, setOneRequestId] = useState<string | null>(null)
  const [declining, setDeclining] = useState<{ id: string; reason: string } | null>(null)
  const [handled, setHandled] = useState<Set<string>>(new Set())
  const openRequests = requests.filter(r => !handled.has(r.id))
  const fillFromRequest = (r: AccountRequestItem) => {
    setOne({
      last: r.lastName, first: r.firstName, lastKana: r.lastKana ?? '', firstKana: r.firstKana ?? '', number: r.employeeNumber ?? '',
      hire: r.hireDate ?? '', type: r.employmentType ?? '', teamId: r.teamId ?? '', roleIds: r.businessRoleIds, perm: stdPermOf(r.businessRoleIds, roles),
    })
    setOneRequestId(r.id); setOneChecked(false)
    document.getElementById('issue-one')?.scrollIntoView({ behavior: 'smooth' })
  }
  const decline = () => declining && startTransition(async () => {
    const res = await declineAccountRequest(declining.id, declining.reason)
    if (res.error) { toast.error(res.error); return }
    setHandled(prev => new Set(prev).add(declining.id)); setDeclining(null)
    toast.success('依頼を見送りにしました（依頼した方に理由が見えます）')
  })
  const [csvChecked, setCsvChecked] = useState(false)
  const oneName = norm(one.last + one.first)
  const oneProblems = [
    !one.last.trim() && '姓を入れてください',
    !one.type && '社員かメイトかを選んでください',
    !one.teamId && '店舗・部署を選んでください',
    one.number.trim() && existingNumbers.has(normEmployeeNumber(one.number)) && 'この社員番号は、すでにほかの方に登録されています',
  ].filter((x): x is string => !!x)
  const oneWarn = oneName && existingNames.has(oneName) ? '同じ氏名の方が、すでに Mission Board にいます。重ねて作らないよう、確かめてから発行してください' : ''

  // ── CSV で一括 ──
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [fileName, setFileName] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const handleFile = (file: File) => {
    setFileName(file.name)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => {
        const fields = result.meta.fields ?? []
        const find = (k: string) => fields.find(f => HEADER_ALIASES[k].some(a => norm(f) === norm(a))) ?? null
        const f = Object.fromEntries(Object.keys(HEADER_ALIASES).map(k => [k, find(k)])) as Record<string, string | null>
        if (!f.last || !f.type || !f.dept) {
          toast.error('「姓」「社員区分」「メインの所属部署（または店舗部署）」の列が見つかりません')
          setCsvRows([])
          return
        }
        if (!f.perm) toast.message('「承認の権限」の列がないので、役職の標準の権限（店長などはリーダー、ほかはメンバー）にしました。変えるときは表の中で選んでください')
        setCsvChecked(false)
        const seen = new Set<string>()
        setCsvRows(result.data.map((r, i) => {
          const get = (k: string) => (f[k] ? (r[f[k]!] ?? '').trim() : '')
          const number = get('number').normalize('NFKC')
          const type = parseEmploymentType(get('type'))
          const deptRaw = get('dept')
          const teamId = deptRaw ? teamByName.get(normalizeDeptName(deptRaw)) ?? null : null
          const roleNames = get('roles').split(/[・/／、,]/).map(s => s.trim()).filter(Boolean)
          const unknownRoles = roleNames.filter(n => !roleByName.has(norm(n)))
          const permRaw = get('perm')
          const roleIdsOfRow = roleNames.map(n => roleByName.get(norm(n))).filter((x): x is string => !!x)
          // 列の値と、役職の標準の承認の権限の広い方
          const perm: Perm = wider(/リーダー|leader/i.test(permRaw) ? 'training_leader' : 'training_member', stdPermOf(roleIdsOfRow, roles))
          const problems: string[] = []
          const warnings: string[] = []
          if (!get('last')) problems.push('姓が空です')
          if (!type) problems.push(`区分「${get('type') || '空'}」が、社員かメイトか分かりません`)
          if (!teamId) problems.push(deptRaw ? `「${deptRaw}」がどの店舗・部署か分かりません（下で選んでください）` : '店舗・部署が空です')
          if (unknownRoles.length) problems.push(`役職の一覧にない役職: ${unknownRoles.join('・')}（先に「社内役職マスタ」に足してください）`)
          if (number && existingNumbers.has(normEmployeeNumber(number))) problems.push('この社員番号は、すでに Mission Board にいます')
          if (number && seen.has(normEmployeeNumber(number))) problems.push('社員番号が、ほかの行と重なっています')
          if (number) seen.add(normEmployeeNumber(number))
          if (get('hire') && !parseDate(get('hire'))) problems.push(`入社日「${get('hire')}」が日付として読めません（2026/4/1 の形にしてください）`)
          if (existingNames.has(norm(get('last') + get('first')))) warnings.push('同じ氏名の方が、すでに Mission Board にいます')
          return {
            line: i + 2,
            deptRaw,
            problems,
            warnings,
            input: {
              lastName: get('last'), firstName: get('first'), lastKana: get('lastKana') || null, firstKana: get('firstKana') || null,
              employeeNumber: number || null, employmentType: type ?? '社員', teamId,
              businessRoleIds: roleIdsOfRow,
              permission: perm, hireDate: parseDate(get('hire')),
            },
          }
        }))
      },
      error: () => toast.error('CSVを読み込めませんでした'),
    })
  }
  const setCsvTeam = (line: number, teamId: string) => setCsvRows(rows => rows.map(r => r.line !== line ? r : {
    ...r, input: { ...r.input, teamId: teamId || null }, problems: r.problems.filter(p => !p.includes('店舗・部署')).concat(teamId ? [] : ['店舗・部署を選んでください']),
  }))
  const setCsvPerm = (line: number, perm: Perm) => setCsvRows(rows => rows.map(r => r.line !== line ? r : { ...r, input: { ...r.input, permission: perm } }))
  const ready = csvRows.filter(r => r.problems.length === 0)

  // ── 未ログインの一覧 ──
  const [storeFilter, setStoreFilter] = useState('')
  const [links, setLinks] = useState<Record<string, string>>({})
  const shown = unclaimed.filter(u => !storeFilter || u.teams.includes(storeFilter))
  const linkOf = (u: UnclaimedAccount) => links[u.id] ?? u.claimId
  const expired = (u: UnclaimedAccount) => !!u.expiresAt && new Date(u.expiresAt) < new Date() && !links[u.id]
  const reissue = (u: UnclaimedAccount) => startTransition(async () => {
    const res = await reissueClaim(u.id)
    if (res.error || !res.claimId) { toast.error(res.error ?? 'リンクを作れませんでした'); return }
    setLinks(prev => ({ ...prev, [u.id]: res.claimId! }))
    toast.success(`${u.name} さんのリンクを作り直しました。前のリンクは使えなくなりました`)
  })
  const copyList = () => {
    const lines = shown.filter(u => linkOf(u) && !expired(u)).map(u => `${u.name} さん\n${claimUrl(origin, linkOf(u)!)}`)
    if (lines.length === 0) { toast.error('コピーできるリンクがありません'); return }
    copy(lines.join('\n\n'), `${lines.length}人分のリンクをコピーしました`)
  }

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900 space-y-1">
        <p>社員リスト（正）の内容で、社員データを先に作ります。区分・店舗・役職・承認の権限は、ここで決めたとおりになります（本人は選びません）。</p>
        <p>発行すると、本人用のログインリンクができます。本人はリンクを開いて、自分の Google アカウントでログインし、内容を確かめて「この内容で参加します」を押すだけで使い始められます。リンクは1回だけ使え、14日で切れます。</p>
        <p className="font-semibold">リンクは、本人だけに個別に送ってください（グループや掲示には貼らないでください）。リンクを持っている人は、だれでもそのアカウントを使い始められます。</p>
      </div>

      {justIssued.length > 0 && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-emerald-900">いま発行した {justIssued.length}人のリンク</p>
            <Button size="sm" variant="outline" onClick={() => copy(justIssued.map(a => `${a.name} さん\n${claimUrl(origin, a.claimId)}`).join('\n\n'), `${justIssued.length}人分のリンクをコピーしました`)}>
              <Copy className="w-3.5 h-3.5 mr-1" />まとめてコピー
            </Button>
          </div>
          <ul className="space-y-1">
            {justIssued.map(a => (
              <li key={a.employeeId} className="flex items-center justify-between gap-2 text-sm">
                <span>{a.name} さん</span>
                <Button size="sm" variant="ghost" onClick={() => copy(claimUrl(origin, a.claimId))}><Copy className="w-3.5 h-3.5 mr-1" />リンクをコピー</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openRequests.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <h2 className="text-sm font-semibold text-amber-900">発行の依頼（受付中 {openRequests.length}件{openRequestCount > requests.length ? `。古い順に ${requests.length}件を出しています（全部で ${openRequestCount}件）` : ''}）</h2>
          <p className="text-[11px] text-amber-800">「この内容を入れる」で下の欄に入ります。社員リストで確かめ、直してから発行してください。</p>
          <ul className="divide-y divide-amber-200">
            {openRequests.map(r => (
              <li key={r.id} className="py-2 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-800">
                    {r.lastName} {r.firstName} さん
                    <span className="text-xs text-gray-600">（{r.employmentType ?? '区分なし'}・{teams.find(t => t.id === r.teamId)?.name ?? '店舗なし'}{r.businessRoleIds.length ? '・' + r.businessRoleIds.map(id => roles.find(x => x.id === id)?.name).filter(Boolean).join('・') : ''}）</span>
                  </p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => fillFromRequest(r)}>この内容を入れる</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeclining({ id: r.id, reason: '' })}>見送る</Button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600">依頼: {r.requestedBy || '—'}（{fmtDate(r.createdAt)}）{r.note ? ` ／ メモ: ${r.note}` : ''}</p>
                {r.outsideTeam && <p className="text-[11px] text-red-600">依頼した方が担当していない店舗・部署です。社員リストでよく確かめてください</p>}
                {r.businessRoleIds.some(id => roles.find(x => x.id === id)?.std === 'ops_admin') && <p className="text-[11px] text-red-600">運用管理者が標準の役職（部長・役員など）が入っています。発行はリーダーまでです</p>}
                {declining?.id === r.id && (
                  <div className="flex gap-2">
                    <input className={inputCls} placeholder="見送る理由（依頼した方に見えます）" maxLength={300} value={declining.reason} onChange={e => setDeclining({ id: r.id, reason: e.target.value })} />
                    <Button size="sm" disabled={isPending || !declining.reason.trim()} onClick={decline}>見送る</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>やめる</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="issue-one" className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><UserPlus className="w-4 h-4" />1人ずつ発行する{oneRequestId && <span className="text-xs font-normal text-amber-700">（依頼から入れた内容）</span>}</h2>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-600">姓<input className={inputCls} value={one.last} onChange={e => setOne({ ...one, last: e.target.value })} /></label>
          <label className="text-xs text-gray-600">名<input className={inputCls} value={one.first} onChange={e => setOne({ ...one, first: e.target.value })} /></label>
          <label className="text-xs text-gray-600">せい（ふりがな）<input className={inputCls} value={one.lastKana} onChange={e => setOne({ ...one, lastKana: e.target.value })} /></label>
          <label className="text-xs text-gray-600">めい（ふりがな）<input className={inputCls} value={one.firstKana} onChange={e => setOne({ ...one, firstKana: e.target.value })} /></label>
          <label className="text-xs text-gray-600">社員番号<input className={inputCls} value={one.number} onChange={e => setOne({ ...one, number: e.target.value })} /></label>
          <label className="text-xs text-gray-600">入社日<input type="date" className={inputCls} value={one.hire} onChange={e => setOne({ ...one, hire: e.target.value })} /></label>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-600">区分</p>
          <div className="flex gap-2">
            {(['社員', 'メイト'] as const).map(t => (
              <Button key={t} size="sm" type="button" variant={one.type === t ? 'default' : 'outline'} onClick={() => setOne({ ...one, type: t })}>{t}</Button>
            ))}
          </div>
        </div>
        <label className="block text-xs text-gray-600">店舗・部署
          <select className={inputCls} value={one.teamId} onChange={e => setOne({ ...one, teamId: e.target.value })}>
            <option value="">選んでください</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <div className="space-y-1">
          <p className="text-xs text-gray-600">役職（いくつでも）</p>
          <div className="flex flex-wrap gap-2">
            {roles.map(r => (
              <label key={r.id} className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={one.roleIds.includes(r.id)} onChange={e => {
                  const roleIds = e.target.checked ? [...one.roleIds, r.id] : one.roleIds.filter(x => x !== r.id)
                  setOne({ ...one, roleIds, perm: wider(one.perm, stdPermOf(roleIds, roles)) })
                }} />
                <span title={r.fullName ?? undefined}>{r.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-gray-600">承認の権限</p>
          <div className="flex gap-2">
            <Button size="sm" type="button" variant={one.perm === 'training_member' ? 'default' : 'outline'} disabled={stdPermOf(one.roleIds, roles) === 'training_leader'} onClick={() => setOne({ ...one, perm: 'training_member' })}>メンバー</Button>
            <Button size="sm" type="button" variant={one.perm === 'training_leader' ? 'default' : 'outline'} onClick={() => setOne({ ...one, perm: 'training_leader' })}>リーダー</Button>
          </div>
          {one.perm === 'training_leader' && <p className="text-[11px] text-gray-500">リーダーにすると、選んだ店舗・部署のリーダーにも登録されます（その店舗の申請が届きます）。</p>}
        </div>
        {oneProblems.length > 0 && <p className="text-xs text-gray-500">{oneProblems.join(' ／ ')}</p>}
        {oneWarn && <p className="text-xs text-amber-700 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{oneWarn}</p>}
        <RosterCheck checked={oneChecked} onChange={setOneChecked} />
        <Button disabled={isPending || oneProblems.length > 0 || !oneChecked} onClick={() => run([{
          lastName: one.last, firstName: one.first, lastKana: one.lastKana || null, firstKana: one.firstKana || null,
          employeeNumber: one.number || null, employmentType: one.type as '社員' | 'メイト', teamId: one.teamId,
          businessRoleIds: one.roleIds, permission: one.perm, hireDate: one.hire || null, requestId: oneRequestId,
        }], () => { if (oneRequestId) setHandled(prev => new Set(prev).add(oneRequestId)) }, () => { setOne(blank); setOneChecked(false); setOneRequestId(null) })}>
          発行する
        </Button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Upload className="w-4 h-4" />社員リスト（CSV）から一括で発行する</h2>
        <p className="text-xs text-gray-500">
          見出しは「従業員番号」「姓」「名」「姓 (カナ)」「名 (カナ)」「社員区分」「メインの所属部署」「役職」「入社年月日」「承認の権限（リーダー／メンバー）」。発行したい方の行だけを入れてください。
          社員区分の「アルバイト」「パート」はメイト、「正社員」「契約」「役員」は社員になります。
        </p>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-teal-700">
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleFile(file); e.target.value = '' }} />
          <Upload className="w-4 h-4" />CSV を選ぶ{fileName && <span className="text-gray-500">（{fileName}）</span>}
        </label>
        {csvRows.length > 0 && (
          <>
            <p className="text-xs text-gray-600">{csvRows.length}行のうち、発行できるのは {ready.length}行です。赤い行は直してから読み込み直すか、ここで選んでください。</p>
            <div className="max-h-96 overflow-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0"><tr><th className="p-1.5 text-left">行</th><th className="p-1.5 text-left">氏名</th><th className="p-1.5 text-left">区分</th><th className="p-1.5 text-left">店舗・部署</th><th className="p-1.5 text-left">役職</th><th className="p-1.5 text-left">権限</th></tr></thead>
                <tbody>
                  {csvRows.map(r => (
                    <tr key={r.line} className={r.problems.length ? 'bg-red-50' : r.warnings.length ? 'bg-amber-50' : ''}>
                      <td className="p-1.5 align-top">{r.line}</td>
                      <td className="p-1.5 align-top">
                        {r.input.lastName} {r.input.firstName}
                        {[...r.problems, ...r.warnings].map(p => <p key={p} className={r.problems.includes(p) ? 'text-red-600' : 'text-amber-700'}>{p}</p>)}
                      </td>
                      <td className="p-1.5 align-top">{r.problems.some(p => p.startsWith('区分')) ? '' : r.input.employmentType}</td>
                      <td className="p-1.5 align-top">
                        <select className="rounded border border-gray-300 px-1 py-0.5" value={r.input.teamId ?? ''} onChange={e => setCsvTeam(r.line, e.target.value)}>
                          <option value="">{r.deptRaw ? `（${r.deptRaw}）を選ぶ` : '選んでください'}</option>
                          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="p-1.5 align-top">{r.input.businessRoleIds.map(id => roles.find(x => x.id === id)?.name).join('・')}</td>
                      <td className="p-1.5 align-top">
                        <select className="rounded border border-gray-300 px-1 py-0.5" value={r.input.permission} onChange={e => setCsvPerm(r.line, e.target.value as Perm)}>
                          <option value="training_member" disabled={stdPermOf(r.input.businessRoleIds, roles) === 'training_leader'}>メンバー</option>
                          <option value="training_leader">リーダー</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <RosterCheck checked={csvChecked} onChange={setCsvChecked} />
            <Button disabled={isPending || ready.length === 0 || !csvChecked} onClick={() => setConfirmOpen(true)}>{ready.length}人を発行する</Button>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title={`${ready.length}人のアカウントを発行します`}
              confirmLabel="発行する"
              destructive={false}
              pending={isPending}
              onConfirm={() => {
                const lines = ready.map(r => r.line)
                let done = 0
                run(ready.map(r => ({ ...r.input, teamId: r.input.teamId! })), count => {
                  // 発行できた行を表から外す（送った順に発行されるので、先頭から count 行）
                  const issuedLines = new Set(lines.slice(done, done + count)); done += count
                  setCsvRows(rows => rows.filter(r => !issuedLines.has(r.line)))
                }, () => { setCsvRows([]); setFileName(''); setCsvChecked(false) })
                setConfirmOpen(false)
              }}
            >
              <p className="text-sm text-gray-600">表のとおりの区分・店舗・役職・権限で、社員データと本人用のリンクを作ります。黄色の行（同じ氏名の方がいる）も発行されます。重ねて作っていないか、先に確かめてください。発行した社員データは、退職日を入れると止められます。</p>
            </ConfirmDialog>
          </>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Link2 className="w-4 h-4" />まだログインしていない方（{unclaimed.length}人）</h2>
          <div className="flex items-center gap-2">
            <select className="rounded border border-gray-300 px-2 py-1 text-xs" value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
              <option value="">すべての店舗・部署</option>
              {[...new Set(unclaimed.flatMap(u => u.teams))].sort().map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={copyList}><Copy className="w-3.5 h-3.5 mr-1" />表示中の分をコピー</Button>
          </div>
        </div>
        {shown.length === 0 ? <p className="text-xs text-gray-500">いません。</p> : (
          <ul className="divide-y">
            {shown.map(u => (
              <li key={u.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm text-gray-800">{u.name} <span className="text-xs text-gray-500">（{u.employmentType}・{u.teams.join('・') || '所属なし'}）</span></p>
                  <p className="text-[11px] text-gray-500">
                    発行 {fmtDate(u.issuedAt)}
                    {linkOf(u) ? (expired(u) ? ' ・リンクの期限が切れています' : !links[u.id] && u.expiresAt ? ` ・リンクの期限 ${fmtDate(u.expiresAt)}` : '') : ' ・使えるリンクがありません'}
                  </p>
                </div>
                <div className="flex gap-1">
                  {linkOf(u) && !expired(u) && <Button size="sm" variant="ghost" onClick={() => copy(claimUrl(origin, linkOf(u)!))}><Copy className="w-3.5 h-3.5 mr-1" />リンクをコピー</Button>}
                  <Button size="sm" variant="ghost" disabled={isPending} onClick={() => reissue(u)}><RefreshCw className="w-3.5 h-3.5 mr-1" />作り直す</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">最近つながった方（30日）</h2>
        <p className="text-[11px] text-gray-500">どの Google アカウントでつながったかを出しています。ご本人のものでなさそうなときは、その方に確かめてください。</p>
        {recentlyClaimed.length === 0 ? <p className="text-xs text-gray-500">いません。</p> : (
          <ul className="divide-y text-sm">
            {recentlyClaimed.map(c => (
              <li key={c.id + c.claimedAt} className="py-1.5 flex flex-wrap justify-between gap-2">
                <span>{c.name} さん <span className="text-xs text-gray-500">{c.email}</span></span>
                <span className="text-xs text-gray-500">{fmtDate(c.claimedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
