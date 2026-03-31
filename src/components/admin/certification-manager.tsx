'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Award, Star, Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type CertIcon = 'award' | 'star'
type CertColor = 'emerald' | 'gold' | 'blue' | 'purple' | 'red' | 'orange' | 'pink' | 'gray'

const ICON_OPTIONS: { value: CertIcon; label: string; Icon: typeof Award }[] = [
  { value: 'award', label: '資格', Icon: Award },
  { value: 'star', label: '星', Icon: Star },
]

const COLOR_OPTIONS: { value: CertColor; label: string; bg: string; text: string; ring: string }[] = [
  { value: 'emerald', label: '緑',  bg: 'bg-emerald-100', text: 'text-emerald-600', ring: 'ring-emerald-400' },
  { value: 'gold',    label: '金',  bg: 'bg-yellow-100',  text: 'text-yellow-600',  ring: 'ring-yellow-400' },
  { value: 'blue',    label: '青',  bg: 'bg-blue-100',    text: 'text-blue-600',    ring: 'ring-blue-400' },
  { value: 'purple',  label: '紫',  bg: 'bg-purple-100',  text: 'text-purple-600',  ring: 'ring-purple-400' },
  { value: 'red',     label: '赤',  bg: 'bg-red-100',     text: 'text-red-600',     ring: 'ring-red-400' },
  { value: 'orange',  label: '橙',  bg: 'bg-orange-100',  text: 'text-orange-600',  ring: 'ring-orange-400' },
  { value: 'pink',    label: '桃',  bg: 'bg-pink-100',    text: 'text-pink-600',    ring: 'ring-pink-400' },
  { value: 'gray',    label: '灰',  bg: 'bg-gray-100',    text: 'text-gray-600',    ring: 'ring-gray-400' },
]

export function getCertColorClasses(color: CertColor) {
  return COLOR_OPTIONS.find(c => c.value === color) ?? COLOR_OPTIONS[0]
}

export function CertIcon({ icon, color, className }: { icon: CertIcon; color: CertColor; className?: string }) {
  const colorCls = getCertColorClasses(color)
  const IconComp = icon === 'star' ? Star : Award
  return <IconComp className={cn(colorCls.text, className)} />
}

interface Cert {
  id: string
  name: string
  description: string | null
  icon: CertIcon
  color: CertColor
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
  const [icon, setIcon] = useState<CertIcon>('award')
  const [color, setColor] = useState<CertColor>('emerald')
  const supabase = createClient()

  const openAdd = () => {
    setEditId(null); setName(''); setDescription(''); setIcon('award'); setColor('emerald')
    setDialogOpen(true)
  }

  const openEdit = (cert: Cert) => {
    setEditId(cert.id); setName(cert.name); setDescription(cert.description ?? '')
    setIcon(cert.icon); setColor(cert.color)
    setDialogOpen(true)
  }

  const handleSave = () => {
    if (!name.trim()) { toast.error('資格名を入力してください'); return }
    startTransition(async () => {
      if (editId) {
        const { error } = await supabase.from('certifications').update({
          name: name.trim(), description: description.trim() || null, icon, color,
        }).eq('id', editId)
        if (error) { toast.error('更新に失敗しました'); return }
        setCerts(prev => prev.map(c => c.id === editId ? { ...c, name: name.trim(), description: description.trim() || null, icon, color } : c))
        toast.success('資格を更新しました')
      } else {
        const maxOrder = certs.length > 0 ? Math.max(...certs.map(c => c.order_index)) + 1 : 0
        const { data, error } = await supabase.from('certifications').insert({
          name: name.trim(), description: description.trim() || null, icon, color, order_index: maxOrder,
        }).select().single()
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
              {certs.map(cert => {
                const colorCls = getCertColorClasses(cert.color)
                return (
                  <div key={cert.id} className={`flex items-center gap-2 ${colorCls.bg} rounded-lg px-3 py-2`}>
                    <CertIcon icon={cert.icon} color={cert.color} className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${colorCls.text}`}>{cert.name}</p>
                      {cert.description && <p className="text-xs text-gray-500 truncate">{cert.description}</p>}
                    </div>
                    <button onClick={() => openEdit(cert)} className="text-gray-300 hover:text-orange-500" disabled={isPending}>
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(cert.id)} className="text-gray-300 hover:text-red-500" disabled={isPending}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })}
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
            <div>
              <label className="text-xs font-medium text-gray-600">アイコン</label>
              <div className="flex gap-2 mt-1">
                {ICON_OPTIONS.map(opt => {
                  const colorCls = getCertColorClasses(color)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setIcon(opt.value)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                        icon === opt.value
                          ? `${colorCls.bg} ${colorCls.text} border-current`
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      )}
                    >
                      <opt.Icon className="w-4 h-4" />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">色</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COLOR_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setColor(opt.value)}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                      opt.bg, opt.text,
                      color === opt.value ? `ring-2 ${opt.ring} ring-offset-1` : 'opacity-60 hover:opacity-100'
                    )}
                    title={opt.label}
                  >
                    {icon === 'star' ? <Star className="w-4 h-4" /> : <Award className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>
            {/* プレビュー */}
            <div>
              <label className="text-xs font-medium text-gray-600">プレビュー</label>
              <div className="mt-1">
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  getCertColorClasses(color).bg, getCertColorClasses(color).text,
                )}>
                  <CertIcon icon={icon} color={color} className="w-3 h-3" />
                  {name || '資格名'}
                </span>
              </div>
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
