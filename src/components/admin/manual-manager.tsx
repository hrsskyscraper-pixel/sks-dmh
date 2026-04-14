'use client'

import { useState, useMemo, useTransition } from 'react'
import Papa from 'papaparse'
import { toast } from 'sonner'
import {
  Upload, FileText, Link2, Unlink, Star, ExternalLink, AlertTriangle, Check, Search, BookOpen,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  importManualsFromCsv,
  linkSkillManual,
  unlinkSkillManual,
  toggleSkillManualPrimary,
  type CsvManualRow,
  type ManualImportResult,
} from '@/app/(dashboard)/admin/manuals/actions'
import type { ManualLibrary, SkillManual } from '@/types/database'

type SkillLite = { id: string; name: string; category: string; order_index: number }

interface Props {
  manuals: ManualLibrary[]
  skills: SkillLite[]
  skillManuals: SkillManual[]
}

// URLから Teach me マニュアルID を抽出
function extractTeachmeId(url: string): string | null {
  const m = url.match(/manuals\/(\d+)/)
  return m ? m[1] : null
}

export function ManualManager({ manuals: initialManuals, skills, skillManuals: initialLinks }: Props) {
  const [manuals, setManuals] = useState(initialManuals)
  const [links, setLinks] = useState(initialLinks)
  const [tab, setTab] = useState<'overview' | 'mapping' | 'import'>('overview')
  const [isPending, startTransition] = useTransition()

  // インポート
  const [parsedRows, setParsedRows] = useState<CsvManualRow[] | null>(null)
  const [importResult, setImportResult] = useState<ManualImportResult | null>(null)
  const [importFileName, setImportFileName] = useState<string | null>(null)

  // マッピング
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [mappingSearch, setMappingSearch] = useState('')
  const [showLinkDialog, setShowLinkDialog] = useState(false)

  const activeManuals = manuals.filter(m => !m.archived)
  const linksBySkill = useMemo(() => {
    const map: Record<string, SkillManual[]> = {}
    for (const l of links) {
      if (!map[l.skill_id]) map[l.skill_id] = []
      map[l.skill_id].push(l)
    }
    return map
  }, [links])

  const manualById = useMemo(() => Object.fromEntries(manuals.map(m => [m.id, m])), [manuals])

  // ==================== CSV インポート ====================
  const handleFileSelect = (file: File) => {
    setImportFileName(file.name)
    setImportResult(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const rows: CsvManualRow[] = []
        for (const r of res.data) {
          if (!r.title || !r.url) continue
          const tid = extractTeachmeId(r.url) ?? r.url
          const folderPath = [r.folder_name1, r.folder_name2, r.folder_name3, r.folder_name4, r.folder_name5]
            .map(s => s?.trim() ?? '').filter(Boolean)
          rows.push({
            teachmeManualId: tid,
            title: r.title.trim(),
            url: r.url.trim(),
            folderPath,
            publishStatus: r.publish_status?.trim() || null,
            accessCount: parseInt(r.access_count || '0', 10) || 0,
            viewsWithinAYear: parseInt(r.views_within_a_year || '0', 10) || 0,
            searchTags: r.search_tags?.trim()
              ? r.search_tags.split(',').map(s => s.trim()).filter(Boolean)
              : null,
            archived: r.archived?.toLowerCase() === 'true',
            sourceUpdatedAt: r.updated_at || null,
          })
        }
        setParsedRows(rows)
      },
      error: (err) => toast.error('CSV解析失敗: ' + err.message),
    })
  }

  const handleImport = () => {
    if (!parsedRows) return
    startTransition(async () => {
      const res = await importManualsFromCsv(parsedRows)
      setImportResult(res)
      if (res.error) toast.error(res.error)
      else {
        toast.success(`新規 ${res.inserted}件 / 更新 ${res.updated}件 / 自動紐付け ${res.autoLinked}件`)
        // ページを再描画すると反映されるのでreloadを促す
      }
    })
  }

  // ==================== マッピング操作 ====================
  const handleLink = (skillId: string, manualId: string, isPrimary: boolean) => {
    startTransition(async () => {
      const res = await linkSkillManual({ skillId, manualId, isPrimary })
      if (res.error) { toast.error(res.error); return }
      setLinks(prev => [...prev, { skill_id: skillId, manual_id: manualId, display_order: 0, is_primary: isPrimary, created_at: new Date().toISOString() }])
      toast.success('紐付けました')
    })
  }
  const handleUnlink = (skillId: string, manualId: string) => {
    startTransition(async () => {
      const res = await unlinkSkillManual({ skillId, manualId })
      if (res.error) { toast.error(res.error); return }
      setLinks(prev => prev.filter(l => !(l.skill_id === skillId && l.manual_id === manualId)))
      toast.success('解除しました')
    })
  }
  const handleTogglePrimary = (skillId: string, manualId: string, current: boolean) => {
    startTransition(async () => {
      const res = await toggleSkillManualPrimary({ skillId, manualId, isPrimary: !current })
      if (res.error) { toast.error(res.error); return }
      setLinks(prev => prev.map(l =>
        l.skill_id === skillId && l.manual_id === manualId ? { ...l, is_primary: !current } : l
      ))
    })
  }

  const selectedSkill = skills.find(s => s.id === selectedSkillId) ?? null
  const selectedSkillLinks = selectedSkillId ? (linksBySkill[selectedSkillId] ?? []) : []
  const selectedSkillLinkedManualIds = new Set(selectedSkillLinks.map(l => l.manual_id))

  // マッピング候補: タイトル部分一致でサジェスト
  const suggestedForSelected = useMemo(() => {
    if (!selectedSkill) return []
    const needle = selectedSkill.name.toLowerCase().trim()
    if (!needle) return []
    return activeManuals
      .filter(m => !selectedSkillLinkedManualIds.has(m.id))
      .map(m => ({
        manual: m,
        score: m.title.toLowerCase().includes(needle) || needle.includes(m.title.toLowerCase()) ? 1 : 0,
      }))
      .filter(x => x.score > 0)
      .slice(0, 5)
      .map(x => x.manual)
  }, [selectedSkill, activeManuals, selectedSkillLinkedManualIds])

  const mappingFiltered = useMemo(() => {
    const q = mappingSearch.trim().toLowerCase()
    if (!q) return activeManuals.slice(0, 100)
    return activeManuals.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.folder_path ?? []).some(f => f.toLowerCase().includes(q))
    ).slice(0, 100)
  }, [activeManuals, mappingSearch])

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <Tabs value={tab} onValueChange={v => setTab(v as 'overview' | 'mapping' | 'import')}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="overview" className="text-xs">
            <BookOpen className="w-3 h-3 mr-1" />概要
          </TabsTrigger>
          <TabsTrigger value="mapping" className="text-xs">
            <Link2 className="w-3 h-3 mr-1" />スキル紐付け
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs">
            <Upload className="w-3 h-3 mr-1" />CSV取込
          </TabsTrigger>
        </TabsList>

        {/* ===== 概要タブ ===== */}
        <TabsContent value="overview" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">マニュアルライブラリ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-blue-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-blue-600">公開中</p>
                  <p className="text-xl font-bold text-blue-700">{activeManuals.length}</p>
                </div>
                <div className="bg-gray-100 rounded-lg p-2 text-center">
                  <p className="text-xs text-gray-600">アーカイブ</p>
                  <p className="text-xl font-bold text-gray-700">{manuals.length - activeManuals.length}</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                  <p className="text-xs text-emerald-600">紐付け済</p>
                  <p className="text-xl font-bold text-emerald-700">{links.length}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                「スキル紐付け」タブでスキルとマニュアルを関連付けると、メンバーがスキル画面から直接マニュアルを開けるようになります。
              </p>
            </CardContent>
          </Card>

          {/* 未紐付けスキル */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">マニュアル未紐付けのスキル</CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                const unlinked = skills.filter(s => !linksBySkill[s.id]?.length)
                if (unlinked.length === 0) {
                  return <p className="text-xs text-gray-500">全スキルにマニュアルが紐付いています ✨</p>
                }
                return (
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {unlinked.slice(0, 20).map(s => (
                      <button
                        key={s.id}
                        className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-gray-50 flex items-center justify-between"
                        onClick={() => { setSelectedSkillId(s.id); setTab('mapping') }}
                      >
                        <span>{s.name}</span>
                        <Badge variant="outline" className="text-[9px]">{s.category}</Badge>
                      </button>
                    ))}
                    {unlinked.length > 20 && <p className="text-[10px] text-gray-400 text-center py-1">他 {unlinked.length - 20}件</p>}
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== マッピングタブ ===== */}
        <TabsContent value="mapping" className="space-y-3 mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 左: スキル一覧 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">スキルを選択</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 max-h-96 overflow-y-auto">
                {skills.map(s => {
                  const count = linksBySkill[s.id]?.length ?? 0
                  const isSelected = s.id === selectedSkillId
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedSkillId(s.id)}
                      className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between ${
                        isSelected ? 'bg-orange-100 text-orange-800 font-semibold' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="truncate">{s.name}</span>
                      {count > 0 && <Badge className="ml-2 text-[9px] bg-emerald-100 text-emerald-700 border-0 flex-shrink-0">📖 {count}</Badge>}
                    </button>
                  )
                })}
              </CardContent>
            </Card>

            {/* 右: 選択スキルの紐付け詳細 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm truncate">
                  {selectedSkill ? selectedSkill.name : '← スキルを選択'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!selectedSkill ? (
                  <p className="text-xs text-gray-400">左のリストからスキルを選んでください</p>
                ) : (
                  <>
                    {/* 紐付け済みマニュアル */}
                    <div>
                      <p className="text-[10px] font-medium text-gray-500 mb-1">紐付け済みマニュアル</p>
                      {selectedSkillLinks.length === 0 && (
                        <p className="text-xs text-gray-400">紐付けなし</p>
                      )}
                      <div className="space-y-1">
                        {selectedSkillLinks.map(link => {
                          const m = manualById[link.manual_id]
                          if (!m) return null
                          return (
                            <div key={link.manual_id} className="flex items-center gap-1 bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5">
                              <button
                                onClick={() => handleTogglePrimary(selectedSkill.id, link.manual_id, link.is_primary)}
                                title={link.is_primary ? 'メインから外す' : 'メインに設定'}
                                disabled={isPending}
                              >
                                <Star className={`w-3.5 h-3.5 ${link.is_primary ? 'fill-amber-400 text-amber-400' : 'text-gray-300 hover:text-amber-400'}`} />
                              </button>
                              <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs text-emerald-800 hover:underline truncate">
                                {m.title}
                              </a>
                              <button
                                onClick={() => handleUnlink(selectedSkill.id, link.manual_id)}
                                className="text-red-400 hover:text-red-600"
                                title="解除"
                                disabled={isPending}
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* サジェスト */}
                    {suggestedForSelected.length > 0 && (
                      <div>
                        <p className="text-[10px] font-medium text-amber-600 mb-1">💡 おすすめ（タイトル類似）</p>
                        <div className="space-y-1">
                          {suggestedForSelected.map(m => (
                            <button
                              key={m.id}
                              onClick={() => handleLink(selectedSkill.id, m.id, false)}
                              disabled={isPending}
                              className="w-full flex items-center gap-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded px-2 py-1.5 text-left"
                            >
                              <Link2 className="w-3 h-3 text-amber-600" />
                              <span className="flex-1 text-xs text-amber-800 truncate">{m.title}</span>
                              <span className="text-[10px] text-amber-500">＋</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 手動検索して追加 */}
                    <div>
                      <p className="text-[10px] font-medium text-gray-500 mb-1">他のマニュアルを検索して追加</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => { setMappingSearch(selectedSkill.name); setShowLinkDialog(true) }}
                      >
                        <Search className="w-3 h-3 mr-1" />マニュアルを検索
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== CSV取込タブ ===== */}
        <TabsContent value="import" className="space-y-3 mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Teach me Biz CSV 取込</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {importResult ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2">
                    <Check className="w-4 h-4" />
                    <span className="text-sm">インポート完了</span>
                  </div>
                  <div className="text-sm space-y-1 px-2">
                    <p>新規追加: <span className="font-semibold">{importResult.inserted}</span>件</p>
                    <p>更新: <span className="font-semibold">{importResult.updated}</span>件</p>
                    <p>アーカイブ: <span className="font-semibold">{importResult.archived}</span>件</p>
                    <p>自動紐付け（タイトル完全一致）: <span className="font-semibold text-orange-600">{importResult.autoLinked}</span>件</p>
                  </div>
                  {importResult.warnings.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700 space-y-1 max-h-40 overflow-y-auto">
                      <p className="font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />警告 ({importResult.warnings.length}件)</p>
                      {importResult.warnings.slice(0, 10).map((w, i) => <p key={i}>・{w}</p>)}
                    </div>
                  )}
                  <Button onClick={() => window.location.reload()} className="w-full">ページをリロードして反映</Button>
                </div>
              ) : parsedRows ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-600">
                    <span className="font-medium">{importFileName}</span> から <span className="font-semibold text-orange-600">{parsedRows.length}件</span> を読み込みました
                  </p>
                  <p className="text-xs text-blue-700 bg-blue-50 rounded p-2 leading-relaxed">
                    💡 タイトルがスキル名と完全一致するものは、自動で紐付けされます。<br />
                    既存マニュアルは更新、CSVに無いものはアーカイブされます。
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setParsedRows(null); setImportFileName(null) }} disabled={isPending}>
                      別のファイル
                    </Button>
                    <Button onClick={handleImport} disabled={isPending} className="flex-1 bg-orange-500 hover:bg-orange-600">
                      {isPending ? '取込中...' : `${parsedRows.length}件を取込`}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 space-y-1">
                    <p className="font-medium">Teach me Biz の content_list.csv を取り込みます</p>
                    <p className="text-[11px]">
                      UTF-8 形式のCSVをダウンロードしてアップロードしてください。
                      差分で取り込まれるため、既存紐付けは維持されます。
                    </p>
                  </div>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                    <p className="text-xs text-gray-600 mb-2">CSVファイルを選択</p>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      id="manual-csv-input"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
                    />
                    <label htmlFor="manual-csv-input">
                      <Button variant="outline" size="sm" asChild>
                        <span className="cursor-pointer">ファイルを選ぶ</span>
                      </Button>
                    </label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== 手動リンクダイアログ ===== */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4 text-orange-500" />
              マニュアルを検索して紐付け
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="タイトル・フォルダ名で検索"
              value={mappingSearch}
              onChange={e => setMappingSearch(e.target.value)}
              className="h-9 text-sm"
            />
            <div className="border rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {mappingFiltered.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">該当なし</p>
              )}
              {mappingFiltered.map(m => {
                const isLinked = selectedSkillLinkedManualIds.has(m.id)
                return (
                  <div key={m.id} className="flex items-center gap-2 px-2 py-2 text-xs hover:bg-gray-50">
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-gray-800">{m.title}</p>
                      <p className="text-[10px] text-gray-400 truncate">
                        {(m.folder_path ?? []).join(' / ')} ・ PV {m.access_count}
                      </p>
                    </div>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-orange-500 flex-shrink-0">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {isLinked ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[9px]">紐付け済</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] px-2 flex-shrink-0"
                        onClick={() => selectedSkillId && handleLink(selectedSkillId, m.id, false)}
                        disabled={isPending || !selectedSkillId}
                      >
                        <Link2 className="w-3 h-3 mr-0.5" />紐付け
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShowLinkDialog(false)} className="w-full">閉じる</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
