'use client'

import { useState, useMemo, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Tag, Store, Building2, BookOpen, AlertCircle, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  createBrand, updateBrand, deleteBrand,
  setTeamBrand, setTeamsBrand, setTeamBrandIds,
  bulkAssignDefaultBrand,
  createStore, createDepartment,
  updateTeamName, updateTeamPrefecture, deleteMasterTeam,
} from '@/app/(dashboard)/admin/brands/actions'
import type { Brand } from '@/types/database'

const PRESET_COLORS = ['#e53935', '#f59e0b', '#a855f7', '#22c55e', '#3b82f6', '#ec4899', '#06b6d4', '#64748b']

interface StoreItem { id: string; name: string; brand_id: string | null; brand_ids: string[]; prefecture: string | null }
interface DepartmentItem { id: string; name: string; brand_ids: string[] }

interface Props {
  brands: Brand[]
  stores: StoreItem[]
  departments: DepartmentItem[]
  stats: Record<string, { stores: number; departments: number; manuals: number }>
  storesWithoutBrand: number
  manualsWithoutBrand: number
}

export function BrandManager({
  brands: initialBrands,
  stores: initialStores,
  departments: initialDepartments,
  stats,
  storesWithoutBrand,
  manualsWithoutBrand,
}: Props) {
  const [brands, setBrands] = useState(initialBrands)
  const [stores, setStores] = useState(initialStores)
  const [departments, setDepartments] = useState(initialDepartments)
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<'brand' | 'store' | 'department'>('brand')

  // ブランド系
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null)
  const [showCreateBrand, setShowCreateBrand] = useState(false)
  const [newBrandName, setNewBrandName] = useState('')
  const [newBrandCode, setNewBrandCode] = useState('')
  const [newBrandColor, setNewBrandColor] = useState(PRESET_COLORS[0])

  // 店舗系
  const [storeFilter, setStoreFilter] = useState('')
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set())
  const [bulkBrandId, setBulkBrandId] = useState<string>('')
  const [showCreateStore, setShowCreateStore] = useState(false)
  const [newStoreName, setNewStoreName] = useState('')
  const [newStoreBrandId, setNewStoreBrandId] = useState<string>('')
  const [newStorePrefecture, setNewStorePrefecture] = useState('')

  // 部署系
  const [deptFilter, setDeptFilter] = useState('')
  const [showCreateDept, setShowCreateDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptBrandIds, setNewDeptBrandIds] = useState<Set<string>>(new Set())

  // ブランド操作
  const handleCreateBrand = () => {
    if (!newBrandName.trim() || !newBrandCode.trim()) { toast.error('名前とコードを入力してください'); return }
    startTransition(async () => {
      const res = await createBrand({ name: newBrandName, code: newBrandCode, color: newBrandColor })
      if (res.error) { toast.error(res.error); return }
      if (res.id) {
        setBrands(prev => [...prev, {
          id: res.id!, name: newBrandName.trim(), code: newBrandCode.trim(), color: newBrandColor,
          sort_order: prev.length * 10 + 10, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }])
      }
      setNewBrandName(''); setNewBrandCode(''); setNewBrandColor(PRESET_COLORS[0]); setShowCreateBrand(false)
      toast.success('ブランドを追加しました')
    })
  }
  const handleUpdateBrand = (b: Brand, data: Partial<Brand>) => {
    startTransition(async () => {
      const res = await updateBrand(b.id, data)
      if (res.error) { toast.error(res.error); return }
      setBrands(prev => prev.map(x => x.id === b.id ? { ...x, ...data } : x))
      toast.success('更新しました')
    })
  }
  const handleDeleteBrand = (b: Brand) => {
    if (!confirm(`「${b.name}」を削除します。よろしいですか？`)) return
    startTransition(async () => {
      const res = await deleteBrand(b.id)
      if (res.error) { toast.error(res.error); return }
      setBrands(prev => prev.filter(x => x.id !== b.id))
      toast.success('削除しました')
    })
  }

  // 店舗操作
  const handleSetStoreBrand = (storeId: string, brandId: string | null) => {
    startTransition(async () => {
      const res = await setTeamBrand(storeId, brandId)
      if (res.error) { toast.error(res.error); return }
      setStores(prev => prev.map(s => s.id === storeId ? { ...s, brand_id: brandId, brand_ids: brandId ? [brandId] : [] } : s))
    })
  }
  const handleBulkSetStore = () => {
    if (selectedStoreIds.size === 0 || !bulkBrandId) { toast.error('店舗とブランドを選んでください'); return }
    const brandId = bulkBrandId === '__none__' ? null : bulkBrandId
    startTransition(async () => {
      const res = await setTeamsBrand([...selectedStoreIds], brandId)
      if (res.error) { toast.error(res.error); return }
      setStores(prev => prev.map(s => selectedStoreIds.has(s.id) ? { ...s, brand_id: brandId, brand_ids: brandId ? [brandId] : [] } : s))
      setSelectedStoreIds(new Set())
      toast.success(`${res.updated}店舗を更新しました`)
    })
  }
  const handleCreateStore = () => {
    if (!newStoreName.trim() || !newStoreBrandId) { toast.error('店舗名とブランドは必須です'); return }
    startTransition(async () => {
      const res = await createStore({ name: newStoreName, brandId: newStoreBrandId, prefecture: newStorePrefecture.trim() || null })
      if (res.error) { toast.error(res.error); return }
      if (res.id) {
        setStores(prev => [...prev, {
          id: res.id!, name: newStoreName.trim(), brand_id: newStoreBrandId,
          brand_ids: [newStoreBrandId], prefecture: newStorePrefecture.trim() || null,
        }])
      }
      setNewStoreName(''); setNewStoreBrandId(''); setNewStorePrefecture(''); setShowCreateStore(false)
      toast.success('店舗を追加しました')
    })
  }
  const handleRenameStore = (store: StoreItem, newName: string) => {
    if (newName === store.name) return
    startTransition(async () => {
      const res = await updateTeamName(store.id, newName)
      if (res.error) { toast.error(res.error); return }
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, name: newName } : s))
    })
  }
  const handleDeleteTeam = (teamId: string, name: string, kind: 'store' | 'department') => {
    if (!confirm(`「${name}」を削除します。関連するメンバー・担当リーダー情報も解除されます。よろしいですか？`)) return
    startTransition(async () => {
      const res = await deleteMasterTeam(teamId)
      if (res.error) { toast.error(res.error); return }
      if (kind === 'store') setStores(prev => prev.filter(s => s.id !== teamId))
      else setDepartments(prev => prev.filter(d => d.id !== teamId))
      toast.success('削除しました')
    })
  }

  // 部署操作
  const handleToggleDeptBrand = (deptId: string, brandId: string, currentIds: string[]) => {
    const next = currentIds.includes(brandId)
      ? currentIds.filter(x => x !== brandId)
      : [...currentIds, brandId]
    startTransition(async () => {
      const res = await setTeamBrandIds(deptId, next)
      if (res.error) { toast.error(res.error); return }
      setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, brand_ids: next } : d))
    })
  }
  const handleCreateDept = () => {
    if (!newDeptName.trim()) { toast.error('部署名を入力してください'); return }
    startTransition(async () => {
      const res = await createDepartment({ name: newDeptName, brandIds: [...newDeptBrandIds] })
      if (res.error) { toast.error(res.error); return }
      if (res.id) {
        setDepartments(prev => [...prev, { id: res.id!, name: newDeptName.trim(), brand_ids: [...newDeptBrandIds] }])
      }
      setNewDeptName(''); setNewDeptBrandIds(new Set()); setShowCreateDept(false)
      toast.success('部署を追加しました')
    })
  }
  const handleRenameDept = (dept: DepartmentItem, newName: string) => {
    if (newName === dept.name) return
    startTransition(async () => {
      const res = await updateTeamName(dept.id, newName)
      if (res.error) { toast.error(res.error); return }
      setDepartments(prev => prev.map(d => d.id === dept.id ? { ...d, name: newName } : d))
    })
  }

  // マニュアルデフォルト
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
  const filteredDepts = useMemo(() => {
    const q = deptFilter.trim().toLowerCase()
    if (!q) return departments
    return departments.filter(d => d.name.toLowerCase().includes(q))
  }, [departments, deptFilter])

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      {(storesWithoutBrand > 0 || manualsWithoutBrand > 0) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4 space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1 text-xs text-amber-900">
                {storesWithoutBrand > 0 && (
                  <p><strong>{storesWithoutBrand}</strong>件の店舗がブランド未設定です</p>
                )}
                {manualsWithoutBrand > 0 && (
                  <div>
                    <p><strong>{manualsWithoutBrand}</strong>件のマニュアルがブランド未設定です</p>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {brands.map(b => (
                        <Button key={b.id} size="sm" variant="outline" className="h-6 text-[10px] px-1.5"
                          onClick={() => handleAssignDefault(b.id)} disabled={isPending}>
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

      <Tabs value={tab} onValueChange={v => setTab(v as 'brand' | 'store' | 'department')}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="brand" className="text-xs"><Tag className="w-3 h-3 mr-1" />ブランド</TabsTrigger>
          <TabsTrigger value="store" className="text-xs"><Store className="w-3 h-3 mr-1" />店舗</TabsTrigger>
          <TabsTrigger value="department" className="text-xs"><Building2 className="w-3 h-3 mr-1" />部署</TabsTrigger>
        </TabsList>

        {/* ===== ブランドマスタ ===== */}
        <TabsContent value="brand" className="mt-3">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Tag className="w-4 h-4 text-orange-500" />ブランドマスタ</CardTitle>
                <Button size="sm" onClick={() => setShowCreateBrand(true)} disabled={isPending}>
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
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 flex-wrap">
                      <code className="bg-white px-1 rounded">{b.code}</code>
                      <span className="flex items-center gap-0.5"><Store className="w-3 h-3" />{stats[b.id]?.stores ?? 0}店舗</span>
                      <span className="flex items-center gap-0.5"><Building2 className="w-3 h-3" />{stats[b.id]?.departments ?? 0}部署</span>
                      <span className="flex items-center gap-0.5"><BookOpen className="w-3 h-3" />{stats[b.id]?.manuals ?? 0}マニュアル</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingBrand(b)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => handleDeleteBrand(b)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== 店舗マスタ ===== */}
        <TabsContent value="store" className="mt-3">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Store className="w-4 h-4 text-blue-500" />店舗マスタ（{stores.length}件）</CardTitle>
                <Button size="sm" onClick={() => setShowCreateStore(true)} disabled={isPending}>
                  <Plus className="w-3.5 h-3.5 mr-1" />新規
                </Button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">店舗には必ず1つのブランドを設定します</p>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Input placeholder="店舗名で絞り込み" value={storeFilter} onChange={e => setStoreFilter(e.target.value)} className="h-9 text-sm" />

              {selectedStoreIds.size > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-xs font-semibold text-blue-700">{selectedStoreIds.size}店舗選択中</span>
                  <Select value={bulkBrandId} onValueChange={setBulkBrandId}>
                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="ブランド選択" /></SelectTrigger>
                    <SelectContent>
                      {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-8 text-xs" onClick={handleBulkSetStore} disabled={isPending || !bulkBrandId}>一括設定</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSelectedStoreIds(new Set())}>解除</Button>
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
                      <input
                        defaultValue={s.name}
                        onBlur={e => handleRenameStore(s, e.target.value.trim())}
                        className="flex-1 text-sm bg-transparent border-b border-transparent hover:border-gray-200 focus:border-orange-400 focus:outline-none"
                      />
                      {brand ? (
                        <Badge className="text-[10px] border-0" style={{ background: brand.color ?? '#94a3b8', color: 'white' }}>
                          {brand.name}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">未設定</Badge>
                      )}
                      <Select value={s.brand_id ?? '__none__'} onValueChange={v => handleSetStoreBrand(s.id, v === '__none__' ? null : v)}>
                        <SelectTrigger className="h-7 text-[10px] w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">未設定</SelectItem>
                          {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                        onClick={() => handleDeleteTeam(s.id, s.name, 'store')} disabled={isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== 部署マスタ ===== */}
        <TabsContent value="department" className="mt-3">
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-teal-500" />部署マスタ（{departments.length}件）</CardTitle>
                <Button size="sm" onClick={() => setShowCreateDept(true)} disabled={isPending}>
                  <Plus className="w-3.5 h-3.5 mr-1" />新規
                </Button>
              </div>
              <p className="text-[10px] text-gray-500 mt-1">部署は複数のブランドに所属できます（任意）</p>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              <Input placeholder="部署名で絞り込み" value={deptFilter} onChange={e => setDeptFilter(e.target.value)} className="h-9 text-sm" />
              <div className="border rounded-lg divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
                {filteredDepts.map(d => (
                  <div key={d.id} className="px-3 py-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <input
                        defaultValue={d.name}
                        onBlur={e => handleRenameDept(d, e.target.value.trim())}
                        className="flex-1 text-sm bg-transparent border-b border-transparent hover:border-gray-200 focus:border-teal-400 focus:outline-none"
                      />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                        onClick={() => handleDeleteTeam(d.id, d.name, 'department')} disabled={isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {brands.map(b => {
                        const active = d.brand_ids.includes(b.id)
                        return (
                          <button
                            key={b.id}
                            onClick={() => handleToggleDeptBrand(d.id, b.id, d.brand_ids)}
                            disabled={isPending}
                            className={`text-[10px] rounded-full px-2 py-0.5 border transition-all ${active ? 'text-white border-transparent' : 'text-gray-500 border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                            style={active ? { background: b.color ?? '#94a3b8' } : {}}
                          >
                            {active && '✓ '}{b.name}
                          </button>
                        )
                      })}
                      {d.brand_ids.length === 0 && <span className="text-[10px] text-gray-400">ブランド未設定（全共通扱い）</span>}
                    </div>
                  </div>
                ))}
                {filteredDepts.length === 0 && <p className="text-xs text-gray-400 text-center py-4">部署未登録</p>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ===== ブランド新規 ===== */}
      <Dialog open={showCreateBrand} onOpenChange={setShowCreateBrand}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">ブランド新規追加</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">名前</label>
              <Input value={newBrandName} onChange={e => setNewBrandName(e.target.value)} placeholder="例: CoCo壱" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">コード（英数字）</label>
              <Input value={newBrandCode} onChange={e => setNewBrandCode(e.target.value)} placeholder="例: cocoichi" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">色</label>
              <div className="flex gap-1 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewBrandColor(c)}
                    className={`w-8 h-8 rounded-full border-2 ${newBrandColor === c ? 'border-gray-800' : 'border-transparent'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateBrand(false)}>キャンセル</Button>
            <Button onClick={handleCreateBrand} disabled={isPending}>追加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== ブランド編集 ===== */}
      {editingBrand && (
        <Dialog open={!!editingBrand} onOpenChange={v => { if (!v) setEditingBrand(null) }}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base">{editingBrand.name} を編集</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">名前</label>
                <Input defaultValue={editingBrand.name} onBlur={e => e.target.value !== editingBrand.name && handleUpdateBrand(editingBrand, { name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">コード</label>
                <Input defaultValue={editingBrand.code} onBlur={e => e.target.value !== editingBrand.code && handleUpdateBrand(editingBrand, { code: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">色</label>
                <div className="flex gap-1 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => handleUpdateBrand(editingBrand, { color: c })}
                      className={`w-8 h-8 rounded-full border-2 ${editingBrand.color === c ? 'border-gray-800' : 'border-transparent'}`}
                      style={{ background: c }} />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={() => setEditingBrand(null)}>閉じる</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ===== 店舗新規 ===== */}
      <Dialog open={showCreateStore} onOpenChange={setShowCreateStore}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">店舗を新規追加</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">店舗名 <span className="text-red-500">*</span></label>
              <Input value={newStoreName} onChange={e => setNewStoreName(e.target.value)} placeholder="例: 渋谷本店" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">ブランド <span className="text-red-500">*</span></label>
              <Select value={newStoreBrandId} onValueChange={setNewStoreBrandId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="ブランドを選択" /></SelectTrigger>
                <SelectContent>
                  {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">都道府県（任意）</label>
              <Input value={newStorePrefecture} onChange={e => setNewStorePrefecture(e.target.value)} placeholder="例: 東京都" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateStore(false)}>キャンセル</Button>
            <Button onClick={handleCreateStore} disabled={isPending || !newStoreName.trim() || !newStoreBrandId}>追加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 部署新規 ===== */}
      <Dialog open={showCreateDept} onOpenChange={setShowCreateDept}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">部署を新規追加</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">部署名 <span className="text-red-500">*</span></label>
              <Input value={newDeptName} onChange={e => setNewDeptName(e.target.value)} placeholder="例: 本部" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">ブランド（任意・複数可）</label>
              <div className="flex flex-wrap gap-1">
                {brands.map(b => {
                  const active = newDeptBrandIds.has(b.id)
                  return (
                    <button key={b.id}
                      onClick={() => {
                        setNewDeptBrandIds(prev => {
                          const next = new Set(prev)
                          if (active) next.delete(b.id); else next.add(b.id)
                          return next
                        })
                      }}
                      className={`text-xs rounded-full px-2 py-0.5 border ${active ? 'text-white border-transparent' : 'text-gray-500 border-gray-300 bg-gray-50'}`}
                      style={active ? { background: b.color ?? '#94a3b8' } : {}}
                    >
                      {active && '✓ '}{b.name}
                    </button>
                  )
                })}
              </div>
              {newDeptBrandIds.size === 0 && (
                <p className="text-[10px] text-gray-500 mt-1">未選択の場合、全ブランド共通として扱われます</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDept(false)}>キャンセル</Button>
            <Button onClick={handleCreateDept} disabled={isPending || !newDeptName.trim()}>追加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
