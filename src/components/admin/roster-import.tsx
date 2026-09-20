'use client'

import { useMemo, useState, useTransition } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Upload, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react'
import { applyRosterUpdates, type RosterUpdate } from '@/app/(dashboard)/admin/roster-import/actions'

interface Employee {
  id: string
  name: string
  name_kana: string | null
  email: string
  hire_date: string | null
  left_at: string | null
  employment_type: string
  status: string
  employee_number: string | null
}

type Row = {
  line: number
  name: string
  email: string | null
  number: string | null
  kana: string | null
  hireDate: string | null
  leftAt: string | null
  employmentType: '社員' | 'メイト' | null
  match: Employee | null
  candidates: Employee[]
  reason: string
  /** 何で突き合わせたか */
  by: 'メール' | '社員番号' | '氏名' | null
}

/** 見出しの揺れを吸収する（名簿は人事の手元の形式で来るため） */
const HEADER_ALIASES: Record<string, string[]> = {
  number: ['社員番号', '社員No', '社員NO', '社員no', '従業員番号', '社員コード', '番号'],
  kana: ['フリガナ', 'ふりがな', 'カナ', 'よみがな', 'よみ'],
  name: ['氏名', '名前', '社員名', 'スタッフ名', 'name'],
  email: ['メール', 'メールアドレス', 'email', 'mail'],
  hire: ['入社日', '入社年月日', '入社', 'hire_date', '入社年月'],
  left: ['退職日', '退社日', '退職年月日', 'left_at'],
  type: ['社員／PA', '社員/PA', '区分', '雇用区分', '雇用形態', '社員区分', 'employment_type'],
}

const norm = (s: string) => s.replace(/[\s　]+/g, '').normalize('NFKC').toLowerCase()

