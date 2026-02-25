'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, UserPlus, UserMinus, ClipboardList, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import type { Employee, Team, TeamMember, TeamChangeRequest, Role } from '@/types/database'

interface Props {
  currentEmployee: Employee
  /** view-as 中はその社員、それ以外は currentEmployee と同じ */
  effectiveEmployee: Employee
  /** view-as 中は実際のログインユーザーと異なる場合がある */
  effectiveRole: Role
  teams: Team[]
  teamMembers: TeamMember[]
  teamManagers: TeamMember[]
  employees: Employee[]
  changeRequests: TeamChangeRequest[]
}

type RequestType = TeamChangeRequest['request_type']

const TEAM_TYPE_LABELS: Record<Team['type'], string> = {
  store: '店舗',
  project: 'プロジェクト',
}

const TEAM_TYPE_COLORS: Record<Team['type'], string> = {
  store: 'bg-blue-100 text-blue-700',
  project: 'bg-purple-100 text-purple-700',
}

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  create_team: 'チーム作成',
  add_member: 'メンバー追加',
  remove_member: 'メンバー削除',
  add_manager: 'マネージャー追加',
  remove_manager: 'マネージャー削除',
}

const STATUS_COLORS: Record<TeamChangeRequest['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<TeamChangeRequest['status'], string> = {
  pending: '審査中',
  approved: '承認済み',
  rejected: '差し戻し',
}

function canDirectEdit(role: Role) {
  return role === 'admin' || role === 'ops_manager'
}

