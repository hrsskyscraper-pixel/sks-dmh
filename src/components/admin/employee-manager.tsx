'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Shield, User, Crown, Eye, Camera, Loader2, FileText } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { Store, FolderKanban, Building2, ChevronDown, ChevronRight, MapPin, Award, Star, Instagram, MessageCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Employee, Role, EmploymentType, Team, TeamMember } from '@/types/database'

// UI上の表示役割
type DisplayRole = '開発者' | '役員' | '運用管理者' | 'マネジャー' | '店長' | '社員' | 'メイト'

function getDisplayRole(employee: Employee): DisplayRole {
  if (employee.role === 'admin') return '開発者'
  if (employee.role === 'executive') return '役員'
  if (employee.role === 'ops_manager') return '運用管理者'
  if (employee.role === 'manager') return 'マネジャー'
  if (employee.role === 'store_manager') return '店長'
  if (employee.employment_type === 'メイト') return 'メイト'
  return '社員'
}

// 入社年度（4月始まり会計年度ベース）から「入社X年目」を計算
function getHireYearLabel(hireDate: string | null): string {
  if (!hireDate) return '入社1年目'
  const hire = new Date(hireDate)
  const today = new Date()
  const hireFY = hire.getMonth() >= 3 ? hire.getFullYear() : hire.getFullYear() - 1
  const todayFY = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  const year = Math.max(1, todayFY - hireFY + 1)
  return `入社${year}年目`
}

interface Props {
  employees: Employee[]
  canEdit?: boolean
  isTeamManager?: boolean
  managedMemberIds?: string[]
  employeeStats?: Record<string, { certifiedPct: number; standardPct: number }>
  teams?: Team[]
  teamMembers?: TeamMember[]
  positionByEmployee?: Record<string, string>
  certsByEmployee?: Record<string, string[]>
  certMaster?: { name: string; icon: string; color: string }[]
  teamManagersList?: { team_id: string; employee_id: string; role: string }[]
  projectTeamIds?: string[]
  currentEmployeeId?: string
}

const TEAM_MANAGER_ROLES: DisplayRole[] = ['メイト', '社員']

const DISPLAY_ROLE_COLORS: Record<DisplayRole, string> = {
  '開発者':     'bg-purple-100 text-purple-700',
  '役員':       'bg-rose-100 text-rose-700',
  '運用管理者': 'bg-indigo-100 text-indigo-700',
  'マネジャー': 'bg-blue-100 text-blue-700',
  '店長':       'bg-teal-100 text-teal-700',
  '社員':       'bg-gray-100 text-gray-700',
  'メイト':     'bg-violet-100 text-violet-700',
}

const DISPLAY_ROLE_ICONS: Record<DisplayRole, React.ReactNode> = {
  '開発者':     <Crown className="w-3 h-3" />,
  '役員':       <Crown className="w-3 h-3" />,
  '運用管理者': <Shield className="w-3 h-3" />,
  'マネジャー': <Shield className="w-3 h-3" />,
  '店長':       <Shield className="w-3 h-3" />,
  '社員':       <User className="w-3 h-3" />,
  'メイト':     <User className="w-3 h-3" />,
}

const CARD_BG_COLORS: Record<DisplayRole, string> = {
  '開発者':     'bg-gray-200 border-gray-300',
  '役員':       'bg-rose-50 border-rose-200',
  '運用管理者': 'bg-indigo-50 border-indigo-200',
  'マネジャー': 'bg-blue-50 border-blue-200',
  '店長':       'bg-teal-50 border-teal-200',
  '社員':       'bg-green-50 border-green-200',
  'メイト':     'bg-pink-50 border-pink-200',
}

const ALL_DISPLAY_ROLES: DisplayRole[] = ['社員', 'メイト', '店長', 'マネジャー', '運用管理者', '役員', '開発者']

const DISPLAY_ROLE_ORDER: Record<DisplayRole, number> = {
  '社員':       0,
  'メイト':     1,
  '店長':       2,
  'マネジャー': 3,
  '運用管理者': 4,
  '役員':       5,
  '開発者':     6,
}

