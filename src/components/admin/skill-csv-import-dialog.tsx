'use client'

import { useState, useTransition } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { Upload, Download, FileText, AlertTriangle, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { importSkillsFromCsv, type CsvSkillRow, type CsvImportResult } from '@/app/(dashboard)/admin/projects/csv-actions'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  phaseNames: string[]
  onComplete: () => void
}

const CSV_HEADERS = ['name', 'category', 'phase', 'standard_hours', 'is_checkpoint', 'target_date_hint']

export function SkillCsvImportDialog({ open, onOpenChange, projectId, projectName, phaseNames, onComplete }: Props) {
  const [parsedRows, setParsedRows] = useState<CsvSkillRow[] | null>(null)
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [result, setResult] = useState<CsvImportResult | null>(null)
  const [isPending, startTransition] = useTransition()

  const reset = () => {
    setParsedRows(null)
    setParseErrors([])
    setFileName(null)
    setResult(null)
  }

  const downloadTemplate = () => {
    const samplePhase = phaseNames[0] ?? ''
    const rows = [
      CSV_HEADERS,
      ['領収書の発行', '事務', samplePhase, '2', 'N', ''],
      ['レジ締め', '事務', samplePhase, '1', 'Y', ''],
      ['発注業務', '事務', samplePhase, '3', 'N', '2026-06-30'],
    ]
    const csv = Papa.unparse(rows)
    // Excel対応のためBOM付き
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `skill_template_${projectName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFileSelect = (file: File) => {
    setFileName(file.name)
    setParseErrors([])
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const errors: string[] = []
        const rows: CsvSkillRow[] = []
        for (let i = 0; i < res.data.length; i++) {
          const r = res.data[i]
          if (!r.name || !r.name.trim()) continue
          const lineNo = i + 2
          let standard_hours: number | null = null
          if (r.standard_hours && r.standard_hours.trim()) {
            const n = parseFloat(r.standard_hours)
            if (isNaN(n)) errors.push(`${lineNo}行目: standard_hours が数値でない（${r.standard_hours}）`)
            else standard_hours = n
          }
          const is_checkpoint = r.is_checkpoint?.trim().toUpperCase() === 'Y' || r.is_checkpoint?.trim() === '1' || r.is_checkpoint?.trim().toLowerCase() === 'true'
          rows.push({
            name: r.name.trim(),
            category: (r.category ?? '').trim(),
            phase: r.phase?.trim() || undefined,
            standard_hours,
            is_checkpoint,
            target_date_hint: r.target_date_hint?.trim() || null,
          })
        }
        setParsedRows(rows)
        setParseErrors(errors)
      },
      error: (err) => {
        setParseErrors([`CSVの解析に失敗しました: ${err.message}`])
      },
    })
  }

  const handleImport = () => {
    if (!parsedRows || parsedRows.length === 0) return
    startTransition(async () => {
      const res = await importSkillsFromCsv({ projectId, rows: parsedRows })
      setResult(res)
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success(`新規作成 ${res.created}件 / 割当 ${res.assigned}件`)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4 text-orange-500" />
            スキルをCSVで一括登録
          </DialogTitle>
        </DialogHeader>

        {result ? (
          // ===== 結果画面 =====
          <div className="space-y-3">
            <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
              <Check className="w-4 h-4" />
              <span className="text-sm">インポートが完了しました</span>
            </div>
            <div className="text-sm space-y-1 px-2">
              <p>新規作成したスキル: <span className="font-semibold">{result.created}</span>件</p>
              <p>プロジェクトに割当: <span className="font-semibold">{result.assigned}</span>件</p>
            </div>
            {result.warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700 space-y-1 max-h-40 overflow-y-auto">
                <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />警告 ({result.warnings.length}件)</p>
                {result.warnings.map((w, i) => <p key={i}>・{w}</p>)}
              </div>
            )}
          </div>
        ) : parsedRows ? (
          // ===== プレビュー画面 =====
          <div className="space-y-3">
            <div className="text-xs text-gray-600">
              <span className="font-medium">{fileName}</span> から <span className="font-semibold text-orange-600">{parsedRows.length}行</span> 読み込みました
            </div>
            {parseErrors.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700 space-y-1">
                {parseErrors.map((e, i) => <p key={i}>・{e}</p>)}
              </div>
            )}
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 font-medium">スキル名</th>
                    <th className="px-2 py-1.5 font-medium">カテゴリ</th>
                    <th className="px-2 py-1.5 font-medium">フェーズ</th>
                    <th className="px-2 py-1.5 font-medium">時間</th>
                    <th className="px-2 py-1.5 font-medium">CP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedRows.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.category}</td>
                      <td className="px-2 py-1">
                        {r.phase ? (
                          phaseNames.includes(r.phase) ? (
                            <span className="text-emerald-600">{r.phase}</span>
                          ) : (
                            <span className="text-amber-600">{r.phase} ⚠</span>
                          )
                        ) : <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-2 py-1">{r.standard_hours ?? '-'}h</td>
                      <td className="px-2 py-1">{r.is_checkpoint ? '◯' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-500">
              ※ 既存のスキル名と同じ場合は新規作成せず、プロジェクト割当だけ行います
            </p>
          </div>
        ) : (
          // ===== 初期画面 =====
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
              <p className="font-medium">「{projectName}」にスキルを一括登録します</p>
              <p className="text-[11px]">
                まずテンプレートをダウンロードし、Excel等で編集したCSVをアップロードしてください。
              </p>
            </div>

            <Button variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="w-4 h-4 mr-2" />テンプレートをダウンロード
            </Button>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
              <p className="text-xs text-gray-600 mb-2">CSVファイルを選択してアップロード</p>
              <input
                type="file"
                accept=".csv,text/csv"
                id="csv-file-input"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFileSelect(f)
                }}
              />
              <label htmlFor="csv-file-input">
                <Button variant="outline" size="sm" asChild>
                  <span className="cursor-pointer">ファイルを選ぶ</span>
                </Button>
              </label>
            </div>

            <div className="text-[10px] text-gray-500 space-y-1">
              <p className="font-medium">CSVの列（ヘッダー名で認識）</p>
              <ul className="pl-3 space-y-0.5">
                <li>・<code>name</code>（必須）: スキル名</li>
                <li>・<code>category</code>（必須）: カテゴリ</li>
                <li>・<code>phase</code>（任意）: フェーズ名（完全一致）</li>
                <li>・<code>standard_hours</code>（任意）: 標準習得時間（数値）</li>
                <li>・<code>is_checkpoint</code>（任意）: Y/N でチェックポイント指定</li>
                <li>・<code>target_date_hint</code>（任意）: YYYY-MM-DD</li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={() => { onOpenChange(false); onComplete() }} className="w-full">
              閉じる
            </Button>
          ) : parsedRows ? (
            <>
              <Button variant="outline" onClick={reset} disabled={isPending}>
                別のファイルを選ぶ
              </Button>
              <Button
                onClick={handleImport}
                disabled={isPending || parsedRows.length === 0}
                className="bg-orange-500 hover:bg-orange-600"
              >
                {isPending ? 'インポート中...' : `${parsedRows.length}件を登録`}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
              閉じる
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
