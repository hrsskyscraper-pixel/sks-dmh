'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Plus, Trash2, ArrowLeft, Users, Briefcase, GraduationCap, MapPin, ArrowRightLeft, FileText, Pencil, Instagram } from 'lucide-react'
import { addCareerRecord, updateCareerRecord, deleteCareerRecord, updateEmployeeName } from '@/app/(dashboard)/actions'
import Link from 'next/link'
import type { CareerRecord } from '@/types/database'

const RECORD_TYPES = [
  { value: '面接', label: '面接', icon: Users, color: 'bg-blue-100 text-blue-700' },
  { value: '採用', label: '採用', icon: Briefcase, color: 'bg-green-100 text-green-700' },
  { value: '育成', label: '育成', icon: GraduationCap, color: 'bg-purple-100 text-purple-700' },
  { value: '配属', label: '配属', icon: MapPin, color: 'bg-amber-100 text-amber-700' },
  { value: '異動', label: '異動', icon: ArrowRightLeft, color: 'bg-red-100 text-red-700' },
  { value: 'その他', label: 'その他', icon: FileText, color: 'bg-gray-100 text-gray-700' },
]

interface EmployeeInfo { id: string; name: string; avatar_url: string | null }

interface Props {
  employee: { id: string; name: string; email: string; role: string; employment_type: string; hire_date: string | null; avatar_url: string | null; instagram_url: string | null }
  careerRecords: CareerRecord[]
  employeeMap: Record<string, EmployeeInfo>
  allEmployees: EmployeeInfo[]
  canEdit: boolean
}

