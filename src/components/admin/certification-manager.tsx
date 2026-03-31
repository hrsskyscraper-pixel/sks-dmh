'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Award, Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Cert {
  id: string
  name: string
  description: string | null
  order_index: number
  is_active: boolean
}

interface Props {
  certifications: Cert[]
}

export function CertificationManager({ certifications: initial }: Props) {
  const [certs, setCerts] = useState(initial)
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const supabase = createClient()
  const router = useRouter()

  const openAdd = () => {
    setEditId(null)
    setName('')
    setDescription('')
    setDialogOpen(true)
  }

  const openEdit = (cert: Cert) => {
    setEditId(cert.id)
    setName(cert.name)
    setDescription(cert.description ?? '')
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!name.trim()) { toast.error('資格名を入力してください'); return }
    startTransition(async () => {
      if (editId) {
        const { error } = await supabase.from('certifications').update({ name: name.trim(), description: description.trim() || null }).eq('id', editId)
        if (error) { toast.error('更新に失敗しました'); return }
        setCerts(prev => prev.map(c => c.id === editId ? { ...c, name: name.trim(), description: description.trim() || null } : c))
        toast.success('資格を更新しました')
      } else {
        const maxOrder = certs.length > 0 ? Math.max(...certs.map(c => c.order_index)) + 1 : 0
        const { data, error } = await supabase.from('certifications').insert({ name: name.trim(), description: description.trim() || null, order_index: maxOrder }).select().single()
        if (error || !data) { toast.error('追加に失敗しました'); return }
        setCerts(prev => [...prev, data])
        toast.success('資格を追加しました')
      }
      setDialogOpen(false)
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const { error } = await supabase.from('certifications').delete().eq('id', id)
      if (error) { toast.error('削除に失敗しました'); return }
      setCerts(prev => prev.filter(c => c.id !== id))
      toast.success('資格を削除しました')
    })
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-500" />
              社内資格マスタ
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-500 px-2" onClick={openAdd} disabled={isPending}>
              <Plus className="w-3 h-3 mr-1" />追加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {certs.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">社内資格が登録されていません</p>
          ) : (
            <div className="space-y-1.5">
              {certs.map(cert => (
                <div key={cert.id} className="flex items-center gap-2 bg-emerald-50 rounded-lg px-3 py-2">
                  <Award className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{cert.name}</p>
                    {cert.description && <p className="text-xs text-gray-500 truncate">{cert.description}</p>}
                  </div>
                  <button onClick={() => openEdit(cert)} className="text-gray-300 hover:text-orange-500" disabled={isPending}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(cert.id)} className="text-gray-300 hover:text-red-500" disabled={isPending}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{editId ? '社内資格を編集' : '社内資格を追加'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">資格名 <span className="text-red-500">*</span></label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="例: 接客マイスター" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">説明</label>
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="任意" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isPending}>キャンセル</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={handleSave} disabled={isPending || !name.trim()}>
              {isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