/** 「2026/4/1」「2026-04-01」「20260401」「R8.4.1」などを YYYY-MM-DD に */
function parseDate(raw: string | undefined): string | null {
  if (!raw) return null
  const t = raw.trim().normalize('NFKC')
  if (!t) return null
  let m = t.match(/^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^[RrＲ令和]?\s*(\d{1,2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?$/)
  if (m && /^[RrＲ令]/.test(t)) return `${2018 + Number(m[1])}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  const d = new Date(t)
  if (!Number.isNaN(d.getTime()) && /\d{4}/.test(t)) return d.toISOString().slice(0, 10)
  return null
}

function parseType(raw: string | undefined): '社員' | 'メイト' | null {
  if (!raw) return null
  const t = raw.trim().normalize('NFKC')
  if (!t) return null
  if (/^(pa|p\/a|パート|アルバイト|メイト|バイト|パートナー)/i.test(t)) return 'メイト'
  if (/社員|正社員|契約/.test(t)) return '社員'
  return null
}

/**
 * 名簿の一括取込（2026-09-19 決定 ⑦「名簿保護つきでいただき、一括取り込み」）。
 * - 氏名（空白の有無・全角半角を無視）で突き合わせる。メール列があればメールを優先
 * - 同名が2人以上いる／見つからない行は反映しない（画面で理由を出す）
 * - 反映するのは 入社日・退職日・雇用区分 だけ。実行前に差分を一覧で確認する
 */
export function RosterImport({ employees }: { employees: Employee[] }) {
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [done, setDone] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()

  const byName = useMemo(() => {
    const m = new Map<string, Employee[]>()
    for (const e of employees) {
      const k = norm(e.name)
      if (!k) continue
      ;(m.get(k) ?? m.set(k, []).get(k)!).push(e)
    }
    return m
  }, [employees])
  const byEmail = useMemo(() => new Map(employees.map(e => [e.email.toLowerCase(), e])), [employees])
  const byNumber = useMemo(() => new Map(employees.filter(e => e.employee_number).map(e => [norm(e.employee_number!), e])), [employees])

  const handleFile = (file: File) => {
    setDone(null)
    setFileName(file.name)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => {
        const fields = result.meta.fields ?? []
        const find = (key: keyof typeof HEADER_ALIASES) => fields.find(f => HEADER_ALIASES[key].some(a => norm(f) === norm(a))) ?? null
        const fName = find('name'), fEmail = find('email'), fHire = find('hire'), fLeft = find('left'), fType = find('type'), fNumber = find('number'), fKana = find('kana')
        if (!fName && !fEmail && !fNumber) {
          toast.error('氏名・メール・社員番号のいずれの列も見つかりません。見出しを「社員番号」「氏名」「フリガナ」「入社日」「退職日」「社員／PA」「メール」にしてください')
          setRows([])
          return
        }
        if (!fHire && !fLeft && !fType) {
          toast.error('入社日・退職日・社員／PA のいずれの列も見つかりません')
          setRows([])
          return
        }
        const parsed: Row[] = result.data.map((r, i) => {
          const name = (fName ? r[fName] : '')?.trim() ?? ''
          const email = (fEmail ? r[fEmail] : '')?.trim().toLowerCase() || null
          const number = (fNumber ? r[fNumber] : '')?.trim().normalize('NFKC') || null
          const kana = (fKana ? r[fKana] : '')?.trim() || null
          const hireDate = fHire ? parseDate(r[fHire]) : null
          const leftAt = fLeft ? parseDate(r[fLeft]) : null
          const employmentType = fType ? parseType(r[fType]) : null
          let match: Employee | null = null
          let candidates: Employee[] = []
          let reason = ''
          let by: Row['by'] = null
          // 突き合わせの優先順: メール → 社員番号（MB に登録済みのとき）→ 氏名
          if (email && byEmail.has(email)) { match = byEmail.get(email)!; by = 'メール' }
          else if (number && byNumber.has(norm(number))) { match = byNumber.get(norm(number))!; by = '社員番号' }
          else if (name) {
            candidates = byName.get(norm(name)) ?? []
            if (candidates.length === 1) { match = candidates[0]; by = '氏名' }
            else if (candidates.length > 1) reason = `同名が${candidates.length}人います（メール列か、先に社員番号を登録して区別してください）`
            else reason = 'Mission Board に同じ氏名の人がいません'
          } else if (number) reason = 'この社員番号は Mission Board に未登録です（先に在職者名簿を取り込むと登録されます）'
          else reason = '氏名・社員番号が空です'
          if (match && !hireDate && !leftAt && !employmentType && !number && !kana) reason = '取り込める値がありません（日付の形式を確認）'
          return { line: i + 2, name, email, number, kana, hireDate, leftAt, employmentType, match: reason ? null : match, candidates, reason, by }
        })
        setRows(parsed)
      },
      error: () => toast.error('CSVを読み込めませんでした'),
    })
  }

  const changes = useMemo(() => rows.filter(r => r.match).map(r => {
    const e = r.match!
    const diff: string[] = []
    if (r.hireDate && r.hireDate !== e.hire_date) diff.push(`入社日 ${e.hire_date ?? '未登録'} → ${r.hireDate}`)
    if (r.leftAt && r.leftAt !== e.left_at) diff.push(`退職日 ${e.left_at ?? '在籍中'} → ${r.leftAt}`)
    if (r.employmentType && r.employmentType !== e.employment_type) diff.push(`区分 ${e.employment_type} → ${r.employmentType}`)
    if (r.number && r.number !== (e.employee_number ?? null)) diff.push(`社員番号 ${e.employee_number ?? '未登録'} → ${r.number}`)
    if (r.kana && !e.name_kana) diff.push(`フリガナ → ${r.kana}`)
    return { row: r, employee: e, diff }
  }), [rows])
  const toApply = changes.filter(c => c.diff.length > 0)
  const unchanged = changes.length - toApply.length
  const skipped = rows.filter(r => !r.match)

  const apply = () => {
    const updates: RosterUpdate[] = toApply.map(c => ({
      employeeId: c.employee.id,
      hireDate: c.row.hireDate ?? undefined,
      leftAt: c.row.leftAt ?? undefined,
      employmentType: c.row.employmentType ?? undefined,
      employeeNumber: c.row.number ?? undefined,
      nameKana: c.row.kana ?? undefined,
    }))
    startTransition(async () => {
      const res = await applyRosterUpdates(updates)
      if (res.error) { toast.error(`途中で止まりました（${res.applied}件は反映済み）: ${res.error}`); return }
      toast.success(`${res.applied}件を反映しました`)
      setDone(res.applied)
      setRows([])
    })
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
        <p className="text-sm text-gray-700">人事の名簿（CSV）から <span className="font-semibold">社員番号・入社日・退職日・社員／PA の区分</span>（フリガナは未登録のときだけ）を一括で取り込みます。氏名やロールは変えません。</p>
        <p className="text-xs text-gray-500 leading-relaxed flex items-start gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">在職者名簿</span>: 見出し「社員番号」「氏名」「フリガナ」「入社日」「社員／PA」（あればメール）。氏名（空白・全角半角を無視）で突き合わせ、社員番号を登録します。<br />
            <span className="font-semibold">退職者データ</span>（氏名なし）: 見出し「社員番号」「退職日」。先に在職者名簿を取り込んでおくと、社員番号で突き合わせて退職日を登録できます。<br />
            日付は 2026/4/1・2026-04-01・20260401 のどれでも可。<span className="font-semibold">同名が2人以上いる行・見つからない行は反映しません</span>（メール列か社員番号で区別）。反映前に差分を一覧で確認できます。取り込んだ内容は監査ログに残ります。
          </span>
        </p>
        <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-orange-300 bg-orange-50/40 px-4 py-6 cursor-pointer hover:bg-orange-50">
          <Upload className="w-5 h-5 text-orange-500" />
          <span className="text-sm text-orange-700 font-medium">{fileName || 'CSV ファイルを選ぶ'}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = '' }} />
        </label>
      </div>

      {done !== null && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />{done}件を反映しました。店舗別スキル状況の定着率や入社月の絞り込みに反映されます。
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">
                反映する {toApply.length}件
                <span className="ml-2 text-xs font-normal text-gray-500">変更なし {unchanged}件 ／ 反映しない {skipped.length}件</span>
              </p>
              <Button onClick={apply} disabled={isPending || toApply.length === 0} className="bg-orange-500 hover:bg-orange-600 text-white">
                {isPending ? '反映中...' : `${toApply.length}件を反映する`}
              </Button>
            </div>
            {toApply.length === 0 ? (
              <p className="text-xs text-gray-400">反映する差分がありません</p>
            ) : (
              <ul className="divide-y divide-gray-100 text-xs">
                {toApply.map(c => (
                  <li key={c.employee.id} className="py-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className="font-medium text-gray-800 w-28 truncate">{c.employee.name}</span>
                    <span className="text-gray-600">{c.diff.join(' ／ ')}</span>
                    {c.row.by && <span className="text-[10px] text-gray-400">（{c.row.by}で照合）</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {skipped.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-2">
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />反映しない行 {skipped.length}件</p>
              <ul className="divide-y divide-amber-100 text-xs">
                {skipped.map(r => (
                  <li key={r.line} className="py-1.5 flex flex-wrap gap-x-3">
                    <span className="text-gray-400 w-10">{r.line}行目</span>
                    <span className="font-medium text-gray-800 w-28 truncate">{r.name || r.email || '（空）'}</span>
                    <span className="text-amber-800">{r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
