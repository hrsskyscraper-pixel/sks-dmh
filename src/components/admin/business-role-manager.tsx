'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Briefcase, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createBusinessRole, updateBusinessRole, deleteBusinessRole } from '@/app/(dashboard)/admin/business-roles/actions'
import type { BusinessRole } from '@/types/database'

interface Props {
  businessRoles: BusinessRole[]
  usageCount: Record<string, number>
}

export function BusinessRoleManager({ businessRoles: initial, usageCount }: Props) {
  const [roles, setRoles] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleCreate = () => {
    if (!newName.trim()) { toast.error('名称を入力してください'); return }
    startTransition(async () => {
      const res = await createBusinessRole(newName)
      if (res.error) { toast.error(res.error); return }
      if (res.id) {
        const maxOrder = roles.reduce((m, r) => Math.max(m, r.sort_order), 0)
        setRoles(prev => [...prev, {
          id: res.id!, name: newName.trim(), sort_order: maxOrder + 10,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }])
      }
      setNewName(''); setShowCreate(false)
      toast.success('業務役職を追加しました')
    })
  }

  const handleRename = (id: string) => {
    if (!editingName.trim()) { toast.error('名称を入力してください'); return }
    startTransition(async () => {
      const res = await updateBusinessRole(id, { name: editingName.trim() })
      if (res.error) { toast.error(res.error); return }
      setRoles(prev => prev.map(r => r.id === id ? { ...r, name: editingName.trim() } : r))
      setEditingId(null); setEditingName('')
      toast.success('更新しました')
    })
  }

  const handleDelete = (r: BusinessRole) => {
    if ((usageCount[r.id] ?? 0) > 0) { toast.error('この役職を持つ社員がいるため削除できません'); return }
    if (!confirm(`「${r.name}」を削除します。よろしいですか？`)) return
    startTransition(async () => {
      const res = await deleteBusinessRole(r.id)
      if (res.error) { toast.error(res.error); return }
      setRoles(prev => prev.filter(x => x.id !== r.id))
      toast.success('削除しました')
    })
  }

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              業務役職マスタ
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreate(v => !v)} className="bg-orange-500 hover:bg-orange-600 h-8 text-xs">
              <Plus className="w-3 h-3 mr-1" />追加
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">社員の業務上の役職（役員・部長・店長 等）。システム権限とは独立。</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {showCreate && (
            <div className="flex gap-2 p-2 rounded-lg bg-orange-50 border border-orange-200">
              <Input
                placeholder="役職名（例: 統括マネジャー）"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                disabled={isPending}
                className="h-9 text-sm"
              />
              <Button size="sm" onClick={handleCreate} disabled={isPending} className="bg-orange-500 hover:bg-orange-600 h-9">
                追加
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); setNewName('') }} disabled={isPending} className="h-9">
                キャンセル
              </Button>
            </div>
          )}
          {roles.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">業務役職が登録されていません</p>
          ) : (
            <ul className="space-y-1">
              {roles.map(r => (
                <li key={r.id} className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                  {editingId === r.id ? (
                    <>
                      <Input
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        disabled={isPending}
                        className="h-8 text-sm flex-1"
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleRename(r.id)} disabled={isPending} className="h-8 w-8 p-0">
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditingName('') }} disabled={isPending} className="h-8 w-8 p-0">
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{r.name}</span>
                      <Badge variant="secondary" className="text-[11px]">{usageCount[r.id] ?? 0}名</Badge>
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(r.id); setEditingName(r.name) }} disabled={isPending} className="h-8 w-8 p-0">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(r)} disabled={isPending} className="h-8 w-8 p-0 text-red-500 hover:text-red-700">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
