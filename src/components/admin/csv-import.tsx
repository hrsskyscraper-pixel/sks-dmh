'use client'

import { useState, useRef, useTransition } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { Upload, FileText, AlertCircle, CheckCircle2, Download } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Employee {
  id: string
  name: string
  email: string
}

interface Props {
  employees: Employee[]
}

interface CsvRow {
  employee_email: string
  work_date: string
  hours: string
}

interface ParsedRow {
  employee_id: string
  employee_name: string
  work_date: string
  hours: number
  valid: boolean
  error?: string
}

export function CsvImport({ employees }: Props) {
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const emailToEmployee = new Map(employees.map(e => [e.email, e]))

  const parseFile = (file: File) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: ParsedRow[] = results.data.map((row) => {
          const email = row.employee_email?.trim()
          const employee = emailToEmployee.get(email)
          const hours = parseFloat(row.hours)
          const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(row.work_date?.trim())

          if (!employee) {
            return {
              employee_id: '',
              employee_name: email ?? '不明',
              work_date: row.work_date ?? '',
              hours: 0,
              valid: false,
              error: '社員が見つかりません',
            }
          }
          if (!dateValid) {
            return {
              employee_id: employee.id,
              employee_name: employee.name,
              work_date: row.work_date ?? '',
              hours: 0,
              valid: false,
              error: '日付形式エラー (YYYY-MM-DD)',
            }
          }
          if (isNaN(hours) || hours < 0 || hours > 24) {
            return {
              employee_id: employee.id,
              employee_name: employee.name,
              work_date: row.work_date,
              hours: 0,
              valid: false,
              error: '時間数が不正です',
            }
          }

          return {
            employee_id: employee.id,
            employee_name: employee.name,
            work_date: row.work_date.trim(),
            hours,
            valid: true,
          }
        })
        setParsedRows(rows)
      },
      error: () => toast.error('CSVの読み込みに失敗しました'),
    })
  }

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('CSVファイルを選択してください')
      return
    }
    parseFile(file)
  }

  const handleImport = () => {
    const validRows = parsedRows.filter(r => r.valid)
    if (validRows.length === 0) {
      toast.error('インポート可能なデータがありません')
      return
    }

    startTransition(async () => {
      const { error } = await supabase
        .from('work_hours')
        .upsert(
          validRows.map(r => ({
            employee_id: r.employee_id,
            work_date: r.work_date,
            hours: r.hours,
          })),
          { onConflict: 'employee_id,work_date' }
        )

      if (error) {
        toast.error(`インポートに失敗しました: ${error.message}`)
        return
      }

      toast.success(`${validRows.length}件の労働時間をインポートしました`)
      setParsedRows([])
    })
  }

  const downloadSample = () => {
    const sample = [
      'employee_email,work_date,hours',
      `${employees[0]?.email ?? 'taro@example.com'},2024-04-01,8`,
      `${employees[0]?.email ?? 'taro@example.com'},2024-04-02,7.5`,
    ].join('\n')
    const blob = new Blob([sample], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'work_hours_sample.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const validCount = parsedRows.filter(r => r.valid).length
  const errorCount = parsedRows.filter(r => !r.valid).length

  return (
    <div className="p-4 space-y-4">
      {/* CSVフォーマット説明 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">CSVフォーマット</CardTitle>
          <CardDescription className="text-xs">
            以下の列を含むCSVファイルをアップロードしてください
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="bg-gray-50 rounded-lg p-3 font-mono text-xs text-gray-700">
            <p>employee_email,work_date,hours</p>
            <p className="text-gray-400">taro@sky-scraper.jp,2024-04-01,8</p>
            <p className="text-gray-400">taro@sky-scraper.jp,2024-04-02,7.5</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-8"
            onClick={downloadSample}
          >
            <Download className="w-3 h-3 mr-1" />
            サンプルCSVをダウンロード
          </Button>
        </CardContent>
      </Card>

      {/* ドロップゾーン */}
      <div
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
          isDragging ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'
        )}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-600">CSVをドロップ or タップして選択</p>
        <p className="text-xs text-gray-400 mt-1">.csv ファイルのみ</p>
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </div>

      {/* プレビュー */}
      {parsedRows.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                プレビュー ({parsedRows.length}行)
              </CardTitle>
              <div className="flex gap-2">
                {validCount > 0 && (
                  <Badge className="bg-green-100 text-green-700 border-0 text-xs">
                    OK: {validCount}
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge className="bg-red-100 text-red-700 border-0 text-xs">
                    エラー: {errorCount}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3">
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {parsedRows.map((row, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center gap-2 text-xs p-2 rounded-lg',
                    row.valid ? 'bg-green-50' : 'bg-red-50'
                  )}
                >
                  {row.valid ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                  )}
                  <span className="font-medium text-gray-700 w-20 truncate">{row.employee_name}</span>
                  <span className="text-gray-500">{row.work_date}</span>
                  {row.valid ? (
                    <span className="text-gray-700 font-medium ml-auto">{row.hours}h</span>
                  ) : (
                    <span className="text-red-600 ml-auto">{row.error}</span>
                  )}
                </div>
              ))}
            </div>
            <Button
              className="w-full mt-3 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleImport}
              disabled={isPending || validCount === 0}
            >
              {isPending ? 'インポート中...' : `${validCount}件をインポート`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