export function TeamManager({
  currentEmployee,
  effectiveEmployee,
  effectiveRole,
  teams: initialTeams,
  teamMembers: initialTeamMembers,
  teamManagers: initialTeamManagers,
  employees,
  changeRequests: initialChangeRequests,
}: Props) {
  const [teams, setTeams] = useState(initialTeams)
  const [teamMembers, setTeamMembers] = useState(initialTeamMembers)
  const [teamManagers, setTeamManagers] = useState(initialTeamManagers)
  const [changeRequests, setChangeRequests] = useState(initialChangeRequests)
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()
  // effectiveRole で権限を判定（view-as 中はそちらを優先）
  const isDirectEdit = canDirectEdit(effectiveRole)
  const isReadOnly = !['manager', 'admin', 'ops_manager'].includes(effectiveRole)

  // ===== 汎用確認ダイアログ =====
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string
    message: string
    confirmLabel: string
    confirmClassName: string
    onConfirm: () => void
  } | null>(null)

  // ===== Create Team Dialog =====
  const [showCreateTeam, setShowCreateTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamType, setNewTeamType] = useState<Team['type'] | ''>('')
  const [newTeamManagerId, setNewTeamManagerId] = useState('')

  // ===== Add Member/Manager Dialog =====
  const [addDialog, setAddDialog] = useState<{
    type: 'member' | 'manager'
    teamId: string
  } | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')

  // ===== Request Dialog (manager only) =====
  const [requestDialog, setRequestDialog] = useState<{
    requestType: RequestType
    teamId: string | null
    payload: Record<string, unknown>
    label: string
  } | null>(null)
  const [requestComment, setRequestComment] = useState('')
  // create_team 申請時の担当マネージャー選択（デフォルト = effectiveEmployee）
  const [requestManagerId, setRequestManagerId] = useState(effectiveEmployee.id)

  // ===== Review Dialog (ops_manager / admin) =====
  const [reviewDialog, setReviewDialog] = useState<TeamChangeRequest | null>(null)
  const [reviewComment, setReviewComment] = useState('')

  // ===== Expanded teams =====
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  const pendingRequests = changeRequests.filter(r => r.status === 'pending')
  // マネージャー向け: 未読の審査結果件数
  const unreadResults = changeRequests.filter(
    r => r.requested_by === currentEmployee.id && r.status !== 'pending' && !r.applicant_read_at
  )

  // 申請タブを開いたとき、自分の未読結果を既読にする
  const handleRequestsTabOpen = () => {
    if (isDirectEdit) return // admin/ops_manager は申請者ではないのでスキップ
    const unreadIds = changeRequests
      .filter(r => r.requested_by === currentEmployee.id && r.status !== 'pending' && !r.applicant_read_at)
      .map(r => r.id)
    if (unreadIds.length === 0) return
    // 楽観的にローカル更新
    setChangeRequests(prev =>
      prev.map(r => unreadIds.includes(r.id) ? { ...r, applicant_read_at: new Date().toISOString() } : r)
    )
    supabase
      .from('team_change_requests')
      .update({ applicant_read_at: new Date().toISOString() })
      .in('id', unreadIds)
      .then(({ error }) => {
        if (error) console.error('既読更新に失敗:', error)
      })
  }

  // マネージャー候補（manager/admin/ops_manager）
  const managerCandidates = employees.filter(e =>
    ['manager', 'admin', 'ops_manager'].includes(e.role)
  )

  // -------------------------------------------------------
  // Direct edit actions (admin / ops_manager)
  // -------------------------------------------------------

  const handleCreateTeam = () => {
    if (!isDirectEdit) return
    if (!newTeamName.trim() || !newTeamType || !newTeamManagerId) return
    startTransition(async () => {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({ name: newTeamName.trim(), type: newTeamType })
        .select()
        .single()
      if (teamError) { toast.error('チームの作成に失敗しました'); return }

      const { error: managerError } = await supabase
        .from('team_managers')
        .insert({ team_id: team.id, employee_id: newTeamManagerId })
      if (managerError) { toast.error('マネージャー設定に失敗しました'); return }

      setTeams(prev => [...prev, team])
      setTeamManagers(prev => [...prev, { team_id: team.id, employee_id: newTeamManagerId }])
      setShowCreateTeam(false)
      setNewTeamName('')
      setNewTeamType('')
      setNewTeamManagerId('')
      toast.success(`チーム「${team.name}」を作成しました`)
    })
  }

  const handleDeleteTeam = (teamId: string) => {
    if (!isDirectEdit) return
    startTransition(async () => {
      const { error } = await supabase.from('teams').delete().eq('id', teamId)
      if (error) { toast.error('削除に失敗しました'); return }
      setTeams(prev => prev.filter(t => t.id !== teamId))
      setTeamMembers(prev => prev.filter(m => m.team_id !== teamId))
      setTeamManagers(prev => prev.filter(m => m.team_id !== teamId))
      toast.success('チームを削除しました')
    })
  }

  const handleAddMember = (teamId: string, employeeId: string) => {
    if (!isDirectEdit || !employeeId) return
    startTransition(async () => {
      const { error } = await supabase
        .from('team_members')
        .insert({ team_id: teamId, employee_id: employeeId })
      if (error) { toast.error('追加に失敗しました'); return }
      setTeamMembers(prev => [...prev, { team_id: teamId, employee_id: employeeId }])
      setAddDialog(null)
      setSelectedEmployeeId('')
      toast.success('メンバーを追加しました')
    })
  }

  const handleRemoveMember = (teamId: string, employeeId: string) => {
    if (!isDirectEdit) return
    startTransition(async () => {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('employee_id', employeeId)
      if (error) { toast.error('削除に失敗しました'); return }
      setTeamMembers(prev => prev.filter(m => !(m.team_id === teamId && m.employee_id === employeeId)))
      toast.success('メンバーを削除しました')
    })
  }

  const handleAddManager = (teamId: string, employeeId: string) => {
    if (!isDirectEdit || !employeeId) return
    startTransition(async () => {
      const { error } = await supabase
        .from('team_managers')
        .insert({ team_id: teamId, employee_id: employeeId })
      if (error) { toast.error('追加に失敗しました'); return }
      setTeamManagers(prev => [...prev, { team_id: teamId, employee_id: employeeId }])
      setAddDialog(null)
      setSelectedEmployeeId('')
      toast.success('マネージャーを追加しました')
    })
  }

  const handleRemoveManager = (teamId: string, employeeId: string) => {
    if (!isDirectEdit) return
    startTransition(async () => {
      const { error } = await supabase
        .from('team_managers')
        .delete()
        .eq('team_id', teamId)
        .eq('employee_id', employeeId)
      if (error) { toast.error('削除に失敗しました'); return }
      setTeamManagers(prev => prev.filter(m => !(m.team_id === teamId && m.employee_id === employeeId)))
      toast.success('マネージャーを削除しました')
    })
  }

  // -------------------------------------------------------
  // Request actions (manager) — manager 自身が担当マネージャーとして申請
  // -------------------------------------------------------

  const handleSubmitRequest = () => {
    if (!requestDialog || isReadOnly) return
    startTransition(async () => {
      const payload: Record<string, unknown> = { ...requestDialog.payload }
      if (requestDialog.requestType === 'create_team') {
        // フォームで選択した担当マネージャーを使用（デフォルト = effectiveEmployee）
        payload.manager_id = requestManagerId
        payload.manager_name = employees.find(e => e.id === requestManagerId)?.name ?? requestManagerId
      }
      if (requestComment.trim()) payload.comment = requestComment.trim()

      const { data, error } = await supabase
        .from('team_change_requests')
        .insert({
          requested_by: currentEmployee.id,
          request_type: requestDialog.requestType,
          team_id: requestDialog.teamId,
          payload: payload as import('@/types/database').Json,
        })
        .select()
        .single()
      if (error) { toast.error('申請に失敗しました'); return }
      setChangeRequests(prev => [data, ...prev])
      setRequestDialog(null)
      setRequestComment('')
      toast.success('申請しました')
    })
  }

  // -------------------------------------------------------
  // Review actions (admin / ops_manager)
  // -------------------------------------------------------

  const handleApprove = (req: TeamChangeRequest) => {
    if (!isDirectEdit) return
    startTransition(async () => {
      let applyError: unknown = null
      const payload = req.payload as Record<string, unknown>

      if (req.request_type === 'create_team') {
        const { data: newTeam, error } = await supabase
          .from('teams')
          .insert({ name: payload.name as string, type: payload.type as Team['type'] })
          .select()
          .single()
        if (error) { applyError = error }
        else {
          setTeams(prev => [...prev, newTeam])
          // 申請者（manager）を担当マネージャーとして自動設定
          const managerId = (payload.manager_id as string | undefined) ?? req.requested_by
          const { error: mgrError } = await supabase
            .from('team_managers')
            .insert({ team_id: newTeam.id, employee_id: managerId })
          if (mgrError) { applyError = mgrError }
          else {
            setTeamManagers(prev => [...prev, { team_id: newTeam.id, employee_id: managerId }])
          }
        }

      } else if (req.request_type === 'add_member' && req.team_id) {
        const { error } = await supabase
          .from('team_members')
          .insert({ team_id: req.team_id, employee_id: payload.employee_id as string })
        if (error) { applyError = error }
        else {
          setTeamMembers(prev => [...prev, { team_id: req.team_id!, employee_id: payload.employee_id as string }])
        }

      } else if (req.request_type === 'remove_member' && req.team_id) {
        const { error } = await supabase
          .from('team_members')
          .delete()
          .eq('team_id', req.team_id)
          .eq('employee_id', payload.employee_id as string)
        if (error) { applyError = error }
        else {
          setTeamMembers(prev => prev.filter(m => !(m.team_id === req.team_id && m.employee_id === payload.employee_id)))
        }

      } else if (req.request_type === 'add_manager' && req.team_id) {
        const { error } = await supabase
          .from('team_managers')
          .insert({ team_id: req.team_id, employee_id: payload.employee_id as string })
        if (error) { applyError = error }
        else {
          setTeamManagers(prev => [...prev, { team_id: req.team_id!, employee_id: payload.employee_id as string }])
        }

      } else if (req.request_type === 'remove_manager' && req.team_id) {
        const { error } = await supabase
          .from('team_managers')
          .delete()
          .eq('team_id', req.team_id)
          .eq('employee_id', payload.employee_id as string)
        if (error) { applyError = error }
        else {
          setTeamManagers(prev => prev.filter(m => !(m.team_id === req.team_id && m.employee_id === payload.employee_id)))
        }
      }

      if (applyError) { toast.error('変更の適用に失敗しました'); return }

      const { data: updated, error: updateError } = await supabase
        .from('team_change_requests')
        .update({
          status: 'approved',
          reviewed_by: currentEmployee.id,
          reviewed_at: new Date().toISOString(),
          review_comment: reviewComment.trim() || null,
        })
        .eq('id', req.id)
        .select()
        .single()
      if (updateError) { toast.error('ステータス更新に失敗しました'); return }
      setChangeRequests(prev => prev.map(r => r.id === req.id ? updated : r))
      setReviewDialog(null)
      setReviewComment('')
      toast.success('承認しました')
    })
  }

  const handleReject = (req: TeamChangeRequest) => {
    if (!isDirectEdit) return
    startTransition(async () => {
      const { data: updated, error } = await supabase
        .from('team_change_requests')
        .update({
          status: 'rejected',
          reviewed_by: currentEmployee.id,
          reviewed_at: new Date().toISOString(),
          review_comment: reviewComment.trim() || null,
        })
        .eq('id', req.id)
        .select()
        .single()
      if (error) { toast.error('差し戻しに失敗しました'); return }
      setChangeRequests(prev => prev.map(r => r.id === req.id ? updated : r))
      setReviewDialog(null)
      setReviewComment('')
      toast.success('差し戻ししました')
    })
  }

  // -------------------------------------------------------
  // Helpers
  // -------------------------------------------------------

  const getEmployeeName = (id: string) => employees.find(e => e.id === id)?.name ?? id

  const fmtDateTime = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  const handleReapply = (req: TeamChangeRequest) => {
    if (isReadOnly) return
    const p = req.payload as Record<string, unknown>
    let payload: Record<string, unknown> = {}
    let label = ''

    if (req.request_type === 'create_team') {
      payload = { name: p.name, type: p.type }
      label = '新しいチームの作成を申請'
      setRequestManagerId((p.manager_id as string | undefined) ?? effectiveEmployee.id)
    } else if (req.team_id) {
      const teamName = teams.find(t => t.id === req.team_id)?.name ?? ''
      if (req.request_type === 'add_member') {
        payload = { team_name: teamName }
        label = `「${teamName}」へのメンバー追加を申請`
      } else if (req.request_type === 'remove_member') {
        payload = { employee_id: p.employee_id, employee_name: p.employee_name, team_name: teamName }
        label = `「${teamName}」から${p.employee_name as string}を削除申請`
      } else if (req.request_type === 'add_manager') {
        payload = { team_name: teamName }
        label = `「${teamName}」へのマネージャー追加を申請`
      } else if (req.request_type === 'remove_manager') {
        payload = { employee_id: p.employee_id, employee_name: p.employee_name, team_name: teamName }
        label = `「${teamName}」から${p.employee_name as string}のマネージャー削除申請`
      }
    }

    setRequestDialog({ requestType: req.request_type, teamId: req.team_id, payload, label })
    setRequestComment('')
  }

  const getTeamMemberIds = (teamId: string) =>
    teamMembers.filter(m => m.team_id === teamId).map(m => m.employee_id)

  const getTeamManagerIds = (teamId: string) =>
    teamManagers.filter(m => m.team_id === teamId).map(m => m.employee_id)

  const toggleExpand = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  // -------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------

  const renderTeamList = () => (
    <div className="space-y-3">
      {isDirectEdit && (
        <Button
          size="sm"
          className="w-full bg-orange-500 hover:bg-orange-600 text-white h-9"
          onClick={() => setShowCreateTeam(true)}
          disabled={isPending}
        >
          <Plus className="w-4 h-4 mr-1" />
          新しいチームを作成
        </Button>
      )}

      {teams.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            チームがありません
          </CardContent>
        </Card>
      )}

      {teams.map(team => {
        const memberIds = getTeamMemberIds(team.id)
        const managerIds = getTeamManagerIds(team.id)
        const isExpanded = expandedTeams.has(team.id)
        const isManagedByMe = managerIds.includes(effectiveEmployee.id)

        return (
          <Card key={team.id} className={isManagedByMe ? 'border-orange-300 bg-orange-50' : ''}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Badge className={`${TEAM_TYPE_COLORS[team.type]} text-xs border-0 flex-shrink-0`}>
                    {TEAM_TYPE_LABELS[team.type]}
                  </Badge>
                  <CardTitle className="text-sm font-semibold text-gray-800 truncate">{team.name}</CardTitle>
                  {isManagedByMe && (
                    <Badge className="bg-orange-100 text-orange-700 text-[10px] border-0 flex-shrink-0">担当</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-gray-400"
                    onClick={() => toggleExpand(team.id)}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                  {isDirectEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setConfirmDialog({
                        title: '削除の確認',
                        message: `チーム「${team.name}」を削除しますか？\nメンバー・マネージャーの紐付けもすべて削除されます。`,
                        confirmLabel: '削除する',
                        confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white',
                        onConfirm: () => handleDeleteTeam(team.id),
                      })}
                      disabled={isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                メンバー {memberIds.length}名　担当マネージャー {managerIds.length}名
              </p>
            </CardHeader>

            {isExpanded && (
              <CardContent className="px-4 pb-3 space-y-3">
                {/* メンバー */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-600">メンバー</p>
                    {!isReadOnly && (
                      isDirectEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                          onClick={() => { setAddDialog({ type: 'member', teamId: team.id }); setSelectedEmployeeId('') }}
                          disabled={isPending}
                        >
                          <UserPlus className="w-3 h-3 mr-1" />追加
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                          onClick={() => {
                            setRequestDialog({
                              requestType: 'add_member',
                              teamId: team.id,
                              payload: { team_name: team.name },
                              label: `「${team.name}」へのメンバー追加を申請`,
                            })
                            setRequestComment('')
                          }}
                          disabled={isPending}
                        >
                          <ClipboardList className="w-3 h-3 mr-1" />申請
                        </Button>
                      )
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {memberIds.length === 0 && (
                      <p className="text-xs text-muted-foreground">メンバーなし</p>
                    )}
                    {memberIds.map(empId => (
                      <div key={empId} className="flex items-center gap-1 bg-gray-100 rounded-full px-2 py-0.5">
                        <span className="text-xs text-gray-700">{getEmployeeName(empId)}</span>
                        {isDirectEdit && (
                          <button
                            onClick={() => setConfirmDialog({
                              title: '削除の確認',
                              message: `「${team.name}」から${getEmployeeName(empId)}をメンバーから外しますか？`,
                              confirmLabel: '外す',
                              confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white',
                              onConfirm: () => handleRemoveMember(team.id, empId),
                            })}
                            disabled={isPending}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                        {!isDirectEdit && !isReadOnly && (
                          <button
                            onClick={() => {
                              setRequestDialog({
                                requestType: 'remove_member',
                                teamId: team.id,
                                payload: { employee_id: empId, employee_name: getEmployeeName(empId), team_name: team.name },
                                label: `「${team.name}」から${getEmployeeName(empId)}を削除申請`,
                              })
                              setRequestComment('')
                            }}
                            disabled={isPending}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                            title="削除申請"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 担当マネージャー */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-600">担当マネージャー</p>
                    {!isReadOnly && (
                      isDirectEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                          onClick={() => { setAddDialog({ type: 'manager', teamId: team.id }); setSelectedEmployeeId('') }}
                          disabled={isPending}
                        >
                          <UserPlus className="w-3 h-3 mr-1" />追加
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                          onClick={() => {
                            setRequestDialog({
                              requestType: 'add_manager',
                              teamId: team.id,
                              payload: { team_name: team.name },
                              label: `「${team.name}」へのマネージャー追加を申請`,
                            })
                            setRequestComment('')
                          }}
                          disabled={isPending}
                        >
                          <ClipboardList className="w-3 h-3 mr-1" />申請
                        </Button>
                      )
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {managerIds.length === 0 && (
                      <p className="text-xs text-muted-foreground">担当なし</p>
                    )}
                    {managerIds.map(empId => (
                      <div key={empId} className="flex items-center gap-1 bg-blue-100 rounded-full px-2 py-0.5">
                        <span className="text-xs text-blue-700">{getEmployeeName(empId)}</span>
                        {isDirectEdit && (
                          <button
                            onClick={() => setConfirmDialog({
                              title: '削除の確認',
                              message: `「${team.name}」の担当マネージャーから${getEmployeeName(empId)}を外しますか？`,
                              confirmLabel: '外す',
                              confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white',
                              onConfirm: () => handleRemoveManager(team.id, empId),
                            })}
                            disabled={isPending}
                            className="text-blue-400 hover:text-red-500 transition-colors"
                          >
                            <UserMinus className="w-3 h-3" />
                          </button>
                        )}
                        {!isDirectEdit && !isReadOnly && (
                          <button
                            onClick={() => {
                              setRequestDialog({
                                requestType: 'remove_manager',
                                teamId: team.id,
                                payload: { employee_id: empId, employee_name: getEmployeeName(empId), team_name: team.name },
                                label: `「${team.name}」から${getEmployeeName(empId)}のマネージャー削除申請`,
                              })
                              setRequestComment('')
                            }}
                            disabled={isPending}
                            className="text-blue-400 hover:text-red-500 transition-colors"
                            title="削除申請"
                          >
                            <UserMinus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* manager: チーム作成申請ボタン */}
      {!isDirectEdit && !isReadOnly && (
        <Button
          variant="outline"
          size="sm"
          className="w-full border-dashed h-9 text-xs text-gray-500"
          onClick={() => {
            setRequestDialog({
              requestType: 'create_team',
              teamId: null,
              payload: {},
              label: '新しいチームの作成を申請',
            })
            setRequestManagerId(effectiveEmployee.id)
            setRequestComment('')
          }}
          disabled={isPending}
        >
          <ClipboardList className="w-3.5 h-3.5 mr-1" />
          新しいチームの作成を申請
        </Button>
      )}
    </div>
  )

  // -------------------------------------------------------
  // 社員/メイト: チーム一覧のみ（タブなし）
  // -------------------------------------------------------
  if (isReadOnly) {
    return (
      <div className="p-4">
        {renderTeamList()}
      </div>
    )
  }

  // -------------------------------------------------------
  // manager / admin / ops_manager: タブあり
  // -------------------------------------------------------
  return (
    <div className="p-4 space-y-4">
      <Tabs defaultValue="teams" onValueChange={v => { if (v === 'requests') handleRequestsTabOpen() }}>
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="teams" className="text-xs">チーム一覧</TabsTrigger>
          <TabsTrigger value="requests" className="text-xs">
            申請
            {/* admin/ops_manager: 審査待ち件数 */}
            {isDirectEdit && pendingRequests.length > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-[10px] h-4 px-1 border-0">
                {pendingRequests.length}
              </Badge>
            )}
            {/* manager: 未読の審査結果件数 */}
            {!isDirectEdit && unreadResults.length > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-[10px] h-4 px-1 border-0">
                {unreadResults.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="teams" className="mt-3">
          {renderTeamList()}
        </TabsContent>

        {/* ===== 申請タブ ===== */}
        <TabsContent value="requests" className="mt-3 space-y-3">
          {isDirectEdit && pendingRequests.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800 font-medium">
              審査待ち {pendingRequests.length}件
            </div>
          )}

          {changeRequests.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                申請履歴がありません
              </CardContent>
            </Card>
          )}

          {changeRequests.map(req => {
            const isUnread = req.requested_by === currentEmployee.id && req.status !== 'pending' && !req.applicant_read_at
            return (
            <Card key={req.id} className={
              req.status === 'pending' ? 'border-amber-200 bg-amber-50' :
              isUnread ? 'border-red-300 bg-red-50' : ''
            }>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Badge className={`${STATUS_COLORS[req.status]} text-[10px] border-0`}>
                        {STATUS_LABELS[req.status]}
                      </Badge>
                      <Badge className="bg-gray-100 text-gray-600 text-[10px] border-0">
                        {REQUEST_TYPE_LABELS[req.request_type]}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-700">
                      申請者: {getEmployeeName(req.requested_by)}
                    </p>
                    {req.team_id && (
                      <p className="text-xs text-gray-500">
                        チーム: {teams.find(t => t.id === req.team_id)?.name ?? req.team_id}
                      </p>
                    )}
                    {(() => {
                      const p = req.payload as Record<string, unknown>
                      if (p.employee_id) {
                        return <p className="text-xs text-gray-500">対象: {getEmployeeName(p.employee_id as string)}</p>
                      }
                      if (p.name) {
                        return (
                          <p className="text-xs text-gray-500">
                            チーム名: {p.name as string}（{p.type === 'store' ? '店舗' : 'プロジェクト'}）
                            　担当: {p.manager_name as string}
                          </p>
                        )
                      }
                      return null
                    })()}
                    {(() => {
                      const p = req.payload as Record<string, unknown>
                      return p.comment ? (
                        <p className="text-xs text-gray-600 mt-1 bg-white rounded px-2 py-1 border border-amber-100">
                          💬 {p.comment as string}
                        </p>
                      ) : null
                    })()}
                    {(req.review_comment || req.reviewed_by) && req.status !== 'pending' && (
                      <p className="text-xs text-gray-600 mt-1 bg-white rounded px-2 py-1 border border-gray-100">
                        <span className="font-medium">
                          {req.reviewed_by ? getEmployeeName(req.reviewed_by) : '審査者'}：
                        </span>
                        {req.review_comment ?? (req.status === 'approved' ? '承認しました' : '差し戻ししました')}
                      </p>
                    )}
                    <div className="mt-1 space-y-0.5">
                      <p className="text-[10px] text-gray-400">
                        申請: {fmtDateTime(req.created_at)}
                      </p>
                      {req.reviewed_at && (
                        <p className="text-[10px] text-gray-400">
                          返答: {fmtDateTime(req.reviewed_at)}
                        </p>
                      )}
                    </div>
                    {/* 差し戻し → 再申請ボタン */}
                    {!isDirectEdit && req.status === 'rejected' && req.requested_by === currentEmployee.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2 h-7 text-xs border-orange-200 text-orange-600 hover:bg-orange-50 hover:border-orange-400"
                        onClick={() => handleReapply(req)}
                        disabled={isPending}
                      >
                        再申請する
                      </Button>
                    )}
                  </div>
                  {isDirectEdit && req.status === 'pending' && (
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white h-8 text-xs px-3 flex-shrink-0"
                      onClick={() => { setReviewDialog(req); setReviewComment('') }}
                      disabled={isPending}
                    >
                      確認
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            )
          })}
        </TabsContent>
      </Tabs>

      {/* ===== チーム作成ダイアログ (direct edit) ===== */}
      <Dialog open={showCreateTeam} onOpenChange={open => { if (!open) setShowCreateTeam(false) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">チームを作成</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">チーム名</p>
              <input
                type="text"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                placeholder="例: 渋谷店、新人研修プロジェクト"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">種別 <span className="text-red-500">*</span></p>
              <div className="flex gap-2">
                {(['store', 'project'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setNewTeamType(type)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      newTeamType === type
                        ? type === 'store'
                          ? 'bg-blue-100 text-blue-700 border-blue-300'
                          : 'bg-purple-100 text-purple-700 border-purple-300'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {TEAM_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">
                担当マネージャー <span className="text-red-500">*</span>
              </p>
              <select
                value={newTeamManagerId}
                onChange={e => setNewTeamManagerId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
              >
                <option value="">選択してください</option>
                {managerCandidates.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleCreateTeam}
              disabled={isPending || !newTeamName.trim() || !newTeamType || !newTeamManagerId}
            >
              <Plus className="w-4 h-4 mr-1" />
              作成する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== メンバー/マネージャー追加ダイアログ (direct edit) ===== */}
      <Dialog open={addDialog !== null} onOpenChange={open => { if (!open) setAddDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {addDialog?.type === 'member' ? 'メンバーを追加' : 'マネージャーを追加'}
            </DialogTitle>
          </DialogHeader>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">社員を選択</p>
            <select
              value={selectedEmployeeId}
              onChange={e => setSelectedEmployeeId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
            >
              <option value="">選択してください</option>
              {(addDialog?.type === 'manager' ? managerCandidates : employees)
                .filter(emp => {
                  if (!addDialog) return false
                  const existingIds = addDialog.type === 'member'
                    ? getTeamMemberIds(addDialog.teamId)
                    : getTeamManagerIds(addDialog.teamId)
                  return !existingIds.includes(emp.id)
                })
                .map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))
              }
            </select>
          </div>
          <DialogFooter>
            <Button
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              onClick={() => {
                if (!addDialog) return
                if (addDialog.type === 'member') {
                  handleAddMember(addDialog.teamId, selectedEmployeeId)
                } else {
                  handleAddManager(addDialog.teamId, selectedEmployeeId)
                }
              }}
              disabled={isPending || !selectedEmployeeId}
            >
              追加する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 申請ダイアログ (manager) ===== */}
      <Dialog open={requestDialog !== null} onOpenChange={open => { if (!open) setRequestDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">申請する</DialogTitle>
          </DialogHeader>
          {requestDialog && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-700">{requestDialog.label}</p>
                <Badge className="mt-1 bg-gray-100 text-gray-600 text-[10px] border-0">
                  {REQUEST_TYPE_LABELS[requestDialog.requestType]}
                </Badge>
              </div>
              {requestDialog.requestType === 'create_team' && (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">チーム名 <span className="text-red-500">*</span></p>
                    <input
                      type="text"
                      placeholder="例: 渋谷店"
                      value={(requestDialog?.payload as Record<string, unknown>)?.name as string ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
                      onChange={e => setRequestDialog(prev => prev ? {
                        ...prev,
                        payload: { ...prev.payload, name: e.target.value }
                      } : null)}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">種別</p>
                    <div className="flex gap-2">
                      {(['store', 'project'] as const).map(type => {
                        const p = requestDialog.payload as Record<string, unknown>
                        const selected = p.type === type
                        return (
                          <button
                            key={type}
                            onClick={() => setRequestDialog(prev => prev ? {
                              ...prev,
                              payload: { ...prev.payload, type }
                            } : null)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                              selected
                                ? type === 'store'
                                  ? 'bg-blue-100 text-blue-700 border-blue-300'
                                  : 'bg-purple-100 text-purple-700 border-purple-300'
                                : 'bg-gray-50 text-gray-500 border-gray-200'
                            }`}
                          >
                            {TEAM_TYPE_LABELS[type]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-1">担当マネージャー <span className="text-red-500">*</span></p>
                    <select
                      value={requestManagerId}
                      onChange={e => setRequestManagerId(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
                    >
                      {managerCandidates.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                    {requestManagerId !== effectiveEmployee.id && (
                      <p className="text-xs text-orange-600 mt-1">
                        ※ 申請者以外をマネージャーに設定しています。コメントで理由を説明してください。
                      </p>
                    )}
                  </div>
                </div>
              )}
              {(requestDialog.requestType === 'add_member' || requestDialog.requestType === 'add_manager') && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">社員を選択</p>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
                    onChange={e => setRequestDialog(prev => prev ? {
                      ...prev,
                      payload: { ...prev.payload, employee_id: e.target.value }
                    } : null)}
                  >
                    <option value="">選択してください</option>
                    {(requestDialog.requestType === 'add_manager' ? managerCandidates : employees).map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">コメント（任意）</p>
                <Textarea
                  placeholder="申請理由や補足をご記入ください"
                  value={requestComment}
                  onChange={e => setRequestComment(e.target.value)}
                  className="text-sm min-h-[60px] resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => {
                if (!requestDialog) return
                const p = requestDialog.payload as Record<string, unknown>
                let summary = requestDialog.label
                if (requestDialog.requestType === 'create_team') {
                  const type = p.type === 'store' ? '店舗' : 'プロジェクト'
                  const mgr = employees.find(e => e.id === requestManagerId)?.name ?? ''
                  summary = `チーム名: ${p.name as string}\n種別: ${type}\n担当マネージャー: ${mgr}`
                } else if (p.employee_id) {
                  summary = `${requestDialog.label}\n対象: ${getEmployeeName(p.employee_id as string)}`
                }
                if (requestComment.trim()) summary += `\nコメント: ${requestComment.trim()}`
                setRequestDialog(prev => prev)  // close request dialog after confirm
                setConfirmDialog({
                  title: '申請内容の確認',
                  message: summary,
                  confirmLabel: '申請する',
                  confirmClassName: 'flex-1 bg-orange-500 hover:bg-orange-600 text-white',
                  onConfirm: handleSubmitRequest,
                })
              }}
              disabled={isPending || (
                requestDialog?.requestType === 'create_team' &&
                (!(requestDialog.payload as Record<string, unknown>).name || !(requestDialog.payload as Record<string, unknown>).type)
              )}
            >
              <ClipboardList className="w-4 h-4 mr-1" />
              申請する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== レビューダイアログ (admin / ops_manager) ===== */}
      <Dialog open={reviewDialog !== null} onOpenChange={open => { if (!open) setReviewDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">申請を確認</DialogTitle>
          </DialogHeader>
          {reviewDialog && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Badge className="bg-gray-100 text-gray-600 text-[10px] border-0">
                    {REQUEST_TYPE_LABELS[reviewDialog.request_type]}
                  </Badge>
                </div>
                <p className="text-xs text-gray-700">申請者: {getEmployeeName(reviewDialog.requested_by)}</p>
                {reviewDialog.team_id && (
                  <p className="text-xs text-gray-500">
                    チーム: {teams.find(t => t.id === reviewDialog.team_id)?.name ?? reviewDialog.team_id}
                  </p>
                )}
                {(() => {
                  const p = reviewDialog.payload as Record<string, unknown>
                  if (p.employee_id) return <p className="text-xs text-gray-500">対象: {getEmployeeName(p.employee_id as string)}</p>
                  if (p.name) return (
                    <p className="text-xs text-gray-500">
                      チーム名: {p.name as string}（{p.type === 'store' ? '店舗' : 'プロジェクト'}）
                      　担当: {p.manager_name as string}
                    </p>
                  )
                  return null
                })()}
                {(() => {
                  const p = reviewDialog.payload as Record<string, unknown>
                  return p.comment ? (
                    <p className="text-xs text-gray-600 bg-white rounded px-2 py-1 border border-gray-200">
                      💬 {p.comment as string}
                    </p>
                  ) : null
                })()}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">コメント（任意）</p>
                <Textarea
                  placeholder="承認・差し戻しの理由や補足"
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  className="text-sm min-h-[60px] resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex gap-2 w-full">
              <Button
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                onClick={() => {
                  if (!reviewDialog) return
                  const p = reviewDialog.payload as Record<string, unknown>
                  const name = p.name ? `「${p.name as string}」` : reviewDialog.team_id ? `「${teams.find(t => t.id === reviewDialog.team_id)?.name ?? ''}」` : ''
                  let msg = `${getEmployeeName(reviewDialog.requested_by)} の申請\n${REQUEST_TYPE_LABELS[reviewDialog.request_type]}${name} を承認しますか？`
                  if (reviewComment.trim()) msg += `\nコメント: ${reviewComment.trim()}`
                  setConfirmDialog({
                    title: '承認の確認',
                    message: msg,
                    confirmLabel: '承認する',
                    confirmClassName: 'flex-1 bg-green-500 hover:bg-green-600 text-white',
                    onConfirm: () => handleApprove(reviewDialog),
                  })
                }}
                disabled={isPending}
              >
                <Check className="w-4 h-4 mr-1" />
                承認
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (!reviewDialog) return
                  const p = reviewDialog.payload as Record<string, unknown>
                  const name = p.name ? `「${p.name as string}」` : reviewDialog.team_id ? `「${teams.find(t => t.id === reviewDialog.team_id)?.name ?? ''}」` : ''
                  let msg = `${getEmployeeName(reviewDialog.requested_by)} の申請\n${REQUEST_TYPE_LABELS[reviewDialog.request_type]}${name} を差し戻ししますか？`
                  if (reviewComment.trim()) msg += `\nコメント: ${reviewComment.trim()}`
                  setConfirmDialog({
                    title: '差し戻しの確認',
                    message: msg,
                    confirmLabel: '差し戻しする',
                    confirmClassName: 'flex-1 border-red-300 text-red-600 hover:bg-red-50',
                    onConfirm: () => handleReject(reviewDialog),
                  })
                }}
                disabled={isPending}
              >
                <X className="w-4 h-4 mr-1" />
                差し戻し
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 汎用確認ダイアログ ===== */}
      <Dialog open={confirmDialog !== null} onOpenChange={open => { if (!open) setConfirmDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">{confirmDialog?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{confirmDialog?.message}</p>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmDialog(null)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button
                className={confirmDialog?.confirmClassName}
                onClick={() => {
                  confirmDialog?.onConfirm()
                  setConfirmDialog(null)
                }}
                disabled={isPending}
              >
                {confirmDialog?.confirmLabel}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
