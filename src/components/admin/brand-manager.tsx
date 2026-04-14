'use client'

import { useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X, Tag, Store, BookOpen, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  createBrand, updateBrand, deleteBrand,
  setTeamBrand, setTeamsBrand, bulkAssignDefaultBrand,
} from '@/app/(dashboard)/admin/brands/actions'
import type { Brand } from '@/types/database'

const PRESET_COLORS = ['#e53935', '#f59e0b', '#a855f7', '#22c55e', '#3b82f6', '#ec4899', '#06b6d4', '#64748b']

interface Props {
  brands: Brand[]
  stores: { id: string; name: string; brand_id: string | null }[]
  stats: Record<string, { stores: number; manuals: number }>
  storesWithoutBrand: number
  manualsWithoutBrand: number
}

export function BrandManager({ brands: initialBrands, stores: initialStores, stats, storesWithoutBrand, manualsWithoutBrand }: Props) {
  const [brands, setBrands] = useState(initialBrands)
  const [stores, setStores] = useState(initialStores)
  const [isPending, startTransition] = useTransition()

  const [editingBrand, setEditingBrand] = useState<Brand | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])

  const [storeFilter, setStoreFilter] = useState('')
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set())
  const [bulkBrandId, setBulkBrandId] = useState<string>('')

  const handleCreate = () => {
    if (!newName.trim() || !newCode.trim()) {
      toast.error('名前とコードを入力してください')
      return
    }
    startTransition(async () => {
      const res = await createBrand({ name: newName, code: newCode, color: newColor })
      if (res.error) { toast.error(res.error); return }
      if (res.id) {
        setBrands(prev => [...prev, {
          id: res.id!, name: newName.trim(), code: newCode.trim(), color: newColor,
          sort_order: prev.length * 10 + 10, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }])
      }
      setNewName(''); setNewCode(''); setNewColor(PRESET_COLORS[0]); setShowCreate(false)
      toast.success('ブランドを追加しました')
    })
  }

  const handleUpdate = (b: Brand, data: Partial<Brand>) => {
    startTransition(async () => {
      const res = await updateBrand(b.id, data)
      if (res.error) { toast.error(res.error); return }
      setBrands(prev => prev.map(x => x.id === b.id ? { ...x, ...data } : x))
      setEditingBrand(null)
      toast.success('更新しました')
    })
  }

  const handleDelete = (b: Brand) => {
    if (!confirm(`「${b.name}」を削除します。よろしいですか？`)) return
    startTransition(async () => {
      const res = await deleteBrand(b.id)
      if (res.error) { toast.error(res.error); return }
      setBrands(prev => prev.filter(x => x.id !== b.id))
      toast.success('削除しました')
    })
  }

  const handleSetStoreBrand = (storeId: string, brandId: string | null) => {
    startTransition(async () => {
      const res = await setTeamBrand(storeId, brandId)
      if (res.error) { toast.error(res.error); return }
      setStores(prev => prev.map(s => s.id === storeId ? { ...s, brand_id: brandId } : s))
    })
  }

  const handleBulkSet = () => {
    if (selectedStoreIds.size === 0 || !bulkBrandId) {
      toast.error('店舗とブランドを選んでください')
      return
    }
    const brandId = bulkBrandId === '__none__' ? null : bulkBrandId
    startTransition(async () => {
      const res = await setTeamsBrand([...selectedStoreIds], brandId)
      if (res.error) { toast.error(res.error); return }
      setStores(prev => prev.map(s => selectedStoreIds.has(s.id) ? { ...s, brand_id: brandId } : s))
      setSelectedStoreIds(new Set())
      toast.success(`${res.updated}店舗を更新しました`)
    })
  }

  const handleAssignDefault = (brandId: string) => {
    const brand = brands.find(b => b.id === brandId)
    if (!confirm(`未設定のマニュアル ${manualsWithoutBrand}件 を「${brand?.name}」に一括設定します。よろしいですか？`)) return
    startTransition(async () => {
      const res = await bulkAssignDefaultBrand(brandId)
      if (res.error) { toast.error(res.error); return }
      toast.success(`${res.updated}件のマニュアルに設定しました`)
      setTimeout(() => window.location.reload(), 800)
    })
  }

  const filteredStores = useMemo(() => {
    const q = storeFilter.trim().toLowerCase()
    if (!q) return stores
    return stores.filter(s => s.name.toLowerCase().includes(q))
  }, [stores, storeFilter])

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      {/* ブランド一覧 */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Tag className="w-4 h-4 text-orange-500" />ブランド一覧
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={isPending}>
              <Plus className="w-3.5 h-3.5 mr-1" />新規
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {brands.length === 0 && <p className="text-xs text-gray-500">ブランド未登録</p>}
          {brands.map(b => (
            <div key={b.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
              <div className="w-3 h-8 rounded-sm flex-shrink-0" style={{ background: b.color ?? '#94a3b8' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{b.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <code className="bg-white px-1 rounded">{b.code}</code>
                  <span className="flex items-center gap-0.5"><Store className="w-3 h-3" />{stats[b.id]?.stores ?? 0}店舗</span>
                  <span className="flex items-center gap-0.5"><BookOpen className="w-3 h-3" />{stats[b.id]?.manuals ?? 0}マニュアル</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingBrand(b)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDelete(b)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 未設定の警告 */}
      {(storesWithoutBrand > 0 || manualsWithoutBrand > 0) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1 text-xs text-amber-900">
                {storesWithoutBrand > 0 && (
                  <p><strong>{storesWithoutBrand}</strong>件の店舗がブランド未設定です（下記で設定可能）</p>
                )}
                {manualsWithoutBrand > 0 && (
                  <div>
                    <p><strong>{manualsWithoutBrand}</strong>件のマニュアルがブランド未設定です</p>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {brands.map(b => (
                        <Button
                          key={b.id}
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-1.5"
                          onClick={() => handleAssignDefault(b.id)}
                          disabled={isPending}
                        >
                          全て「{b.name}」にする
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 店舗のブランド設定 */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Store className="w-4 h-4 text-blue-500" />店舗のブランド設定（{stores.length}店舗）
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <Input
            placeholder="店舗名で絞り込み"
            value={storeFilter}
            onChange={e => setStoreFilter(e.target.value)}
            className="h-9 text-sm"
          />

          {/* 一括設定 */}
          {selectedStoreIds.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-700">{selectedStoreIds.size}店舗選択中</span>
              <Select value={bulkBrandId} onValueChange={setBulkBrandId}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="ブランド選択" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">（未設定）</SelectItem>
                  {brands.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 text-xs" onClick={handleBulkSet} disabled={isPending || !bulkBrandId}>
                一括設定
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedStoreIds(new Set())}>
                解除
              </Button>
            </div>
          )}

          <div className="border rounded-lg divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
            {filteredStores.map(s => {
              const brand = brands.find(b => b.id === s.brand_id)
              const checked = selectedStoreIds.has(s.id)
              return (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => {
                      setSelectedStoreIds(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(s.id); else next.delete(s.id)
                        return next
                      })
                    }}
                    className="accent-orange-500"
                  />
                  <span className="flex-1 text-sm truncate">{s.name}</span>
                  {brand ? (
                    <Badge className="text-[10px] border-0" style={{ background: brand.color ?? '#94a3b8', color: 'white' }}>
                      {brand.name}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-gray-400">未設定</Badge>
                  )}
                  <Select value={s.brand_id ?? '__none__'} onValueChange={v => handleSetStoreBrand(s.id, v === '__none__' ? null : v)}>
                    <SelectTrigger className="h-7 text-[10px] w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">未設定</SelectItem>
                      {brands.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ===== 新規作成ダイアログ ===== */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">ブランド新規追加</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">名前</label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="例: CoCo壱" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">コード（英数字）</label>
              <Input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="例: cocoichi" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">色</label>
              <div className="flex gap-1 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`w-8 h-8 rounded-full border-2 ${newColor === c ? 'border-gray-800' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>キャンセル</Button>
            <Button onClick={handleCreate} disabled={isPending}>追加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 編集ダイアログ ===== */}
      {editingBrand && (
        <Dialog open={!!editingBrand} onOpenChange={v => { if (!v) setEditingBrand(null) }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base">{editingBrand.name} を編集</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">名前</label>
                <Input defaultValue={editingBrand.name} onBlur={e => e.target.value !== editingBrand.name && handleUpdate(editingBrand, { name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">コード</label>
                <Input defaultValue={editingBrand.code} onBlur={e => e.target.value !== editingBrand.code && handleUpdate(editingBrand, { code: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">色</label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => handleUpdate(editingBrand, { color: c })}
                      className={`w-8 h-8 rounded-full border-2 ${editingBrand.color === c ? 'border-gray-800' : 'border-transparent'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={() => setEditingBrand(null)}>閉じる</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
