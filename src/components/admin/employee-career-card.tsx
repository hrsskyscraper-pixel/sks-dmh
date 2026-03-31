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
import { Plus, Trash2, ArrowLeft, Users, Briefcase, GraduationCap, MapPin, ArrowRightLeft, FileText, Pencil, Instagram, X, Store, FolderKanban, Building2, Award, Star, UserCog, LogIn, Camera, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { CertIcon as CertIconComponent, getCertColorClasses } from '@/components/admin/certification-manager'
import { addCareerRecord, updateCareerRecord, deleteCareerRecord, updateEmployeeName } from '@/app/(dashboard)/actions'
import Link from 'next/link'
import type { CareerRecord } from '@/types/database'

const RECORD_TYPES = [
  { value: '面接', label: '面接', icon: Users, color: 'bg-blue-100 text-blue-700' },
  { value: '採用', label: '採用', icon: Briefcase, color: 'bg-green-100 text-green-700' },
  { value: '入社', label: '入社', icon: LogIn, color: 'bg-lime-100 text-lime-700' },
  { value: '配属・異動', label: '配属・異動', icon: MapPin, color: 'bg-amber-100 text-amber-700' },
  { value: '育成', label: '育成', icon: GraduationCap, color: 'bg-purple-100 text-purple-700' },
  { value: '役職', label: '役職', icon: UserCog, color: 'bg-sky-100 text-sky-700' },
  { value: '資格', label: '資格', icon: Award, color: 'bg-emerald-100 text-emerald-700' },
  { value: 'その他', label: 'その他', icon: FileText, color: 'bg-gray-100 text-gray-700' },
]

// 旧データの「配属」「異動」も「配属・異動」として表示
const RECORD_TYPE_ALIASES: Record<string, string> = {
  '配属': '配属・異動',
  '異動': '配属・異動',
}

interface EmployeeInfo { id: string; name: string; avatar_url: string | null }

interface TeamInfo {
  id: string
  name: string
  type: 'store' | 'project' | 'department'
  prefecture: string | null
}

interface GoalInfo {
  id: string
  content: string
  deadline: string | null
  set_at: string
}

type DisplayRole = '開発者' | '役員' | '運用管理者' | 'マネジャー' | '店長' | '社員' | 'メイト'

const ROLE_MAP: { display: DisplayRole; role: string; employment_type: string }[] = [
  { display: 'メイト', role: 'employee', employment_type: 'メイト' },
  { display: '社員', role: 'employee', employment_type: '社員' },
  { display: '店長', role: 'store_manager', employment_type: '社員' },
  { display: 'マネジャー', role: 'manager', employment_type: '社員' },
  { display: '運用管理者', role: 'ops_manager', employment_type: '社員' },
  { display: '役員', role: 'executive', employment_type: '社員' },
  { display: '開発者', role: 'admin', employment_type: '社員' },
]

function getDisplayRole(role: string, employmentType: string): DisplayRole {
  if (role === 'admin') return '開発者'
  if (role === 'executive') return '役員'
  if (role === 'ops_manager') return '運用管理者'
  if (role === 'manager') return 'マネジャー'
  if (role === 'store_manager') return '店長'
  if (employmentType === 'メイト') return 'メイト'
  return '社員'
}

function getHireYearLabel(hireDate: string | null): string | null {
  if (!hireDate) return null
  const hire = new Date(hireDate)
  const today = new Date()
  const hireFY = hire.getMonth() >= 3 ? hire.getFullYear() : hire.getFullYear() - 1
  const todayFY = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return `${Math.max(1, todayFY - hireFY + 1)}年目`
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

interface Props {
  employee: { id: string; name: string; email: string; role: string; employment_type: string; hire_date: string | null; birth_date: string | null; avatar_url: string | null; instagram_url: string | null }
  careerRecords: CareerRecord[]
  employeeMap: Record<string, EmployeeInfo>
  allEmployees: EmployeeInfo[]
  canEdit: boolean
  memberTeamIds: string[]
  allTeams: TeamInfo[]
  goal: GoalInfo | null
  certifications: { id: string; name: string; icon: 'award' | 'star'; color: string }[]
}

export function EmployeeCareerCard({ employee, careerRecords, employeeMap, allEmployees, canEdit, memberTeamIds, allTeams, goal, certifications }: Props) {
  const [isPending, startTransition] = useTransition()
  const [avatarUrl, setAvatarUrl] = useState(employee.avatar_url)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
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

  // プロフィール編集
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [editName, setEditName] = useState(employee.name)
  const [editRole, setEditRole] = useState(getDisplayRole(employee.role, employee.employment_type))
  const [editBirthDate, setEditBirthDate] = useState(employee.birth_date ?? '')
  const [editInstagram, setEditInstagram] = useState(employee.instagram_url ?? '')
  const [currentRole, setCurrentRole] = useState(getDisplayRole(employee.role, employee.employment_type))
  const [currentBirthDate, setCurrentBirthDate] = useState(employee.birth_date)
  const [currentInstagram, setCurrentInstagram] = useState(employee.instagram_url)

  // 入社日はキャリア記録の「入社」レコードの最も古い日付から自動取得
  const hireRecords = careerRecords.filter(r => r.record_type === '入社' && r.occurred_at)
  const oldestHireDate = hireRecords.length > 0
    ? hireRecords.reduce((oldest, r) => (!oldest || (r.occurred_at! < oldest) ? r.occurred_at! : oldest), '' as string)
    : null
  const currentHireDate = oldestHireDate ?? employee.hire_date

  const handleProfileSave = () => {
    const rm = ROLE_MAP.find(r => r.display === editRole)
    if (!rm || !editName.trim()) return
    startTransition(async () => {
      const { error } = await supabase.from('employees').update({
        name: editName.trim(),
        role: rm.role,
        employment_type: rm.employment_type,
        birth_date: editBirthDate || null,
        instagram_url: editInstagram || null,
      }).eq('id', employee.id)
      if (error) { toast.error('更新に失敗しました'); return }
      setEmployeeName(editName.trim())
      setCurrentRole(editRole)
      setCurrentBirthDate(editBirthDate || null)
      setCurrentInstagram(editInstagram || null)
      setProfileDialogOpen(false)
      toast.success('プロフィールを更新しました')
    })
  }

  // 所属チーム管理
  const [currentTeamIds, setCurrentTeamIds] = useState<string[]>(memberTeamIds)
  const [addTeamDialogOpen, setAddTeamDialogOpen] = useState(false)
  const [expandedAddPrefs, setExpandedAddPrefs] = useState<Set<string>>(new Set())
  const teamMap = Object.fromEntries(allTeams.map(t => [t.id, t]))
  const currentTeams = currentTeamIds.map(id => teamMap[id]).filter(Boolean)
  const storeTeamsList = currentTeams.filter(t => t.type === 'store')
  const deptTeamsList = currentTeams.filter(t => t.type === 'department')
  const projectTeamsList = currentTeams.filter(t => t.type === 'project')
  const availableTeams = allTeams.filter(t => !currentTeamIds.includes(t.id))

  const supabase = (() => {
    const { createClient } = require('@/lib/supabase/client')
    return createClient()
  })()

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${employee.id}.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) { toast.error('アップロードに失敗しました'); return }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // キャッシュバスター付きURLで保存
      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`
      const { error: updateError } = await supabase.from('employees').update({ avatar_url: urlWithCacheBust }).eq('id', employee.id)
      if (updateError) { toast.error('更新に失敗しました'); return }
      setAvatarUrl(urlWithCacheBust)
      toast.success('写真を更新しました')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleAddTeam = (teamId: string) => {
    startTransition(async () => {
      const { error } = await supabase.from('team_members').insert({ team_id: teamId, employee_id: employee.id })
      if (error) { toast.error('追加に失敗しました'); return }
      setCurrentTeamIds(prev => [...prev, teamId])
      setAddTeamDialogOpen(false)
      toast.success(`${teamMap[teamId]?.name ?? ''}に追加しました`)
    })
  }

  const handleRemoveTeam = (teamId: string) => {
    startTransition(async () => {
      const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('employee_id', employee.id)
      if (error) { toast.error('削除に失敗しました'); return }
      setCurrentTeamIds(prev => prev.filter(id => id !== teamId))
      toast.success(`${teamMap[teamId]?.name ?? ''}から削除しました`)
    })
  }

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
      // 入社記録の場合、最も古い入社日を employees.hire_date に自動更新
      if (formType === '入社') {
        // 編集時は編集対象を除外してから新しい日付を追加
        const otherDates = hireRecords.filter(r => r.id !== editingRecordId && r.occurred_at).map(r => r.occurred_at!)
        const allHireDates = [...otherDates, ...(formDate ? [formDate] : [])]
        const oldest = allHireDates.sort()[0]
        if (oldest) {
          await supabase.from('employees').update({ hire_date: oldest }).eq('id', employee.id)
        }
      }
      toast.success(editingRecordId ? '記録を更新しました' : '記録を追加しました')
      setDialogOpen(false)
      resetForm()
      router.refresh()
    })
  }

  const handleDelete = (recordId: string) => {
    if (!confirm('この記録を削除しますか？')) return
    startTransition(async () => {
      const deletedRecord = careerRecords.find(r => r.id === recordId)
      const result = await deleteCareerRecord(recordId, employee.id)
      if (result.error) { toast.error(result.error); return }
      // 入社記録を削除した場合、残りの入社記録から最古を再計算
      if (deletedRecord?.record_type === '入社') {
        const remaining = hireRecords.filter(r => r.id !== recordId && r.occurred_at).map(r => r.occurred_at!)
        const oldest = remaining.sort()[0] ?? null
        await supabase.from('employees').update({ hire_date: oldest }).eq('id', employee.id)
      }
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

  // 記録をタイプ別にグルーピング（旧データの配属・異動を統合）+ 日付昇順ソート
  const recordsByType: Record<string, CareerRecord[]> = {}
  for (const r of careerRecords) {
    const type = RECORD_TYPE_ALIASES[r.record_type] ?? r.record_type
    if (!recordsByType[type]) recordsByType[type] = []
    recordsByType[type].push(r)
  }
  for (const type of Object.keys(recordsByType)) {
    recordsByType[type].sort((a, b) => (a.occurred_at ?? '').localeCompare(b.occurred_at ?? ''))
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
          <div className="flex items-start gap-4">
            {canEdit ? (
              <label htmlFor="career-avatar" className="relative cursor-pointer group flex-shrink-0">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={avatarUrl ?? undefined} />
                  <AvatarFallback className="bg-orange-100 text-orange-700 text-xl font-bold">{employee.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {uploadingAvatar ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
                </div>
                <input id="career-avatar" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = '' }} />
              </label>
            ) : (
              <Avatar className="w-16 h-16 flex-shrink-0">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-orange-100 text-orange-700 text-xl font-bold">{employee.name.charAt(0)}</AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xl font-bold text-gray-800">{employeeName}</h2>
                {currentInstagram && (
                  <a href={currentInstagram.startsWith('http') ? currentInstagram : `https://instagram.com/${currentInstagram.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-pink-500 transition-colors">
                    <Instagram className="w-5 h-5" />
                  </a>
                )}
              </div>
              <p className="text-sm text-gray-500">{employee.email}</p>

              <div className="flex gap-1.5 mt-2 flex-wrap items-center">
                <Badge className="text-[10px] bg-orange-100 text-orange-700 border-0">{currentRole}</Badge>
                {(() => {
                  const latestPosition = careerRecords.find(r => r.record_type === '役職')
                  return latestPosition?.department ? (
                    <Badge className="text-[10px] bg-sky-100 text-sky-700 border-0">
                      {latestPosition.department}
                    </Badge>
                  ) : null
                })()}
                {currentBirthDate && (
                  <Badge className="text-[10px] bg-pink-50 text-pink-600 border-0">
                    {currentBirthDate}生（{calcAge(currentBirthDate)}歳）
                  </Badge>
                )}
                {currentHireDate && (
                  <Badge className="text-[10px] bg-gray-100 text-gray-600 border-0">
                    {currentHireDate} 入社{getHireYearLabel(currentHireDate) ? `（${getHireYearLabel(currentHireDate)}）` : ''}
                  </Badge>
                )}
              </div>

              {/* 社内資格 */}
              {(() => {
                const internalCertNames = careerRecords
                  .filter(r => (RECORD_TYPE_ALIASES[r.record_type] ?? r.record_type) === '資格' && r.department?.startsWith('[社内]'))
                  .map(r => r.department!.replace('[社内]', ''))
                const uniqueNames = [...new Set(internalCertNames)]
                if (uniqueNames.length === 0) return null
                const certMap = Object.fromEntries(certifications.map(c => [c.name, c]))
                return (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {uniqueNames.map(certName => {
                      const cert = certMap[certName]
                      const colorCls = cert ? getCertColorClasses(cert.color as Parameters<typeof getCertColorClasses>[0]) : getCertColorClasses('emerald')
                      return (
                        <Badge key={certName} className={`text-[10px] ${colorCls.bg} ${colorCls.text} border-0 flex items-center gap-0.5`}>
                          {cert ? <CertIconComponent icon={cert.icon} color={cert.color as 'emerald'} className="w-3 h-3" /> : <Award className="w-3 h-3" />}
                          {certName}
                        </Badge>
                      )
                    })}
                  </div>
                )
              })()}

              {/* 目標 */}
              {goal && (
                <div className="mt-2 bg-amber-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700 font-medium">{goal.content}</p>
                  {goal.deadline && <p className="text-[10px] text-amber-500 mt-0.5">{goal.deadline} まで</p>}
                </div>
              )}

              {canEdit && (
                <button
                  onClick={() => {
                    setEditName(employeeName)
                    setEditRole(currentRole)
                    setEditBirthDate(currentBirthDate ?? '')
                    setEditInstagram(currentInstagram ?? '')
                    setProfileDialogOpen(true)
                  }}
                  className="mt-2 text-xs text-orange-500 hover:text-orange-700 flex items-center gap-1"
                >
                  <Pencil className="w-3 h-3" />
                  プロフィールを編集
                </button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* プロフィール編集ダイアログ */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">プロフィール編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">氏名</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">ロール</label>
              <Select value={editRole} onValueChange={v => setEditRole(v as DisplayRole)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_MAP.map(r => (
                    <SelectItem key={r.display} value={r.display}>{r.display}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">生年月日</label>
              <Input type="date" value={editBirthDate} onChange={e => setEditBirthDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Instagram URL</label>
              <Input value={editInstagram} onChange={e => setEditInstagram(e.target.value)} placeholder="@username or URL" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)} disabled={isPending}>キャンセル</Button>
            <Button className="bg-orange-500 hover:bg-orange-600" onClick={handleProfileSave} disabled={isPending}>
              {isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 所属情報 */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              所属
            </CardTitle>
            {canEdit && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-orange-500 px-2" onClick={() => setAddTeamDialogOpen(true)} disabled={isPending}>
                <Plus className="w-3 h-3 mr-1" />追加
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {storeTeamsList.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 font-medium mb-1">店舗</p>
              <div className="flex flex-wrap gap-1.5">
                {storeTeamsList.map(t => (
                  <div key={t.id} className="flex items-center gap-1 bg-blue-50 text-blue-700 rounded-full pl-2 pr-1 py-0.5 text-xs">
                    <Store className="w-3 h-3" />
                    {t.prefecture && <span className="text-blue-400">{t.prefecture}</span>}
                    {t.name}
                    {canEdit && (
                      <button onClick={() => handleRemoveTeam(t.id)} className="text-blue-300 hover:text-red-500 ml-0.5" disabled={isPending}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {deptTeamsList.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 font-medium mb-1">部署</p>
              <div className="flex flex-wrap gap-1.5">
                {deptTeamsList.map(t => (
                  <div key={t.id} className="flex items-center gap-1 bg-teal-50 text-teal-700 rounded-full pl-2 pr-1 py-0.5 text-xs">
                    <Building2 className="w-3 h-3" />
                    {t.name}
                    {canEdit && (
                      <button onClick={() => handleRemoveTeam(t.id)} className="text-teal-300 hover:text-red-500 ml-0.5" disabled={isPending}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {projectTeamsList.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 font-medium mb-1">チーム</p>
              <div className="flex flex-wrap gap-1.5">
                {projectTeamsList.map(t => (
                  <div key={t.id} className="flex items-center gap-1 bg-purple-50 text-purple-700 rounded-full pl-2 pr-1 py-0.5 text-xs">
                    <FolderKanban className="w-3 h-3" />
                    {t.name}
                    {canEdit && (
                      <button onClick={() => handleRemoveTeam(t.id)} className="text-purple-300 hover:text-red-500 ml-0.5" disabled={isPending}>
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {currentTeams.length === 0 && (
            <p className="text-xs text-gray-400">未所属</p>
          )}
        </CardContent>
      </Card>

      {/* 所属追加ダイアログ */}
      <Dialog open={addTeamDialogOpen} onOpenChange={setAddTeamDialogOpen}>
        <DialogContent className="max-w-sm max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">所属を追加</DialogTitle>
          </DialogHeader>
          {/* チーム・部署 */}
          {(['project', 'department'] as const).map(type => {
            const typeTeams = availableTeams.filter(t => t.type === type)
            if (typeTeams.length === 0) return null
            const label = type === 'project' ? 'チーム' : '部署'
            const Icon = type === 'project' ? FolderKanban : Building2
            const colors = type === 'project' ? 'hover:bg-purple-50' : 'hover:bg-teal-50'
            return (
              <div key={type}>
                <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Icon className="w-3 h-3" />{label}
                </p>
                <div className="space-y-0.5">
                  {typeTeams.map(t => (
                    <button key={t.id} onClick={() => handleAddTeam(t.id)} disabled={isPending}
                      className={`w-full text-left px-3 py-1.5 rounded text-sm text-gray-700 ${colors} transition-colors`}
                    >{t.name}</button>
                  ))}
                </div>
              </div>
            )
          })}
          {/* 店舗（都道府県折りたたみ） */}
          {(() => {
            const storeTeamsAvail = availableTeams.filter(t => t.type === 'store')
            if (storeTeamsAvail.length === 0) return null
            const PREF_ORDER = ['秋田県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','静岡県','茨城県']
            const grouped: Record<string, typeof storeTeamsAvail> = {}
            const noPref: typeof storeTeamsAvail = []
            for (const t of storeTeamsAvail) {
              if (t.prefecture) {
                if (!grouped[t.prefecture]) grouped[t.prefecture] = []
                grouped[t.prefecture].push(t)
              } else { noPref.push(t) }
            }
            const order = PREF_ORDER.filter(p => grouped[p])
            for (const p of Object.keys(grouped)) { if (!order.includes(p)) order.push(p) }
            return (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Store className="w-3 h-3" />店舗
                </p>
                {order.map(pref => {
                  const stores = grouped[pref]
                  const isExp = expandedAddPrefs.has(pref)
                  return (
                    <div key={pref}>
                      <button
                        type="button"
                        onClick={() => setExpandedAddPrefs(prev => { const n = new Set(prev); n.has(pref) ? n.delete(pref) : n.add(pref); return n })}
                        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded"
                      >
                        {isExp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <MapPin className="w-3 h-3 text-gray-400" />
                        <span className="font-medium">{pref}</span>
                        <span className="text-gray-400 ml-auto">{stores.length}</span>
                      </button>
                      {isExp && stores.map(t => (
                        <button key={t.id} onClick={() => handleAddTeam(t.id)} disabled={isPending}
                          className="w-full text-left pl-8 pr-3 py-1.5 rounded text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                        >{t.name}</button>
                      ))}
                    </div>
                  )
                })}
                {noPref.map(t => (
                  <button key={t.id} onClick={() => handleAddTeam(t.id)} disabled={isPending}
                    className="w-full text-left px-3 py-1.5 rounded text-sm text-gray-700 hover:bg-blue-50 transition-colors"
                  >{t.name}</button>
                ))}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

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
                      {/* 記録者・記録日時 */}
                      <p className="text-[10px] text-gray-300 mt-1">
                        {record.created_by && employeeMap[record.created_by]
                          ? `${employeeMap[record.created_by].name} が記録`
                          : '記録'}
                        {' · '}
                        {new Date(record.created_at).toLocaleDateString('ja-JP')}
                      </p>
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
            {formType === '配属・異動' && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">配属先・異動先</p>
                <Input placeholder="例: 渋谷本店" value={formDept} onChange={e => setFormDept(e.target.value)} className="text-sm" />
              </div>
            )}
            {formType === '役職' && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">役職名</p>
                <Input placeholder="例: 店長、副店長、トレーナー" value={formDept} onChange={e => setFormDept(e.target.value)} className="text-sm" />
              </div>
            )}
            {formType === '資格' && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">資格名</p>
                <Select value={formDept} onValueChange={setFormDept}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="選択または下部に入力" /></SelectTrigger>
                  <SelectContent>
                    {certifications.map(c => (
                      <SelectItem key={c.id} value={`[社内]${c.name}`}>{c.name}（社内資格）</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input placeholder="社外資格の場合はここに入力" value={formDept.startsWith('[社内]') ? '' : formDept} onChange={e => setFormDept(e.target.value)} className="text-sm mt-1.5" />
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