export function EmployeeCareerCard({ employee, careerRecords, employeeMap, allEmployees, canEdit }: Props) {
  const [isPending, startTransition] = useTransition()
  const [employeeName, setEmployeeName] = useState(employee.name)
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [nameInput, setNameInput] = useState(employee.name)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [formType, setFormType] = useState('面接')
  const [formDate, setFormDate] = useState('')
  const [formPeople, setFormPeople] = useState<string[]>([])
  const [formDept, setFormDept] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [personSearch, setPersonSearch] = useState('')
  const router = useRouter()

  const filteredEmployees = allEmployees.filter(e =>
    e.id !== employee.id && !formPeople.includes(e.id) &&
    e.name.toLowerCase().includes(personSearch.toLowerCase())
  )

  const handleSave = () => {
    startTransition(async () => {
      const data = {
        record_type: formType,
        occurred_at: formDate || null,
        related_employee_ids: formPeople,
        department: formDept.trim() || null,
        notes: formNotes.trim() || null,
      }
      const result = editingRecordId
        ? await updateCareerRecord(editingRecordId, employee.id, data)
        : await addCareerRecord({ ...data, employee_id: employee.id })
      if (result.error) { toast.error(result.error); return }
      toast.success(editingRecordId ? '記録を更新しました' : '記録を追加しました')
      setDialogOpen(false)
      resetForm()
      router.refresh()
    })
  }

  const handleDelete = (recordId: string) => {
    if (!confirm('この記録を削除しますか？')) return
    startTransition(async () => {
      const result = await deleteCareerRecord(recordId, employee.id)
      if (result.error) { toast.error(result.error); return }
      toast.success('記録を削除しました')
      router.refresh()
    })
  }

  const resetForm = () => {
    setEditingRecordId(null)
    setFormType('面接')
    setFormDate('')
    setFormPeople([])
    setFormDept('')
    setFormNotes('')
    setPersonSearch('')
  }

  const openDialog = (type?: string) => {
    resetForm()
    if (type) setFormType(type)
    setDialogOpen(true)
  }

  const openEditDialog = (record: CareerRecord) => {
    setEditingRecordId(record.id)
    setFormType(record.record_type)
    setFormDate(record.occurred_at ?? '')
    setFormPeople(record.related_employee_ids ?? [])
    setFormDept(record.department ?? '')
    setFormNotes(record.notes ?? '')
    setPersonSearch('')
    setDialogOpen(true)
  }

  // 記録をタイプ別にグルーピング
  const recordsByType: Record<string, CareerRecord[]> = {}
  for (const r of careerRecords) {
    if (!recordsByType[r.record_type]) recordsByType[r.record_type] = []
    recordsByType[r.record_type].push(r)
  }

  return (
    <div className="p-4 space-y-4">
      {/* 戻るリンク */}
      <Link href="/admin/employees" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="w-4 h-4" />
        メンバー一覧に戻る
      </Link>

      {/* プロフィールヘッダー */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-4">
            <Avatar className="w-16 h-16">
              <AvatarImage src={employee.avatar_url ?? undefined} />
              <AvatarFallback className="bg-orange-100 text-orange-700 text-xl font-bold">{employee.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xl font-bold text-gray-800">{employeeName}</h2>
                {canEdit && (
                  <button onClick={() => { setNameInput(employeeName); setNameDialogOpen(true) }} className="text-gray-300 hover:text-orange-500 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                {employee.instagram_url && (
                  <a href={employee.instagram_url.startsWith('http') ? employee.instagram_url : `https://instagram.com/${employee.instagram_url.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-pink-500 transition-colors">
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
              </div>
              <p className="text-sm text-gray-500">{employee.email}</p>
              <div className="flex gap-1.5 mt-1">
                <Badge className="text-[10px] bg-orange-100 text-orange-700 border-0">{employee.employment_type}</Badge>
                {employee.hire_date && (
                  <Badge className="text-[10px] bg-gray-100 text-gray-600 border-0">
                    {employee.hire_date} 入社
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 記録追加ボタン */}
      {canEdit && (
        <Button onClick={() => openDialog()} className="w-full bg-orange-500 hover:bg-orange-600 text-white" disabled={isPending}>
          <Plus className="w-4 h-4 mr-1" />
          キャリア記録を追加
        </Button>
      )}

      {/* タイプ別記録 */}
      {RECORD_TYPES.map(({ value, label, icon: Icon, color }) => {
        const records = recordsByType[value]
        if (!records?.length) return null
        return (
          <Card key={value}>
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <Icon className="w-4 h-4" />
                  {label}
                </CardTitle>
                {canEdit && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-600" onClick={() => openDialog(value)}>
                    <Plus className="w-3 h-3 mr-0.5" />追加
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {records.map(record => (
                <div key={record.id} className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {record.occurred_at && (
                        <p className="text-xs text-gray-400 mb-1">{record.occurred_at}</p>
                      )}
                      {record.department && (
                        <p className="text-sm font-medium text-gray-800 mb-1">{record.department}</p>
                      )}
                      {record.related_employee_ids.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mb-1">
                          {record.related_employee_ids.map(eid => {
                            const person = employeeMap[eid]
                            return (
                              <div key={eid} className="flex items-center gap-1 bg-white rounded-full pl-0.5 pr-2 py-0.5 border border-gray-200">
                                <Avatar className="w-5 h-5">
                                  <AvatarImage src={person?.avatar_url ?? undefined} />
                                  <AvatarFallback className="bg-gray-200 text-gray-600 text-[8px]">{person?.name?.charAt(0) ?? '?'}</AvatarFallback>
                                </Avatar>
                                <span className="text-[11px] text-gray-700">{person?.name ?? '不明'}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {record.notes && (
                        <p className="text-sm text-gray-600">{record.notes}</p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-0.5 flex-shrink-0">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-300 hover:text-orange-500"
                          onClick={() => openEditDialog(record)} disabled={isPending}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-gray-300 hover:text-red-500"
                          onClick={() => handleDelete(record.id)} disabled={isPending}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}

      {/* 記録がない場合 */}
      {careerRecords.length === 0 && (
        <div className="py-12 text-center text-sm text-muted-foreground">
          まだキャリア記録がありません
        </div>
      )}

      {/* 名前編集ダイアログ */}
      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>名前を変更</DialogTitle></DialogHeader>
          <Input value={nameInput} onChange={e => setNameInput(e.target.value)} className="text-sm" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNameDialogOpen(false)}>キャンセル</Button>
            <Button
              disabled={isPending || !nameInput.trim() || nameInput.trim() === employeeName}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => {
                startTransition(async () => {
                  const result = await updateEmployeeName(employee.id, nameInput.trim())
                  if (result.error) { toast.error(result.error); return }
                  setEmployeeName(nameInput.trim())
                  setNameDialogOpen(false)
                  toast.success('名前を変更しました')
                  router.refresh()
                })
              }}
            >変更</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 追加ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingRecordId ? 'キャリア記録を編集' : 'キャリア記録を追加'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">種別</p>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECORD_TYPES.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">日付</p>
              <Input type="date" value={formDate} onChange={e => setFormDate(e.target.value)} className="text-sm" />
            </div>
            {(formType === '配属' || formType === '異動') && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">{formType === '配属' ? '配属先' : '異動先'}</p>
                <Input placeholder="例: 渋谷本店" value={formDept} onChange={e => setFormDept(e.target.value)} className="text-sm" />
              </div>
            )}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">関係者</p>
              {formPeople.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {formPeople.map(pid => {
                    const p = allEmployees.find(e => e.id === pid)
                    return (
                      <button key={pid} onClick={() => setFormPeople(prev => prev.filter(x => x !== pid))}
                        className="flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-full pl-0.5 pr-2 py-0.5 hover:bg-red-50 hover:border-red-200 transition-colors">
                        <Avatar className="w-5 h-5">
                          <AvatarImage src={p?.avatar_url ?? undefined} />
                          <AvatarFallback className="bg-orange-200 text-orange-700 text-[8px]">{p?.name?.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="text-[11px] text-gray-700">{p?.name}</span>
                        <span className="text-[10px] text-gray-400">×</span>
                      </button>
                    )
                  })}
                </div>
              )}
              <Input placeholder="名前で検索..." value={personSearch} onChange={e => setPersonSearch(e.target.value)} className="text-sm" />
              {personSearch && (
                <div className="mt-1 max-h-32 overflow-y-auto border rounded-md">
                  {filteredEmployees.slice(0, 8).map(e => (
                    <button key={e.id} onClick={() => { setFormPeople(prev => [...prev, e.id]); setPersonSearch('') }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={e.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-gray-200 text-gray-600 text-[9px]">{e.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm text-gray-700">{e.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">メモ</p>
              <Textarea placeholder="詳細やコメント..." value={formNotes} onChange={e => setFormNotes(e.target.value)} className="text-sm min-h-[60px] resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={isPending} className="bg-orange-500 hover:bg-orange-600 text-white">{editingRecordId ? '更新' : '追加'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
