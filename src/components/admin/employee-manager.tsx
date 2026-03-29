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
import { setViewAs } from '@/app/(dashboard)/actions'
import { Store, FolderKanban } from 'lucide-react'
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
  employeeStats?: Record<string, { certifiedPct: number; standardPct: number }>
  teams?: Team[]
  teamMembers?: TeamMember[]
}

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
  '店長':       1.5,
  'マネジャー': 2,
  '運用管理者': 3,
  '役員':       3.5,
  '開発者':     4,
}

export function EmployeeManager({ employees: initialEmployees, canEdit = true, employeeStats = {}, teams = [], teamMembers = [] }: Props) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [isPending, startTransition] = useTransition()
  const [uploadingId, setUploadingId] = useState<string | null>(null)

  // 店舗マッピング
  const storeTeams = teams.filter(t => t.type === 'store')
  const storeTeamById = Object.fromEntries(storeTeams.map(t => [t.id, t.name]))
  const storeByEmployee: Record<string, string> = {}
  for (const m of teamMembers) {
    if (storeTeamById[m.team_id]) storeByEmployee[m.employee_id] = storeTeamById[m.team_id]
  }
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const supabase = createClient()

  const memberIdSet = selectedTeamId
    ? new Set(teamMembers.filter(tm => tm.team_id === selectedTeamId).map(tm => tm.employee_id))
    : null

  const handleDisplayRoleChange = (employeeId: string, displayRole: DisplayRole) => {
    if (!canEdit) return
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

  const handleAvatarUpload = async (employeeId: string, file: File) => {
    if (!canEdit) return
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

      const { error: updateError } = await supabase
        .from('employees')
        .update({ avatar_url: publicUrl })
        .eq('id', employeeId)

      if (updateError) {
        toast.error('更新に失敗しました')
        return
      }

      setEmployees(prev =>
        prev.map(e => e.id === employeeId ? { ...e, avatar_url: publicUrl } : e)
      )
      toast.success('写真を更新しました')
    } finally {
      setUploadingId(null)
    }
  }

  const sortedEmployees = [...employees].sort((a, b) =>
    DISPLAY_ROLE_ORDER[getDisplayRole(a)] - DISPLAY_ROLE_ORDER[getDisplayRole(b)]
  )
  const filteredEmployees = memberIdSet
    ? sortedEmployees.filter(emp => memberIdSet.has(emp.id))
    : sortedEmployees

  return (
    <div className="p-4 space-y-3">
      {/* チームフィルタ */}
      {teams.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSelectedTeamId(null)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedTeamId === null
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            すべて
          </button>
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(prev => prev === team.id ? null : team.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedTeamId === team.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {team.type === 'store'
                ? <Store className="w-3 h-3" />
                : <FolderKanban className="w-3 h-3" />
              }
              {team.name}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {filteredEmployees.length}名{selectedTeamId ? ` / 全${employees.length}名` : ''}
      </p>
      {filteredEmployees.map(employee => {
        const displayRole = getDisplayRole(employee)
        return (
          <Card key={employee.id} className={CARD_BG_COLORS[displayRole]}>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">


                {/* アバター（canEdit時のみクリックで写真アップロード） */}
                {canEdit ? (
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
                    <Link href={`/admin/employees/${employee.id}`} className="text-sm font-medium text-gray-800 hover:text-orange-600 hover:underline transition-colors">
                      {employee.name}
                    </Link>
                    <Badge className={`${DISPLAY_ROLE_COLORS[displayRole]} text-xs border-0 flex items-center gap-1 flex-shrink-0`}>
                      {DISPLAY_ROLE_ICONS[displayRole]}
                      {displayRole}
                    </Badge>
                  </div>
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

                {canEdit && (
                  <div className="flex items-center gap-1">
                    <form action={setViewAs.bind(null, employee.id)}>
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        title="この社員として表示"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </form>
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
                            メンバーカルテ
                          </Link>
                        </DropdownMenuItem>
                        {ALL_DISPLAY_ROLES
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
                  </div>
                )}

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
