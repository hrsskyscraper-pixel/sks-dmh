'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, UserPlus, UserMinus, ClipboardList, Check, X, ChevronDown, ChevronUp, ChevronRight, Pencil, MapPin } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import type { Employee, Team, TeamMember, TeamManager, TeamChangeRequest, Role } from '@/types/database'

interface Props {
  currentEmployee: Employee
  /** view-as 中はその社員、それ以外は currentEmployee と同じ */
  effectiveEmployee: Employee
  /** view-as 中は実際のログインユーザーと異なる場合がある */
  effectiveRole: Role
  teams: Team[]
  teamMembers: TeamMember[]
  teamManagers: TeamManager[]
  employees: Employee[]
  changeRequests: TeamChangeRequest[]
}

type RequestType = TeamChangeRequest['request_type']

const TEAM_TYPE_LABELS: Record<Team['type'], string> = {
  store: '店舗',
  project: 'チーム',
}

const TEAM_TYPE_COLORS: Record<Team['type'], string> = {
  store: 'bg-blue-100 text-blue-700',
  project: 'bg-purple-100 text-purple-700',
}

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  create_team: 'チーム作成',
  add_member: 'メンバー追加',
  remove_member: 'メンバー削除',
  add_manager: 'リーダー追加',
  remove_manager: 'リーダー削除',
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
  return role === 'admin' || role === 'ops_manager' || role === 'executive'
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
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'requests' ? 'requests' : 'teams'
  const [teams, setTeams] = useState(initialTeams)
  const [teamMembers, setTeamMembers] = useState(initialTeamMembers)
  const [teamManagers, setTeamManagers] = useState(initialTeamManagers)
  const [changeRequests, setChangeRequests] = useState(initialChangeRequests)
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()
  // effectiveRole で権限を判定（view-as 中はそちらを優先）
  const isDirectEdit = canDirectEdit(effectiveRole)
  const isReadOnly = !['store_manager', 'manager', 'admin', 'ops_manager', 'executive'].includes(effectiveRole)
  // view-as 中は申請操作を無効化（requested_by が admin になってしまうため）
  const isViewAs = currentEmployee.id !== effectiveEmployee.id

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
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set())
  const [newManagerRole, setNewManagerRole] = useState<'primary' | 'secondary'>('secondary')

  // ===== Request Dialog (manager only) =====
  const [requestDialog, setRequestDialog] = useState<{
    requestType: RequestType
    teamId: string | null
    payload: Record<string, unknown>
    label: string
  } | null>(null)
  const [requestComment, setRequestComment] = useState('')
  // create_team 申請時の担当リーダー選択（デフォルト = effectiveEmployee）
  const [requestManagerId, setRequestManagerId] = useState(effectiveEmployee.id)

  // ===== Review Dialog (ops_manager / admin) =====
  const [reviewDialog, setReviewDialog] = useState<TeamChangeRequest | null>(null)
  const [reviewComment, setReviewComment] = useState('')

  // ===== Expanded teams =====
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())

  // ===== 都道府県折りたたみ =====
  const [expandedPrefs, setExpandedPrefs] = useState<Set<string>>(new Set())
  const togglePref = (pref: string) => setExpandedPrefs(prev => {
    const next = new Set(prev)
    next.has(pref) ? next.delete(pref) : next.add(pref)
    return next
  })

  // ===== チーム名インライン編集 =====
  const [inlineTeamName, setInlineTeamName] = useState<{ teamId: string; value: string } | null>(null)

  function handleSaveTeamName() {
    if (!inlineTeamName) return
    const trimmed = inlineTeamName.value.trim()
    const original = teams.find(t => t.id === inlineTeamName.teamId)?.name ?? ''
    if (!trimmed) { toast.error('チーム名を入力してください'); setInlineTeamName(null); return }
    if (trimmed === original) { setInlineTeamName(null); return }
    startTransition(async () => {
      const { data, error } = await supabase
        .from('teams')
        .update({ name: trimmed })
        .eq('id', inlineTeamName.teamId)
        .select()
        .single()
      if (error) { toast.error('更新に失敗しました'); return }
      setTeams(prev => prev.map(t => t.id === data.id ? data : t))
      setInlineTeamName(null)
      toast.success('チーム名を更新しました')
    })
  }

  const pendingRequests = changeRequests.filter(r => r.status === 'pending')
  // マネジャー向け: 未読の審査結果件数（view-as 対応で effectiveEmployee を使う）
  const unreadResults = changeRequests.filter(
    r => r.requested_by === effectiveEmployee.id && r.status !== 'pending' && !r.applicant_read_at
  )
  // 申請タブに表示する申請: admin/ops_manager は全件、manager は自分の申請のみ
  const displayRequests = isDirectEdit
    ? changeRequests
    : changeRequests.filter(r => r.requested_by === effectiveEmployee.id)
  // manager 自身の pending 申請件数（バッジ表示用）
  const pendingMyCount = !isDirectEdit
    ? displayRequests.filter(r => r.status === 'pending').length
    : 0
  // admin/ops_manager が自分で審査した履歴（approved/rejected）
  const reviewedRequests = isDirectEdit
    ? changeRequests
        .filter(r => (r.status === 'approved' || r.status === 'rejected') && r.reviewed_by === currentEmployee.id)
        .sort((a, b) => new Date(b.reviewed_at ?? b.created_at).getTime() - new Date(a.reviewed_at ?? a.created_at).getTime())
    : []

  // 申請タブを開いたとき、表示対象の未読結果を既読にする
  const handleRequestsTabOpen = () => {
    if (isDirectEdit) return // admin/ops_manager は申請者ではないのでスキップ
    // effectiveEmployee.id で判定（view-as 対応）
    const unreadIds = changeRequests
      .filter(r => r.requested_by === effectiveEmployee.id && r.status !== 'pending' && !r.applicant_read_at)
      .map(r => r.id)
    if (unreadIds.length === 0) return
    // 楽観的にローカル更新（即座にバッジを消す）
    setChangeRequests(prev =>
      prev.map(r => unreadIds.includes(r.id) ? { ...r, applicant_read_at: new Date().toISOString() } : r)
    )
    // SECURITY DEFINER 関数経由で DB 更新（RLS を安全に回避）
    supabase
      .rpc('mark_team_requests_read', { p_request_ids: unreadIds })
      .then(({ error }) => {
        if (error) console.error('既読更新に失敗:', error.message, error.code, error.details)
      })
  }

  // URL パラメータで申請タブが初期表示のとき、マウント時に一度だけ既読処理を実行
  const markedReadOnMount = useRef(false)
  useEffect(() => {
    if (initialTab === 'requests' && !markedReadOnMount.current) {
      markedReadOnMount.current = true
      handleRequestsTabOpen()
    }
  // initialTab は固定値なので deps は空で問題なし
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // マネジャー候補（manager/admin/ops_manager/executive）
  const managerCandidates = employees.filter(e =>
    ['store_manager', 'manager', 'admin', 'ops_manager', 'executive'].includes(e.role)
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
        .insert({ team_id: team.id, employee_id: newTeamManagerId, role: 'primary' })
      if (managerError) { toast.error('マネジャー設定に失敗しました'); return }

      setTeams(prev => [...prev, team])
      setTeamManagers(prev => [...prev, { team_id: team.id, employee_id: newTeamManagerId, role: 'primary' as const }])
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

  const handleAddMember = (teamId: string, employeeIds: string[]) => {
    if (!isDirectEdit || employeeIds.length === 0) return
    startTransition(async () => {
      const { error } = await supabase
        .from('team_members')
        .insert(employeeIds.map(id => ({ team_id: teamId, employee_id: id })))
      if (error) { toast.error('追加に失敗しました'); return }
      setTeamMembers(prev => [...prev, ...employeeIds.map(id => ({ team_id: teamId, employee_id: id }))])
      setAddDialog(null)
      setSelectedEmployeeIds(new Set())
      toast.success(`${employeeIds.length}名をメンバーに追加しました`)
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

  const handleAddManager = (teamId: string, employeeIds: string[], role: 'primary' | 'secondary') => {
    if (!isDirectEdit || employeeIds.length === 0) return
    const existingPrimaryId = role === 'primary'
      ? teamManagers.find(m => m.team_id === teamId && m.role === 'primary')?.employee_id ?? null
      : null
    startTransition(async () => {
      if (existingPrimaryId) {
        const { error } = await supabase.from('team_managers')
          .update({ role: 'secondary' })
          .eq('team_id', teamId).eq('employee_id', existingPrimaryId)
        if (error) { toast.error('追加に失敗しました'); return }
      }
      const { error } = await supabase
        .from('team_managers')
        .insert(employeeIds.map(id => ({ team_id: teamId, employee_id: id, role })))
      if (error) { toast.error('追加に失敗しました'); return }
      setTeamManagers(prev => {
        const updated = existingPrimaryId
          ? prev.map(m => m.team_id === teamId && m.employee_id === existingPrimaryId ? { ...m, role: 'secondary' as const } : m)
          : prev
        return [...updated, ...employeeIds.map(id => ({ team_id: teamId, employee_id: id, role }))]
      })
      setAddDialog(null)
      setSelectedEmployeeIds(new Set())
      setNewManagerRole('secondary')
      toast.success(`${employeeIds.length}名をマネジャーに追加しました`)
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
      toast.success('マネジャーを削除しました')
    })
  }

  // -------------------------------------------------------
  // Request actions (manager) — manager 自身が担当リーダーとして申請
  // -------------------------------------------------------

  const handleSubmitRequest = () => {
    if (!requestDialog || isReadOnly) return
    startTransition(async () => {
      const payload: Record<string, unknown> = { ...requestDialog.payload }
      if (requestDialog.requestType === 'create_team') {
        // フォームで選択した担当リーダーを使用（デフォルト = effectiveEmployee）
        payload.manager_id = requestManagerId
        payload.manager_name = employees.find(e => e.id === requestManagerId)?.name ?? requestManagerId
      }
      if (requestComment.trim()) payload.comment = requestComment.trim()

      const { data, error } = await supabase
        .from('team_change_requests')
        .insert({
          requested_by: effectiveEmployee.id,
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
          // 申請者（manager）を担当リーダーとして自動設定
          const managerId = (payload.manager_id as string | undefined) ?? req.requested_by
          const { error: mgrError } = await supabase
            .from('team_managers')
            .insert({ team_id: newTeam.id, employee_id: managerId, role: 'primary' })
          if (mgrError) { applyError = mgrError }
          else {
            setTeamManagers(prev => [...prev, { team_id: newTeam.id, employee_id: managerId, role: 'primary' as const }])
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
        const role = (payload.role as 'primary' | 'secondary' | undefined) ?? 'secondary'
        const { error } = await supabase
          .from('team_managers')
          .insert({ team_id: req.team_id, employee_id: payload.employee_id as string, role })
        if (error) { applyError = error }
        else {
          setTeamManagers(prev => [...prev, { team_id: req.team_id!, employee_id: payload.employee_id as string, role }])
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
  const getEmployee = (id: string) => employees.find(e => e.id === id) ?? null

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
        label = `「${teamName}」へのリーダー追加を申請`
      } else if (req.request_type === 'remove_manager') {
        payload = { employee_id: p.employee_id, employee_name: p.employee_name, team_name: teamName }
        label = `「${teamName}」から${p.employee_name as string}のマネジャー削除申請`
      }
    }

    setRequestDialog({ requestType: req.request_type, teamId: req.team_id, payload, label })
    setRequestComment('')
  }

  const getDisplayRole = (emp: Pick<Employee, 'role' | 'employment_type'>) => {
    if (emp.role === 'admin') return '開発者'
    if (emp.role === 'executive') return '役員'
    if (emp.role === 'ops_manager') return '運用管理者'
    if (emp.role === 'manager') return 'マネジャー'
    if (emp.role === 'store_manager') return '店長'
    return emp.employment_type ?? '社員'
  }

  const DISPLAY_ROLE_ORDER: Record<string, number> = {
    '社員': 0, 'メイト': 1, '店長': 1.5, 'マネジャー': 2, '運用管理者': 3, '役員': 3.5, '開発者': 4,
  }

  const sortEmployees = <T extends Pick<Employee, 'role' | 'employment_type' | 'name'>>(list: T[]) =>
    [...list].sort((a, b) => {
      const oa = DISPLAY_ROLE_ORDER[getDisplayRole(a)] ?? 9
      const ob = DISPLAY_ROLE_ORDER[getDisplayRole(b)] ?? 9
      return oa !== ob ? oa - ob : a.name.localeCompare(b.name, 'ja')
    })

  const getEmployeeOptionLabel = (emp: Pick<Employee, 'id' | 'name' | 'role' | 'employment_type'>) => {
    const storeNames = teamMembers
      .filter(tm => tm.employee_id === emp.id)
      .map(tm => teams.find(t => t.id === tm.team_id))
      .filter((t): t is Team => t?.type === 'store')
      .map(t => t.name)
      .join('・')
    return `${emp.name} / ${getDisplayRole(emp)} / ${storeNames || '—'}`
  }

  const getTeamMemberIds = (teamId: string) =>
    teamMembers.filter(m => m.team_id === teamId).map(m => m.employee_id)

  const getTeamManagerIds = (teamId: string) =>
    teamManagers.filter(m => m.team_id === teamId).map(m => m.employee_id)

  const getTeamPrimaryManagerId = (teamId: string) =>
    teamManagers.find(m => m.team_id === teamId && m.role === 'primary')?.employee_id ?? null

  const getTeamSecondaryManagerIds = (teamId: string) =>
    teamManagers.filter(m => m.team_id === teamId && m.role === 'secondary').map(m => m.employee_id)

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

      {/* チーム (project) */}
      {[...teams].filter(t => t.type === 'project').sort((a, b) => {
        const aIsMine = getTeamManagerIds(a.id).includes(effectiveEmployee.id) || getTeamMemberIds(a.id).includes(effectiveEmployee.id)
        const bIsMine = getTeamManagerIds(b.id).includes(effectiveEmployee.id) || getTeamMemberIds(b.id).includes(effectiveEmployee.id)
        return aIsMine === bIsMine ? 0 : aIsMine ? -1 : 1
      }).map(team => {
        const memberIds = getTeamMemberIds(team.id)
        const managerIds = getTeamManagerIds(team.id)
        const isExpanded = expandedTeams.has(team.id)
        const isManagedByMe = managerIds.includes(effectiveEmployee.id)
        const isMemberOfMe = !isManagedByMe && memberIds.includes(effectiveEmployee.id)

        return (
          <Card key={team.id} className={isManagedByMe ? 'border-orange-300 bg-orange-50' : isMemberOfMe ? 'border-green-200 bg-green-50' : ''}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Badge className={`${TEAM_TYPE_COLORS[team.type]} text-xs border-0 flex-shrink-0`}>
                    {TEAM_TYPE_LABELS[team.type]}
                  </Badge>
                  {isDirectEdit && inlineTeamName?.teamId === team.id ? (
                    <input
                      className="text-sm font-semibold text-gray-800 border-b-2 border-orange-400 outline-none bg-transparent min-w-0 flex-1"
                      value={inlineTeamName.value}
                      onChange={e => setInlineTeamName({ teamId: team.id, value: e.target.value })}
                      onBlur={handleSaveTeamName}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveTeamName(); if (e.key === 'Escape') setInlineTeamName(null) }}
                      autoFocus
                      disabled={isPending}
                    />
                  ) : (
                    <button
                      className="text-sm font-semibold text-gray-800 truncate text-left flex items-center gap-1 group"
                      onClick={() => isDirectEdit && setInlineTeamName({ teamId: team.id, value: team.name })}
                      style={{ cursor: isDirectEdit ? 'pointer' : 'default' }}
                    >
                      {team.name}
                      {isDirectEdit && <Pencil className="w-3 h-3 text-gray-300 group-hover:text-orange-400 flex-shrink-0 opacity-0 group-hover:opacity-100" />}
                    </button>
                  )}
                  {isManagedByMe && (
                    <Badge className="bg-orange-100 text-orange-700 text-[10px] border-0 flex-shrink-0">担当</Badge>
                  )}
                  {isMemberOfMe && (
                    <Badge className="bg-green-100 text-green-700 text-[10px] border-0 flex-shrink-0">メンバー</Badge>
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
                        message: `チーム「${team.name}」を削除しますか？\nメンバー・マネジャーの紐付けもすべて削除されます。`,
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
                メンバー {memberIds.length}名　担当リーダー {managerIds.length}名
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
                          onClick={() => { setAddDialog({ type: 'member', teamId: team.id }); setSelectedEmployeeIds(new Set()) }}
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
                    {memberIds.map(empId => {
                      const emp = getEmployee(empId)
                      return (
                      <div key={empId} className="flex items-center gap-1 bg-gray-100 rounded-full pl-0.5 pr-2 py-0.5">
                        <Avatar className="w-4 h-4 flex-shrink-0">
                          <AvatarImage src={emp?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[8px] bg-gray-300 text-gray-600">{emp?.name.charAt(0)}</AvatarFallback>
                        </Avatar>
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
                      )}
                    )}
                  </div>
                </div>

                {/* 担当リーダー */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-600">担当リーダー</p>
                    {!isReadOnly && (
                      isDirectEdit ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                          onClick={() => { setAddDialog({ type: 'manager', teamId: team.id }); setSelectedEmployeeIds(new Set()) }}
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
                              payload: { team_name: team.name, role: 'secondary' },
                              label: `「${team.name}」へのリーダー追加を申請`,
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
                    {teamManagers
                      .filter(m => m.team_id === team.id)
                      .sort((a, b) => a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0)
                      .map(manager => {
                        const emp = getEmployee(manager.employee_id)
                        const isPrimary = manager.role === 'primary'
                        return (
                        <div key={manager.employee_id} className={`flex items-center gap-1 ${isPrimary ? 'bg-amber-100' : 'bg-blue-100'} rounded-full pl-1 pr-2 py-0.5`}>
                          <span className={`text-[9px] font-bold ${isPrimary ? 'text-amber-600' : 'text-blue-500'}`}>{isPrimary ? '主' : '副'}</span>
                          <Avatar className="w-4 h-4 flex-shrink-0">
                            <AvatarImage src={emp?.avatar_url ?? undefined} />
                            <AvatarFallback className={`text-[8px] ${isPrimary ? 'bg-amber-300 text-amber-700' : 'bg-blue-300 text-blue-700'}`}>{emp?.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className={`text-xs ${isPrimary ? 'text-amber-700' : 'text-blue-700'}`}>{getEmployeeName(manager.employee_id)}</span>
                          {isDirectEdit && (
                            <button
                              onClick={() => setConfirmDialog({
                                title: '削除の確認',
                                message: `「${team.name}」の担当リーダーから${getEmployeeName(manager.employee_id)}を外しますか？`,
                                confirmLabel: '外す',
                                confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white',
                                onConfirm: () => handleRemoveManager(team.id, manager.employee_id),
                              })}
                              disabled={isPending}
                              className={`${isPrimary ? 'text-amber-400' : 'text-blue-400'} hover:text-red-500 transition-colors`}
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
                                  payload: { employee_id: manager.employee_id, employee_name: getEmployeeName(manager.employee_id), team_name: team.name },
                                  label: `「${team.name}」から${getEmployeeName(manager.employee_id)}のマネジャー削除申請`,
                                })
                                setRequestComment('')
                              }}
                              disabled={isPending}
                              className={`${isPrimary ? 'text-amber-400' : 'text-blue-400'} hover:text-red-500 transition-colors`}
                              title="削除申請"
                            >
                              <UserMinus className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        )
                      })
                    }
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* 店舗 (store) — 都道府県別折りたたみ */}
      {(() => {
        const storeTeams = teams.filter(t => t.type === 'store')
        const PREF_ORDER = ['秋田県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','静岡県','茨城県']
        const grouped: Record<string, Team[]> = {}
        const noPref: Team[] = []
        for (const t of storeTeams) {
          if (t.prefecture) {
            if (!grouped[t.prefecture]) grouped[t.prefecture] = []
            grouped[t.prefecture].push(t)
          } else {
            noPref.push(t)
          }
        }
        const prefOrder = PREF_ORDER.filter(p => grouped[p])
        for (const p of Object.keys(grouped)) { if (!prefOrder.includes(p)) prefOrder.push(p) }
        const allStoresList = [...prefOrder.flatMap(p => ({ pref: p, teams: grouped[p] })), ...(noPref.length > 0 ? [{ pref: 'その他', teams: noPref }] : [])]

        return allStoresList.map(({ pref, teams: stores }) => {
          const isPrefExpanded = expandedPrefs.has(pref)
          return (
            <div key={pref}>
              <button
                type="button"
                onClick={() => togglePref(pref)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors mb-1.5"
              >
                {isPrefExpanded
                  ? <ChevronDown className="w-4 h-4 text-gray-500" />
                  : <ChevronRight className="w-4 h-4 text-gray-500" />
                }
                <MapPin className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-gray-700">{pref}</span>
                <span className="text-xs text-gray-400 ml-auto">{stores.length}店舗</span>
              </button>
              {isPrefExpanded && stores.map(storeTeam => {
                const memberIds = getTeamMemberIds(storeTeam.id)
                const managerIds = getTeamManagerIds(storeTeam.id)
                const isExpanded = expandedTeams.has(storeTeam.id)
                const isManagedByMe = managerIds.includes(effectiveEmployee.id)
                const isMemberOfMe = !isManagedByMe && memberIds.includes(effectiveEmployee.id)
                return (
                  <Card key={storeTeam.id} className={`mb-1.5 ${isManagedByMe ? 'border-orange-300 bg-orange-50' : isMemberOfMe ? 'border-green-200 bg-green-50' : ''}`}>
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Badge className={`${TEAM_TYPE_COLORS[storeTeam.type]} text-xs border-0 flex-shrink-0`}>
                            {TEAM_TYPE_LABELS[storeTeam.type]}
                          </Badge>
                          {isDirectEdit && inlineTeamName?.teamId === storeTeam.id ? (
                            <input
                              className="text-sm font-semibold text-gray-800 border-b-2 border-orange-400 outline-none bg-transparent min-w-0 flex-1"
                              value={inlineTeamName.value}
                              onChange={e => setInlineTeamName({ teamId: storeTeam.id, value: e.target.value })}
                              onBlur={handleSaveTeamName}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleSaveTeamName(); if (e.key === 'Escape') setInlineTeamName(null) }}
                              autoFocus
                              disabled={isPending}
                            />
                          ) : (
                            <button
                              className="text-sm font-semibold text-gray-800 truncate text-left flex items-center gap-1 group"
                              onClick={() => isDirectEdit && setInlineTeamName({ teamId: storeTeam.id, value: storeTeam.name })}
                              style={{ cursor: isDirectEdit ? 'pointer' : 'default' }}
                            >
                              {storeTeam.name}
                              {isDirectEdit && <Pencil className="w-3 h-3 text-gray-300 group-hover:text-orange-400 flex-shrink-0 opacity-0 group-hover:opacity-100" />}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400" onClick={() => toggleExpand(storeTeam.id)}>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          {isDirectEdit && (
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setConfirmDialog({ title: '削除の確認', message: `店舗「${storeTeam.name}」を削除しますか？`, confirmLabel: '削除する', confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white', onConfirm: () => handleDeleteTeam(storeTeam.id) })}
                              disabled={isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">メンバー {memberIds.length}名　担当リーダー {managerIds.length}名</p>
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="px-4 pb-3 space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-medium text-gray-600">メンバー</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {memberIds.length === 0 && <p className="text-xs text-muted-foreground">メンバーなし</p>}
                            {memberIds.map(empId => {
                              const emp = getEmployee(empId)
                              return (
                                <div key={empId} className="flex items-center gap-1 bg-gray-100 rounded-full pl-0.5 pr-2 py-0.5">
                                  <Avatar className="w-4 h-4 flex-shrink-0">
                                    <AvatarImage src={emp?.avatar_url ?? undefined} />
                                    <AvatarFallback className="text-[8px] bg-gray-300 text-gray-600">{emp?.name.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <span className="text-xs text-gray-700">{getEmployeeName(empId)}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-600 mb-1.5">担当リーダー</p>
                          <div className="flex flex-wrap gap-1.5">
                            {managerIds.length === 0 && <p className="text-xs text-muted-foreground">担当なし</p>}
                            {teamManagers.filter(m => m.team_id === storeTeam.id).map(manager => {
                              const emp = getEmployee(manager.employee_id)
                              const isPrimary = manager.role === 'primary'
                              return (
                                <div key={manager.employee_id} className={`flex items-center gap-1 ${isPrimary ? 'bg-amber-100' : 'bg-blue-100'} rounded-full pl-1 pr-2 py-0.5`}>
                                  <span className={`text-[9px] font-bold ${isPrimary ? 'text-amber-600' : 'text-blue-500'}`}>{isPrimary ? '主' : '副'}</span>
                                  <Avatar className="w-4 h-4 flex-shrink-0">
                                    <AvatarImage src={emp?.avatar_url ?? undefined} />
                                    <AvatarFallback className={`text-[8px] ${isPrimary ? 'bg-amber-300 text-amber-700' : 'bg-blue-300 text-blue-700'}`}>{emp?.name.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <span className={`text-xs ${isPrimary ? 'text-amber-700' : 'text-blue-700'}`}>{getEmployeeName(manager.employee_id)}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </div>
          )
        })
      })()}

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
      <Tabs defaultValue={initialTab} onValueChange={v => { if (v === 'requests') handleRequestsTabOpen() }}>
        <TabsList className={`grid w-full h-9 ${isDirectEdit ? 'grid-cols-3' : 'grid-cols-2'}`}>
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
            {/* manager: 自分の審査待ち申請件数 */}
            {!isDirectEdit && pendingMyCount > 0 && (
              <Badge className="ml-1 bg-amber-400 text-white text-[10px] h-4 px-1 border-0">
                審査中{pendingMyCount}
              </Badge>
            )}
          </TabsTrigger>
          {isDirectEdit && (
            <TabsTrigger value="review-history" className="text-xs">審査履歴</TabsTrigger>
          )}
        </TabsList>

        {/* manager: チーム作成申請ボタン（タブ直下） */}
        {!isDirectEdit && !isReadOnly && (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-dashed h-9 text-xs text-gray-500 mt-3"
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
          {!isDirectEdit && pendingMyCount > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700">
              回答待ちの申請が <span className="font-bold">{pendingMyCount}件</span> あります
            </div>
          )}

          {displayRequests.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                申請履歴がありません
              </CardContent>
            </Card>
          )}

          {[...displayRequests].sort((a, b) => {
            const priority = (r: typeof a) =>
              r.status === 'pending' ? 0
              : (r.requested_by === effectiveEmployee.id && !r.applicant_read_at ? 1 : 2)
            const pd = priority(a) - priority(b)
            if (pd !== 0) return pd
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          }).map(req => {
            const isUnread = req.requested_by === effectiveEmployee.id && req.status !== 'pending' && !req.applicant_read_at
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
                            チーム名: {p.name as string}（{p.type === 'store' ? '店舗' : 'チーム'}）
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

        {/* ===== 審査履歴タブ (admin/ops_manager のみ) ===== */}
        {isDirectEdit && (
          <TabsContent value="review-history" className="mt-3 space-y-3">
            {reviewedRequests.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  審査履歴がありません
                </CardContent>
              </Card>
            ) : (
              reviewedRequests.map(req => (
                <Card key={req.id} className={req.status === 'approved' ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50'}>
                  <CardContent className="py-3 px-4">
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
                            チーム名: {p.name as string}（{p.type === 'store' ? '店舗' : 'チーム'}）
                            　担当: {p.manager_name as string}
                          </p>
                        )
                      }
                      return null
                    })()}
                    {(() => {
                      const p = req.payload as Record<string, unknown>
                      return p.comment ? (
                        <p className="text-xs text-gray-600 mt-1 bg-white rounded px-2 py-1 border border-gray-100">
                          💬 {p.comment as string}
                        </p>
                      ) : null
                    })()}
                    {(req.review_comment || req.reviewed_by) && (
                      <p className="text-xs text-gray-600 mt-1 bg-white rounded px-2 py-1 border border-gray-100">
                        {req.review_comment ?? (req.status === 'approved' ? '承認しました' : '差し戻ししました')}
                      </p>
                    )}
                    <div className="mt-1 space-y-0.5">
                      <p className="text-[10px] text-gray-400">申請: {fmtDateTime(req.created_at)}</p>
                      {req.reviewed_at && (
                        <p className="text-[10px] text-gray-400">審査: {fmtDateTime(req.reviewed_at)}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        )}
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
                placeholder="例: 新人早期育成チーム、渋谷店"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <div className="flex items-baseline gap-2 mb-1">
                <p className="text-xs font-medium text-gray-600">種別 <span className="text-red-500">*</span></p>
                <p className="text-[10px] text-muted-foreground">店舗を横断するチームの場合、チームを選択してください。</p>
              </div>
              <div className="flex gap-2">
                {(['project', 'store'] as const).map(type => (
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
                担当リーダー <span className="text-red-500">*</span>
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

      {/* ===== メンバー/マネジャー追加ダイアログ (direct edit) ===== */}
      <Dialog open={addDialog !== null} onOpenChange={open => { if (!open) { setAddDialog(null); setSelectedEmployeeIds(new Set()); setNewManagerRole('secondary') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {addDialog?.type === 'member' ? 'メンバーを追加' : 'リーダーを追加'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {addDialog?.type === 'manager' && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">区分</p>
                <div className="flex gap-4">
                  {(['primary', 'secondary'] as const).map(role => (
                    <label key={role} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="manager-role"
                        value={role}
                        checked={newManagerRole === role}
                        onChange={() => {
                          setNewManagerRole(role)
                          setSelectedEmployeeIds(new Set())
                        }}
                        className="accent-orange-500"
                      />
                      <span className="text-sm">{role === 'primary' ? '主担当（1名のみ）' : '副担当'}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-medium text-gray-600">社員を選択</p>
                {selectedEmployeeIds.size > 0 && (
                  <span className="text-[10px] text-orange-600 font-semibold">{selectedEmployeeIds.size}名選択中</span>
                )}
              </div>
              <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-64 divide-y divide-gray-100">
                {sortEmployees(addDialog?.type === 'manager' ? managerCandidates : employees)
                  .map(emp => {
                    const existingIds = addDialog
                      ? (addDialog.type === 'member' ? getTeamMemberIds(addDialog.teamId) : getTeamManagerIds(addDialog.teamId))
                      : []
                    const isExisting = existingIds.includes(emp.id)
                    const isCurrentPrimary = addDialog?.type === 'manager' && newManagerRole === 'primary'
                      && emp.id === getTeamPrimaryManagerId(addDialog.teamId)
                    const checked = isExisting || selectedEmployeeIds.has(emp.id)
                    return (
                      <label
                        key={emp.id}
                        className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                          isExisting ? 'bg-gray-50 cursor-default' : checked ? 'bg-orange-50 cursor-pointer' : 'hover:bg-gray-50 cursor-pointer'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isExisting}
                          onCheckedChange={v => {
                            if (isExisting) return
                            if (addDialog?.type === 'manager' && newManagerRole === 'primary') {
                              setSelectedEmployeeIds(v ? new Set([emp.id]) : new Set())
                            } else {
                              setSelectedEmployeeIds(prev => {
                                const next = new Set(prev)
                                v ? next.add(emp.id) : next.delete(emp.id)
                                return next
                              })
                            }
                          }}
                        />
                        <Avatar className="w-6 h-6 flex-shrink-0">
                          <AvatarImage src={emp.avatar_url ?? undefined} />
                          <AvatarFallback className={`text-[10px] ${isExisting ? 'bg-gray-200 text-gray-400' : 'bg-orange-200 text-orange-700'}`}>{emp.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className={`text-sm flex-1 ${isExisting ? 'text-gray-400' : 'text-gray-800'}`}>
                          {getEmployeeOptionLabel(emp)}
                        </span>
                        {isCurrentPrimary && (
                          <span className="text-[10px] text-amber-600 font-medium flex-shrink-0">現在の主担当</span>
                        )}
                      </label>
                    )
                  })
                }
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
              onClick={() => {
                if (!addDialog) return
                const ids = Array.from(selectedEmployeeIds)
                if (addDialog.type === 'member') {
                  handleAddMember(addDialog.teamId, ids)
                } else {
                  handleAddManager(addDialog.teamId, ids, newManagerRole)
                }
              }}
              disabled={isPending || selectedEmployeeIds.size === 0}
            >
              {selectedEmployeeIds.size > 0 ? `${selectedEmployeeIds.size}名を追加する` : '追加する'}
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
                      placeholder="例: 新人早期育成チーム、渋谷店"
                      value={(requestDialog?.payload as Record<string, unknown>)?.name as string ?? ''}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
                      onChange={e => setRequestDialog(prev => prev ? {
                        ...prev,
                        payload: { ...prev.payload, name: e.target.value }
                      } : null)}
                    />
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <p className="text-xs font-medium text-gray-600">種別</p>
                      <p className="text-[10px] text-muted-foreground">店舗を横断するチームの場合、チームを選択してください。</p>
                    </div>
                    <div className="flex gap-2">
                      {(['project', 'store'] as const).map(type => {
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
                    <p className="text-xs font-medium text-gray-600 mb-1">担当リーダー <span className="text-red-500">*</span></p>
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
                        ※ 申請者以外をマネジャーに設定しています。コメントで理由を説明してください。
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
                    {sortEmployees(requestDialog.requestType === 'add_manager' ? managerCandidates : employees).map(emp => (
                      <option key={emp.id} value={emp.id}>{getEmployeeOptionLabel(emp)}</option>
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
                  const type = p.type === 'store' ? '店舗' : 'チーム'
                  const mgr = employees.find(e => e.id === requestManagerId)?.name ?? ''
                  summary = `チーム名: ${p.name as string}\n種別: ${type}\n担当リーダー: ${mgr}`
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
                      チーム名: {p.name as string}（{p.type === 'store' ? '店舗' : 'チーム'}）
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
