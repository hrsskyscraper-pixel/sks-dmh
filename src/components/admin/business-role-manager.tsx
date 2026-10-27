'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Briefcase, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { createBusinessRole, updateBusinessRole, deleteBusinessRole } from '@/app/(dashboard)/admin/business-roles/actions'
import type { BusinessRole } from '@/types/database'

interface Props {
  businessRoles: BusinessRole[]
  usageCount: Record<string, number>
}

type StdPerm = BusinessRole['standard_permission']
const STD_LABEL: Record<string, string> = { training_member: 'メンバー', training_leader: 'リーダー', ops_admin: '運用管理者' }

/**
 * 社内役職マスタ（2026-10-27〜。それまでは「業務役職」）。
 * MB で利用者に見える役職は社内の公式役職と同じにし、アプリの動きは役職ごとの設定で結びつける:
 * - 正式名称: 略称で表示する役職（GSDM・TAMG など）は、カーソルを合わせると正式名称が出る
 * - 標準の承認の権限: その役職の人に最低限付ける権限。役職を付けると、この権限まで上がる（個別に上げるのは可）
 * - 役員として扱う: 改善提案で役員（意思決定者）として扱う
 */
export function BusinessRoleManager({ businessRoles: initial, usageCount }: Props) {
  const [roles, setRoles] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<{ id: string; name: string; fullName: string; std: StdPerm; exec: boolean } | null>(null)
  const [deleting, setDeleting] = useState<BusinessRole | null>(null)

  const handleCreate = () => {
    if (!newName.trim()) { toast.error('名称を入力してください'); return }
    startTransition(async () => {
      const res = await createBusinessRole(newName)
      if (res.error) { toast.error(res.error); return }
      if (res.id) {
        const maxOrder = roles.reduce((m, r) => Math.max(m, r.sort_order), 0)
        setRoles(prev => [...prev, {
          id: res.id!, name: newName.trim(), full_name: null, standard_permission: null, is_executive: false, sort_order: maxOrder + 10,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }])
      }
      setNewName(''); setShowCreate(false)
      toast.success('社内役職を追加しました')
    })
  }

  const handleSave = () => {
    if (!editing) return
    if (!editing.name.trim()) { toast.error('名称を入力してください'); return }
    const patch = { name: editing.name.trim(), full_name: editing.fullName.trim() || null, standard_permission: editing.std, is_executive: editing.exec }
    startTransition(async () => {
      const res = await updateBusinessRole(editing.id, patch)
      if (res.error) { toast.error(res.error); return }
      setRoles(prev => prev.map(r => r.id === editing.id ? { ...r, ...patch } : r))
      setEditing(null)
      toast.success('更新しました')
    })
  }

  const handleDelete = () => {
    const r = deleting
    if (!r) return
    startTransition(async () => {
      const res = await deleteBusinessRole(r.id)
      if (res.error) { toast.error(res.error); return }
      setRoles(prev => prev.filter(x => x.id !== r.id))
      setDeleting(null)
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
              社内役職マスタ
            </CardTitle>
            <Button size="sm" onClick={() => setShowCreate(v => !v)} className="bg-orange-500 hover:bg-orange-600 h-8 text-xs">
              <Plus className="w-3 h-3 mr-1" />追加
            </Button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            社内の公式役職（組織図）と同じ名前にします。利用者の画面には、この名前が出ます。
            「標準の承認の権限」は、その役職の人に最低限付ける権限です（役職を付けると、この権限まで上がります。個別に上げることはできます）。
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {showCreate && (
            <div className="flex gap-2 p-2 rounded-lg bg-orange-50 border border-orange-200">
              <Input
                placeholder="役職名（例: 店長補佐）"
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
            <p className="text-sm text-gray-500 text-center py-4">社内役職が登録されていません</p>
          ) : (
            <ul className="space-y-1">
              {roles.map(r => (
                <li key={r.id} className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                  {editing?.id === r.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[11px] text-gray-600">役職名（画面に出る名前）
                          <Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} disabled={isPending} className="h-8 text-sm" autoFocus />
                        </label>
                        <label className="text-[11px] text-gray-600">正式名称（略称のときだけ）
                          <Input value={editing.fullName} onChange={e => setEditing({ ...editing, fullName: e.target.value })} disabled={isPending} className="h-8 text-sm" placeholder="例: Global Staff Development Manager" />
                        </label>
                      </div>
                      {r.name === '店長' && editing.name.trim() !== '店長' && (
                        <p className="text-[11px] text-red-600">「店長」は、名前でリーダーの登録や呼び名を決めている所があります。名前を変えないでください。</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <label className="text-[11px] text-gray-600">標準の承認の権限
                          <select className="ml-1 rounded border border-gray-300 px-1 py-0.5 text-sm" value={editing.std ?? ''} onChange={e => setEditing({ ...editing, std: (e.target.value || null) as StdPerm })}>
                            <option value="">決めない</option>
                            <option value="training_member">メンバー</option>
                            <option value="training_leader">リーダー</option>
                            <option value="ops_admin">運用管理者</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1 text-[11px] text-gray-600">
                          <input type="checkbox" checked={editing.exec} onChange={e => setEditing({ ...editing, exec: e.target.checked })} />改善提案で役員として扱う
                        </label>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={handleSave} disabled={isPending} className="h-8"><Check className="w-4 h-4 text-green-600 mr-1" />保存</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={isPending} className="h-8"><X className="w-4 h-4 mr-1" />やめる</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium" title={r.full_name ?? undefined}>{r.name}</span>
                        {r.full_name && <span className="ml-1 text-[11px] text-gray-500">{r.full_name}</span>}
                        <p className="text-[11px] text-gray-500">
                          標準の承認の権限: {r.standard_permission ? STD_LABEL[r.standard_permission] : '決めない'}{r.is_executive ? ' ・改善提案で役員として扱う' : ''}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[11px]">{usageCount[r.id] ?? 0}名</Badge>
                      <Button size="sm" variant="ghost" onClick={() => setEditing({ id: r.id, name: r.name, fullName: r.full_name ?? '', std: r.standard_permission, exec: r.is_executive })} disabled={isPending} className="h-8 w-8 p-0">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => (usageCount[r.id] ?? 0) > 0 ? toast.error('この役職を持つ社員がいるため削除できません') : setDeleting(r)} disabled={isPending} className="h-8 w-8 p-0 text-red-500 hover:text-red-700">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={o => { if (!o) setDeleting(null) }}
        title={`「${deleting?.name ?? ''}」を削除します`}
        confirmLabel="削除する"
        pending={isPending}
        onConfirm={handleDelete}
      >
        <p className="text-sm text-gray-600">この役職を持つ社員はいません。削除すると、社員の役職の選択肢から消えます。管理者の申請の対象に入っていた場合は、その設定からも外れます。</p>
      </ConfirmDialog>
    </div>
  )
}