export function EmployeeManager({ employees: initialEmployees, canEdit = true, isTeamManager = false, managedMemberIds = [], employeeStats = {}, teams = [], teamMembers = [], positionByEmployee = {}, certsByEmployee = {}, certMaster = [], teamManagersList = [], projectTeamIds = [], currentEmployeeId }: Props) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [isPending, startTransition] = useTransition()
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')
  const managedSet = new Set(managedMemberIds)

  // 店舗マッピング
  const storeTeams = teams.filter(t => t.type === 'store')
  const storeTeamById = Object.fromEntries(storeTeams.map(t => [t.id, t.name]))
  const storeByEmployee: Record<string, string> = {}
  for (const m of teamMembers) {
    if (storeTeamById[m.team_id]) storeByEmployee[m.employee_id] = storeTeamById[m.team_id]
  }
  const departmentTeams = teams.filter(t => t.type === 'department')
  const projectTeams = teams.filter(t => t.type === 'project')
  const PREF_ORDER = ['秋田県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','静岡県','茨城県']
  const storePrefGrouped: Record<string, typeof storeTeams> = {}
  const storeNoPref: typeof storeTeams = []
  for (const t of storeTeams) {
    const p = (t as { prefecture?: string | null }).prefecture
    if (p) {
      if (!storePrefGrouped[p]) storePrefGrouped[p] = []
      storePrefGrouped[p].push(t)
    } else {
      storeNoPref.push(t)
    }
  }
  const prefOrder = PREF_ORDER.filter(p => storePrefGrouped[p])
  for (const p of Object.keys(storePrefGrouped)) { if (!prefOrder.includes(p)) prefOrder.push(p) }

  // デフォルト選択: 自分が所属するチームのうちプロジェクト紐づきを優先
  const projectTeamIdSet = new Set(projectTeamIds)
  const defaultTeamId = (() => {
    if (!currentEmployeeId) return null
    const myTeamIdsAll = [
      ...teamMembers.filter(m => m.employee_id === currentEmployeeId).map(m => m.team_id),
      ...teamManagersList.filter(m => m.employee_id === currentEmployeeId).map(m => m.team_id),
    ]
    const myTeamIdsUnique = [...new Set(myTeamIdsAll)]
    // プロジェクト紐づき優先、種別優先順: project > department > store
    const typeOrder: Record<string, number> = { project: 0, department: 1, store: 2 }
    const teamById = Object.fromEntries(teams.map(t => [t.id, t]))
    const sorted = myTeamIdsUnique
      .filter(id => teamById[id])
      .sort((a, b) => {
        const aPj = projectTeamIdSet.has(a) ? 0 : 1
        const bPj = projectTeamIdSet.has(b) ? 0 : 1
        if (aPj !== bPj) return aPj - bPj
        return (typeOrder[teamById[a].type] ?? 9) - (typeOrder[teamById[b].type] ?? 9)
      })
    return sorted[0] ?? null
  })()

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(defaultTeamId)
  const [expandedPrefs, setExpandedPrefs] = useState<Set<string>>(new Set())
  const [showStores, setShowStores] = useState(false)
  const supabase = createClient()

  // リーダーもメンバーとして表示するために統合
  const memberIdSet = selectedTeamId
    ? new Set([
        ...teamMembers.filter(tm => tm.team_id === selectedTeamId).map(tm => tm.employee_id),
        ...teamManagersList.filter(tm => tm.team_id === selectedTeamId).map(tm => tm.employee_id),
      ])
    : null

  // リーダー情報マップ（employee_id → role）
  const leaderRoleMap: Record<string, string> = {}
  if (selectedTeamId) {
    for (const m of teamManagersList.filter(tm => tm.team_id === selectedTeamId)) {
      leaderRoleMap[m.employee_id] = m.role
    }
  }

  const handleDisplayRoleChange = (employeeId: string, displayRole: DisplayRole) => {
    if (!canEdit && !(isTeamManager && managedSet.has(employeeId))) return
    let role: Role
    let employment_type: EmploymentType

    if (displayRole === '開発者')           { role = 'admin';        employment_type = '社員' }
    else if (displayRole === '役員')       { role = 'executive';   employment_type = '社員' }
    else if (displayRole === '運用管理者') { role = 'ops_manager';  employment_type = '社員' }
    else if (displayRole === 'マネジャー') { role = 'manager';     employment_type = '社員' }
    else if (displayRole === '店長')       { role = 'store_manager'; employment_type = '社員' }
    else if (displayRole === 'メイト')     { role = 'employee';     employment_type = 'メイト' }
    else                                  { role = 'employee';     employment_type = '社員' }

    startTransition(async () => {
      const { error } = await supabase
        .from('employees')
        .update({ role, employment_type })
        .eq('id', employeeId)

      if (error) {
        toast.error('更新に失敗しました')
        return
      }

      setEmployees(prev =>
        prev.map(e => e.id === employeeId ? { ...e, role, employment_type } : e)
      )
      toast.success(`${displayRole}に変更しました`)
    })
  }

  const handleNameSave = (employeeId: string) => {
    const trimmed = editingNameValue.trim()
    if (!trimmed) { setEditingNameId(null); return }
    const original = employees.find(e => e.id === employeeId)?.name
    if (trimmed === original) { setEditingNameId(null); return }
    startTransition(async () => {
      const { error } = await supabase.from('employees').update({ name: trimmed }).eq('id', employeeId)
      if (error) { toast.error('名前の更新に失敗しました'); return }
      setEmployees(prev => prev.map(e => e.id === employeeId ? { ...e, name: trimmed } : e))
      setEditingNameId(null)
      toast.success('名前を更新しました')
    })
  }

  const handleAvatarUpload = async (employeeId: string, file: File) => {
    if (!canEdit && !(isTeamManager && managedSet.has(employeeId))) return
    setUploadingId(employeeId)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${employeeId}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) {
        toast.error('アップロードに失敗しました')
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path)

      const urlWithCacheBust = `${publicUrl}?t=${Date.now()}`
      const { error: updateError } = await supabase
        .from('employees')
        .update({ avatar_url: urlWithCacheBust })
        .eq('id', employeeId)

      if (updateError) {
        toast.error('更新に失敗しました')
        return
      }

      setEmployees(prev =>
        prev.map(e => e.id === employeeId ? { ...e, avatar_url: urlWithCacheBust } : e)
      )
      toast.success('写真を更新しました')
    } finally {
      setUploadingId(null)
    }
  }

  const sortedEmployees = [...employees].sort((a, b) => {
    // 自分を最上位
    if (currentEmployeeId) {
      if (a.id === currentEmployeeId && b.id !== currentEmployeeId) return -1
      if (b.id === currentEmployeeId && a.id !== currentEmployeeId) return 1
    }
    return DISPLAY_ROLE_ORDER[getDisplayRole(a)] - DISPLAY_ROLE_ORDER[getDisplayRole(b)]
  })
  const filteredEmployees = memberIdSet
    ? sortedEmployees.filter(emp => memberIdSet.has(emp.id))
    : sortedEmployees

  return (
    <div className="p-4 space-y-3">
      {/* チームフィルタ */}
      {teams.length > 0 && (
        <div className="space-y-2">
          {/* すべて + チーム + 部署 */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => { setSelectedTeamId(null); setShowStores(false) }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedTeamId === null
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              すべて
            </button>
            {projectTeams.map(team => (
              <button
                key={team.id}
                onClick={() => { setSelectedTeamId(prev => prev === team.id ? null : team.id); setShowStores(false) }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedTeamId === team.id
                    ? 'bg-purple-500 text-white'
                    : 'bg-purple-50 text-purple-700 hover:bg-purple-100'
                }`}
              >
                <FolderKanban className="w-3 h-3" />
                {team.name}
              </button>
            ))}
            {departmentTeams.map(team => (
              <button
                key={team.id}
                onClick={() => { setSelectedTeamId(prev => prev === team.id ? null : team.id); setShowStores(false) }}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedTeamId === team.id
                    ? 'bg-teal-500 text-white'
                    : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                }`}
              >
                <Building2 className="w-3 h-3" />
                {team.name}
              </button>
            ))}
          </div>

          {/* 店舗（折りたたみ） */}
          {storeTeams.length > 0 && (
            <div>
              <button
                onClick={() => setShowStores(prev => !prev)}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
              >
                {showStores ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <Store className="w-3.5 h-3.5" />
                店舗で絞り込み
                <span className="text-blue-400">({storeTeams.length})</span>
              </button>
              {showStores && (
                <div className="mt-1.5 ml-1 space-y-1">
                  {prefOrder.map(pref => {
                    const stores = storePrefGrouped[pref]
                    const isPrefExpanded = expandedPrefs.has(pref)
                    return (
                      <div key={pref}>
                        <button
                          onClick={() => setExpandedPrefs(prev => {
                            const next = new Set(prev)
                            next.has(pref) ? next.delete(pref) : next.add(pref)
                            return next
                          })}
                          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800"
                        >
                          {isPrefExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <span className="font-medium">{pref}</span>
                          <span className="text-gray-400">{stores.length}</span>
                        </button>
                        {isPrefExpanded && (
                          <div className="flex flex-wrap gap-1 mt-1 ml-5">
                            {stores.map(team => (
                              <button
                                key={team.id}
                                onClick={() => setSelectedTeamId(prev => prev === team.id ? null : team.id)}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                                  selectedTeamId === team.id
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                }`}
                              >
                                {team.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {storeNoPref.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 ml-5">
                      {storeNoPref.map(team => (
                        <button
                          key={team.id}
                          onClick={() => setSelectedTeamId(prev => prev === team.id ? null : team.id)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors ${
                            selectedTeamId === team.id
                              ? 'bg-blue-500 text-white'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          {team.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {filteredEmployees.length}名{selectedTeamId ? ` / 全${employees.length}名` : ''}
      </p>
      {filteredEmployees.map(employee => {
        const displayRole = getDisplayRole(employee)
        const canEditThis = canEdit || (isTeamManager && managedSet.has(employee.id))
        const availableRoles = canEdit ? ALL_DISPLAY_ROLES : TEAM_MANAGER_ROLES
        return (
          <Card key={employee.id} className={CARD_BG_COLORS[displayRole]}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">


                {/* アバター（編集可能時のみクリックで写真アップロード） */}
                {canEditThis ? (
                  <>
                    <label
                      htmlFor={`avatar-${employee.id}`}
                      className="relative cursor-pointer group flex-shrink-0"
                      title="写真を変更"
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={employee.avatar_url ?? undefined} />
                        <AvatarFallback className="text-sm bg-orange-200 text-orange-700">
                          {employee.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {uploadingId === employee.id
                          ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                          : <Camera className="w-3.5 h-3.5 text-white" />
                        }
                      </div>
                    </label>
                    <input
                      id={`avatar-${employee.id}`}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleAvatarUpload(employee.id, file)
                        e.target.value = ''
                      }}
                    />
                  </>
                ) : (
                  <Avatar className="w-10 h-10 flex-shrink-0">
                    <AvatarImage src={employee.avatar_url ?? undefined} />
                    <AvatarFallback className="text-sm bg-orange-200 text-orange-700">
                      {employee.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                )}

                <div className="flex-1 min-w-0">
                  {/* 名前 + 役割バッジ */}
                  <div className="flex items-center gap-1.5 mb-1">
                    {editingNameId === employee.id ? (
                      <input
                        className="text-sm font-medium text-gray-800 border-b-2 border-orange-400 outline-none bg-transparent min-w-0"
                        value={editingNameValue}
                        onChange={e => setEditingNameValue(e.target.value)}
                        onBlur={() => handleNameSave(employee.id)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleNameSave(employee.id); if (e.key === 'Escape') setEditingNameId(null) }}
                        autoFocus
                        disabled={isPending}
                      />
                    ) : (
                      <Link href={`/admin/employees/${employee.id}`} className="text-sm font-medium text-gray-800 hover:text-orange-600 hover:underline transition-colors">
                        {employee.name}
                      </Link>
                    )}
                    {employee.instagram_url && (
                      <a href={employee.instagram_url.startsWith('http') ? employee.instagram_url : `https://instagram.com/${employee.instagram_url.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-pink-500 transition-colors" onClick={e => e.stopPropagation()}>
                        <Instagram className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {employee.line_url && (
                      <a href={employee.line_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-green-500 transition-colors" onClick={e => e.stopPropagation()}>
                        <MessageCircle className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {employee.line_user_id && (
                      <span title="LINE連携済み" className="text-green-500"><MessageCircle className="w-3 h-3 fill-current" /></span>
                    )}
                    <Badge className={`${DISPLAY_ROLE_COLORS[displayRole]} text-xs border-0 flex items-center gap-1 flex-shrink-0`}>
                      {DISPLAY_ROLE_ICONS[displayRole]}
                      {displayRole}
                    </Badge>
                    {leaderRoleMap[employee.id] && (
                      <Badge className={`text-[9px] border-0 flex-shrink-0 ${leaderRoleMap[employee.id] === 'primary' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {leaderRoleMap[employee.id] === 'primary' ? 'リーダー(主)' : 'リーダー(副)'}
                      </Badge>
                    )}
                    {positionByEmployee[employee.id] && (
                      <Badge className="text-[9px] bg-sky-100 text-sky-700 border-0 flex-shrink-0">{positionByEmployee[employee.id]}</Badge>
                    )}
                  </div>
                  {/* 社内資格 */}
                  {certsByEmployee[employee.id]?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {certsByEmployee[employee.id].map(certName => {
                        const master = certMaster.find(c => c.name === certName)
                        const colorMap: Record<string, { bg: string; text: string }> = {
                          emerald: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
                          gold: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
                          blue: { bg: 'bg-blue-100', text: 'text-blue-700' },
                          purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
                          red: { bg: 'bg-red-100', text: 'text-red-700' },
                          orange: { bg: 'bg-orange-100', text: 'text-orange-700' },
                          pink: { bg: 'bg-pink-100', text: 'text-pink-700' },
                          gray: { bg: 'bg-gray-100', text: 'text-gray-700' },
                        }
                        const c = colorMap[master?.color ?? 'emerald'] ?? colorMap.emerald
                        const IconComp = master?.icon === 'star' ? Star : Award
                        return (
                          <Badge key={certName} className={`text-[9px] ${c.bg} ${c.text} border-0 flex items-center gap-0.5`}>
                            <IconComp className="w-2.5 h-2.5" />
                            {certName}
                          </Badge>
                        )
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs text-muted-foreground truncate">{employee.email}</p>
                    {storeByEmployee[employee.id] && (
                      <Badge className="text-[9px] bg-blue-50 text-blue-600 border-0 flex-shrink-0">{storeByEmployee[employee.id]}</Badge>
                    )}
                  </div>
                  {/* 入社日 + 入社X年目バッジ */}
                  {employee.hire_date && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-muted-foreground">
                        {new Date(employee.hire_date).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit' })}
                        {' '}入社
                      </p>
                      <Badge className="bg-orange-100 text-orange-700 text-xs border-0 flex-shrink-0">
                        {getHireYearLabel(employee.hire_date).replace('入社', '')}
                      </Badge>
                      {getHireYearLabel(employee.hire_date) === '入社1年目' && (
                        <span className="text-sm leading-none" title="入社1年目">🔰</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      title="この社員として表示"
                      onClick={() => {
                        document.cookie = `${VIEW_AS_COOKIE}=${employee.id}; path=/`
                        window.location.href = '/'
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    {canEditThis && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={isPending}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/employees/${employee.id}`} className="flex items-center gap-2 text-sm">
                            <FileText className="w-3.5 h-3.5" />
                            メンバーキャリア
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => { setEditingNameId(employee.id); setEditingNameValue(employee.name) }}
                          className="text-sm"
                        >
                          名前を編集
                        </DropdownMenuItem>
                        {availableRoles
                          .filter(r => r !== displayRole)
                          .map(r => (
                            <DropdownMenuItem
                              key={r}
                              onClick={() => handleDisplayRoleChange(employee.id, r)}
                              className="text-sm"
                            >
                              {r}に変更
                            </DropdownMenuItem>
                          ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    )}
                </div>

              </div>

              {/* 総合スコアバー（社員・メイトのみ） */}
              {['社員', 'メイト'].includes(displayRole) && employeeStats[employee.id] && (() => {
                const stats = employeeStats[employee.id]
                const actual = Math.min(100, stats.certifiedPct)
                const standard = Math.min(100, stats.standardPct)
                const gap = actual - standard
                const gapStart = Math.min(actual, standard)
                const gapWidth = Math.abs(gap)
                return (
                  <div className="mt-2 pt-2 border-t border-black/5">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span className="text-orange-500 font-semibold">実績 {actual}%</span>
                      <span className={cn(
                        'font-semibold',
                        gap > 0 ? 'text-green-600' : gap < 0 ? 'text-yellow-600' : 'text-blue-500'
                      )}>
                        標準 {standard}%{gap !== 0 && standard > 0 && (
                          <span className="ml-1">{gap > 0 ? `▲+${gap}` : `▼${gap}`}</span>
                        )}
                      </span>
                    </div>
                    <div className="relative h-2 bg-gray-200 rounded-full">
                      {/* 実績バー */}
                      <div
                        className="absolute top-0 left-0 h-full bg-orange-400 rounded-full"
                        style={{ width: `${actual}%` }}
                      />
                      {/* GAP ハイライト */}
                      {gapWidth > 0 && standard > 0 && (
                        <div
                          className="absolute top-0 h-full rounded-sm"
                          style={{
                            left: `${gapStart}%`,
                            width: `${gapWidth}%`,
                            background: gap < 0 ? 'rgba(251,191,36,0.25)' : 'rgba(52,211,153,0.25)',
                          }}
                        />
                      )}
                      {/* 標準マーカー */}
                      {standard > 0 && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-blue-400 rounded-sm z-10"
                          style={{ left: `calc(${standard}% - 1px)` }}
                        />
                      )}
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
