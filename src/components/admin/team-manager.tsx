'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Trash2, UserPlus, UserMinus, ClipboardList, Check, X, ChevronDown, ChevronUp, ChevronRight, Pencil, MapPin, Mail } from 'lucide-react'
import { InviteMemberDialog } from './invite-member-dialog'
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
  teamProjectNames?: Record<string, string[]>
  brands?: { id: string; name: string; color: string | null }[]
}

type RequestType = TeamChangeRequest['request_type']

const TEAM_TYPE_LABELS: Record<Team['type'], string> = {
  store: '店舗',
  project: 'チーム',
  department: '部署',
}

const TEAM_TYPE_COLORS: Record<Team['type'], string> = {
  store: 'bg-blue-100 text-blue-700',
  project: 'bg-purple-100 text-purple-700',
  department: 'bg-teal-100 text-teal-700',
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
  pending: '承認待ち',
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
  teamProjectNames = {},
  brands = [],
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
  const [newTeamManagerId, setNewTeamManagerId] = useState('')
  const [newTeamSubManagerIds, setNewTeamSubManagerIds] = useState<string[]>([])
  const [newTeamMemberIds, setNewTeamMemberIds] = useState<string[]>([])
  const [newTeamBrandIds, setNewTeamBrandIds] = useState<Set<string>>(new Set())

  // ===== 招待ダイアログ =====
  const [inviteDialog, setInviteDialog] = useState<{ teamId: string; teamName: string; asManager: boolean } | null>(null)

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

  // ===== ドラッグ＆ドロップ =====
  const [dragEmp, setDragEmp] = useState<{ id: string; teamId: string; from: 'member' | 'manager' } | null>(null)
  const [dropTarget, setDropTarget] = useState<'member' | 'manager' | null>(null)
  const [dropBeforeId, setDropBeforeId] = useState<string | null>(null)
  // メンバー→リーダー昇格ダイアログ
  const [promoteDialog, setPromoteDialog] = useState<{ empId: string; teamId: string } | null>(null)
  // 主担当競合ダイアログ
  const [primaryConflict, setPrimaryConflict] = useState<{ empId: string; teamId: string; existingPrimaryId: string } | null>(null)

  // ===== 都道府県折りたたみ =====
  const [expandedPrefs, setExpandedPrefs] = useState<Set<string>>(new Set())
  const [showAllTeams, setShowAllTeams] = useState(false)
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

  // ===== チーム編集ダイアログ =====
  const [editTeam, setEditTeam] = useState<{ id: string; name: string; type: Team['type']; prefecture: string } | null>(null)

  function handleSaveEditTeam() {
    if (!editTeam) return
    const trimmed = editTeam.name.trim()
    if (!trimmed) { toast.error('名前を入力してください'); return }
    startTransition(async () => {
      const { data, error } = await supabase
        .from('teams')
        .update({
          name: trimmed,
          type: editTeam.type,
          prefecture: editTeam.prefecture || null,
        })
        .eq('id', editTeam.id)
        .select()
        .single()
      if (error) { toast.error('更新に失敗しました'); return }
      setTeams(prev => prev.map(t => t.id === data.id ? data : t))
      setEditTeam(null)
      toast.success('チーム情報を更新しました')
    })
  }

  const PREFECTURES = [
    '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
    '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
    '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県',
    '三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
    '鳥取県','島根県','岡山県','広島県','山口県',
    '徳島県','香川県','愛媛県','高知県',
    '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
  ]

  const pendingRequests = changeRequests.filter(r => r.status === 'pending')
  // マネジャー向け: 未読の承認結果件数（view-as 対応で effectiveEmployee を使う）
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
  // admin/ops_manager が自分で承認した履歴（approved/rejected）
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

  // 直接編集の承認履歴を記録
  const logDirectAction = async (
    requestType: RequestType,
    teamId: string | null,
    payload: Record<string, unknown>,
  ) => {
    const { data } = await supabase.from('team_change_requests').insert({
      requested_by: currentEmployee.id,
      request_type: requestType,
      team_id: teamId,
      payload: payload as unknown as import('@/types/database').Json,
      status: 'approved' as const,
      reviewed_by: currentEmployee.id,
      reviewed_at: new Date().toISOString(),
      review_comment: '直接実行',
    }).select().maybeSingle()
    if (data) {
      setChangeRequests(prev => [...prev, data])
    }
  }

  const handleCreateTeam = () => {
    if (!isDirectEdit) return
    if (!newTeamName.trim() || !newTeamManagerId) return
    startTransition(async () => {
      const brandIdsArr = [...newTeamBrandIds]
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          name: newTeamName.trim(),
          type: 'project',
          brand_ids: brandIdsArr,
          brand_id: brandIdsArr[0] ?? null,
        })
        .select()
        .single()
      if (teamError) { toast.error('チームの作成に失敗しました'); return }

      // 主担当
      const managerInserts: { team_id: string; employee_id: string; role: 'primary' | 'secondary' }[] = [{ team_id: team.id, employee_id: newTeamManagerId, role: 'primary' }]
      // 副担当
      for (const subId of newTeamSubManagerIds) {
        if (subId !== newTeamManagerId) {
          managerInserts.push({ team_id: team.id, employee_id: subId, role: 'secondary' as const })
        }
      }
      const { error: managerError } = await supabase
        .from('team_managers')
        .insert(managerInserts)
      if (managerError) { toast.error('マネジャー設定に失敗しました'); return }

      // メンバー登録
      if (newTeamMemberIds.length > 0) {
        await supabase.from('team_members').insert(newTeamMemberIds.map(id => ({ team_id: team.id, employee_id: id })))
        setTeamMembers(prev => [...prev, ...newTeamMemberIds.map((id, i) => ({ team_id: team.id, employee_id: id, sort_order: i }))])
      }

      setTeams(prev => [...prev, team])
      setTeamManagers(prev => [...prev, ...managerInserts.map((m, i) => ({ ...m, sort_order: i }))])
      await logDirectAction('create_team', team.id, { team_name: team.name, team_type: 'project', manager_id: newTeamManagerId, manager_name: getEmployeeName(newTeamManagerId), sub_managers: newTeamSubManagerIds.filter(id => id !== newTeamManagerId).map(id => getEmployeeName(id)), members: newTeamMemberIds.map(id => getEmployeeName(id)) })
      setShowCreateTeam(false)
      setNewTeamName('')
      setNewTeamManagerId('')
      setNewTeamSubManagerIds([])
      setNewTeamMemberIds([])
      setNewTeamBrandIds(new Set())
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
        .insert(employeeIds.map(id => ({ team_id: teamId, employee_id: id, sort_order: 999 })))
      if (error) { toast.error('追加に失敗しました'); return }
      setTeamMembers(prev => [...prev, ...employeeIds.map(id => ({ team_id: teamId, employee_id: id, sort_order: 999 }))])
      const teamName = teams.find(t => t.id === teamId)?.name ?? ''
      for (const empId of employeeIds) {
        await logDirectAction('add_member', teamId, { team_name: teamName, employee_id: empId, employee_name: getEmployeeName(empId) })
      }
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
      const teamName = teams.find(t => t.id === teamId)?.name ?? ''
      await logDirectAction('remove_member', teamId, { team_name: teamName, employee_id: employeeId, employee_name: getEmployeeName(employeeId) })
      toast.success('メンバーを削除しました')
    })
  }

  // ダイアログ経由の主担当追加で既存主担当がいる場合の一時保存
  const [pendingAddManager, setPendingAddManager] = useState<{ teamId: string; employeeIds: string[] } | null>(null)

  const handleAddManager = (teamId: string, employeeIds: string[], role: 'primary' | 'secondary') => {
    if (!isDirectEdit || employeeIds.length === 0) return

    // 主担当追加で既存主担当がいる場合 → 競合ダイアログを表示
    if (role === 'primary') {
      const existingPrimary = teamManagers.find(m => m.team_id === teamId && m.role === 'primary')
      if (existingPrimary) {
        setPendingAddManager({ teamId, employeeIds })
        setPrimaryConflict({ empId: employeeIds[0], teamId, existingPrimaryId: existingPrimary.employee_id })
        setAddDialog(null)
        setSelectedEmployeeIds(new Set())
        setNewManagerRole('secondary')
        return
      }
    }

    doAddManager(teamId, employeeIds, role)
  }

  const doAddManager = (teamId: string, employeeIds: string[], role: 'primary' | 'secondary') => {
    startTransition(async () => {
      for (const id of employeeIds) {
        const { error } = await supabase.from('team_managers')
          .upsert({ team_id: teamId, employee_id: id, role, sort_order: 999 }, { onConflict: 'team_id,employee_id' })
        if (error) { toast.error('追加に失敗しました: ' + error.message); return }
        await supabase.from('team_members').delete().eq('team_id', teamId).eq('employee_id', id)
      }
      setTeamMembers(prev => prev.filter(m => !(m.team_id === teamId && employeeIds.includes(m.employee_id))))
      setTeamManagers(prev => {
        const existingIds = new Set(prev.filter(m => m.team_id === teamId).map(m => m.employee_id))
        const updated = prev.map(m => m.team_id === teamId && employeeIds.includes(m.employee_id) ? { ...m, role, sort_order: 999 } : m)
        const newEntries = employeeIds.filter(id => !existingIds.has(id)).map(id => ({ team_id: teamId, employee_id: id, role, sort_order: 999 }))
        return [...updated, ...newEntries]
      })
      const teamName = teams.find(t => t.id === teamId)?.name ?? ''
      for (const empId of employeeIds) {
        await logDirectAction('add_manager', teamId, { team_name: teamName, employee_id: empId, employee_name: getEmployeeName(empId), role })
      }
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
      const teamName = teams.find(t => t.id === teamId)?.name ?? ''
      await logDirectAction('remove_manager', teamId, { team_name: teamName, employee_id: employeeId, employee_name: getEmployeeName(employeeId) })
      toast.success('マネジャーを削除しました')
    })
  }

  // -------------------------------------------------------
  // ドラッグ＆ドロップ処理
  // -------------------------------------------------------

  const handleDrop = (teamId: string, target: 'member' | 'manager', beforeId?: string | null) => {
    if (!dragEmp || dragEmp.teamId !== teamId) { setDragEmp(null); setDropTarget(null); setDropBeforeId(null); return }
    setDropTarget(null)
    setDropBeforeId(null)

    if (dragEmp.from === target) {
      // 同一リスト内の並び替え
      reorderInList(teamId, target, dragEmp.id, beforeId ?? null)
      setDragEmp(null)
      return
    }

    if (dragEmp.from === 'member' && target === 'manager') {
      setPromoteDialog({ empId: dragEmp.id, teamId })
    } else if (dragEmp.from === 'manager' && target === 'member') {
      startTransition(async () => {
        const { error: delErr } = await supabase.from('team_managers').delete().eq('team_id', teamId).eq('employee_id', dragEmp.id)
        if (delErr) { toast.error('変更に失敗しました'); return }
        await supabase.from('team_members').insert({ team_id: teamId, employee_id: dragEmp.id, sort_order: 999 })
        setTeamManagers(prev => prev.filter(m => !(m.team_id === teamId && m.employee_id === dragEmp.id)))
        setTeamMembers(prev => [...prev, { team_id: teamId, employee_id: dragEmp.id, sort_order: 999 }])
        toast.success(`${getEmployeeName(dragEmp.id)}をメンバーに変更しました`)
      })
    }
    setDragEmp(null)
  }

  const reorderInList = (teamId: string, listType: 'member' | 'manager', draggedId: string, beforeId: string | null) => {
    if (listType === 'member') {
      const ids = getTeamMemberIds(teamId)
      const reordered = ids.filter(id => id !== draggedId)
      const insertIdx = beforeId ? reordered.indexOf(beforeId) : reordered.length
      reordered.splice(insertIdx === -1 ? reordered.length : insertIdx, 0, draggedId)
      // ローカル更新
      setTeamMembers(prev => prev.map(m => {
        if (m.team_id !== teamId) return m
        const idx = reordered.indexOf(m.employee_id)
        return idx >= 0 ? { ...m, sort_order: idx } : m
      }))
      // DB更新
      Promise.all(reordered.map((id, i) =>
        supabase.from('team_members').update({ sort_order: i }).eq('team_id', teamId).eq('employee_id', id)
      ))
    } else {
      const mgrs = teamManagers.filter(m => m.team_id === teamId).sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
      const ids = mgrs.map(m => m.employee_id)
      const reordered = ids.filter(id => id !== draggedId)
      const insertIdx = beforeId ? reordered.indexOf(beforeId) : reordered.length
      reordered.splice(insertIdx === -1 ? reordered.length : insertIdx, 0, draggedId)
      setTeamManagers(prev => prev.map(m => {
        if (m.team_id !== teamId) return m
        const idx = reordered.indexOf(m.employee_id)
        return idx >= 0 ? { ...m, sort_order: idx } : m
      }))
      Promise.all(reordered.map((id, i) =>
        supabase.from('team_managers').update({ sort_order: i }).eq('team_id', teamId).eq('employee_id', id)
      ))
    }
  }

  const handlePromote = (role: 'primary' | 'secondary') => {
    if (!promoteDialog) return
    const { empId, teamId } = promoteDialog
    const existingPrimary = teamManagers.find(m => m.team_id === teamId && m.role === 'primary')

    if (role === 'primary' && existingPrimary) {
      // 主担当が既にいる → 競合ダイアログ
      setPrimaryConflict({ empId, teamId, existingPrimaryId: existingPrimary.employee_id })
      setPromoteDialog(null)
      return
    }

    doPromote(empId, teamId, role)
    setPromoteDialog(null)
  }

  const doPromote = (empId: string, teamId: string, role: 'primary' | 'secondary') => {
    startTransition(async () => {
      // 主担当入替: 既存主担当を副に降格
      if (role === 'primary') {
        const existingPrimary = teamManagers.find(m => m.team_id === teamId && m.role === 'primary')
        if (existingPrimary) {
          await supabase.from('team_managers').update({ role: 'secondary' }).eq('team_id', teamId).eq('employee_id', existingPrimary.employee_id)
          setTeamManagers(prev => prev.map(m =>
            m.team_id === teamId && m.employee_id === existingPrimary.employee_id ? { ...m, role: 'secondary' as const } : m
          ))
        }
      }
      // メンバーから削除
      await supabase.from('team_members').delete().eq('team_id', teamId).eq('employee_id', empId)
      // マネジャーに追加
      const { error } = await supabase.from('team_managers').insert({ team_id: teamId, employee_id: empId, role, sort_order: 999 })
      if (error) { toast.error('変更に失敗しました'); return }
      setTeamMembers(prev => prev.filter(m => !(m.team_id === teamId && m.employee_id === empId)))
      setTeamManagers(prev => [...prev, { team_id: teamId, employee_id: empId, role, sort_order: 999 }])
      const teamName = teams.find(t => t.id === teamId)?.name ?? ''
      await logDirectAction('add_manager', teamId, { team_name: teamName, employee_id: empId, employee_name: getEmployeeName(empId), role })
      toast.success(`${getEmployeeName(empId)}を${role === 'primary' ? '主' : '副'}担当リーダーに変更しました`)
    })
  }

  const handlePrimaryConflictResolve = (action: 'secondary' | 'member') => {
    if (!primaryConflict) return
    const { empId, teamId, existingPrimaryId } = primaryConflict
    const pending = pendingAddManager
    setPrimaryConflict(null)
    setPendingAddManager(null)

    startTransition(async () => {
      // まず既存主担当を処理（DB更新完了を確実に待つ）
      if (action === 'secondary') {
        const { error: demoteErr } = await supabase.from('team_managers').update({ role: 'secondary' }).eq('team_id', teamId).eq('employee_id', existingPrimaryId)
        if (demoteErr) { toast.error('降格に失敗しました'); return }
      } else {
        const { error: delErr } = await supabase.from('team_managers').delete().eq('team_id', teamId).eq('employee_id', existingPrimaryId)
        if (delErr) { toast.error('削除に失敗しました'); return }
        await supabase.from('team_members').insert({ team_id: teamId, employee_id: existingPrimaryId, sort_order: 999 })
      }

      // 新しい人を主担当に追加（既存主担当の降格完了後に実行）
      const newIds = pending ? pending.employeeIds : [empId]
      for (const id of newIds) {
        const { error } = await supabase.from('team_managers')
          .upsert({ team_id: teamId, employee_id: id, role: 'primary' as const, sort_order: 0 }, { onConflict: 'team_id,employee_id' })
        if (error) { toast.error('追加に失敗しました: ' + error.message); return }
        await supabase.from('team_members').delete().eq('team_id', teamId).eq('employee_id', id)
      }

      // ローカルstate更新（全部まとめて）
      if (action === 'secondary') {
        setTeamManagers(prev => prev.map(m =>
          m.team_id === teamId && m.employee_id === existingPrimaryId ? { ...m, role: 'secondary' as const } : m
        ))
      } else {
        setTeamManagers(prev => prev.filter(m => !(m.team_id === teamId && m.employee_id === existingPrimaryId)))
        setTeamMembers(prev => [...prev, { team_id: teamId, employee_id: existingPrimaryId, sort_order: 999 }])
      }
      setTeamMembers(prev => prev.filter(m => !(m.team_id === teamId && newIds.includes(m.employee_id))))
      setTeamManagers(prev => {
        // 既存マネジャーはrole更新、新規は追加
        const existingIds = new Set(prev.filter(m => m.team_id === teamId).map(m => m.employee_id))
        const updated = prev.map(m => m.team_id === teamId && newIds.includes(m.employee_id) ? { ...m, role: 'primary' as const, sort_order: 0 } : m)
        const newEntries = newIds.filter(id => !existingIds.has(id)).map(id => ({ team_id: teamId, employee_id: id, role: 'primary' as const, sort_order: 0 }))
        return [...updated, ...newEntries]
      })
      const teamName = teams.find(t => t.id === teamId)?.name ?? ''
      for (const id of newIds) {
        await logDirectAction('add_manager', teamId, { team_name: teamName, employee_id: id, employee_name: getEmployeeName(id), role: 'primary' })
      }
      toast.success(`${getEmployeeName(newIds[0])}を主担当リーダーに変更しました`)
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
            setTeamManagers(prev => [...prev, { team_id: newTeam.id, employee_id: managerId, role: 'primary' as const, sort_order: 0 }])
          }
        }

      } else if (req.request_type === 'add_member' && req.team_id) {
        const { error } = await supabase
          .from('team_members')
          .insert({ team_id: req.team_id, employee_id: payload.employee_id as string })
        if (error) { applyError = error }
        else {
          setTeamMembers(prev => [...prev, { team_id: req.team_id!, employee_id: payload.employee_id as string, sort_order: 999 }])
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
          setTeamManagers(prev => [...prev, { team_id: req.team_id!, employee_id: payload.employee_id as string, role, sort_order: 999 }])
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

  const getTeamMemberIds = (teamId: string) => {
    const mgrIds = new Set(teamManagers.filter(m => m.team_id === teamId).map(m => m.employee_id))
    return teamMembers
      .filter(m => m.team_id === teamId && !mgrIds.has(m.employee_id))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map(m => m.employee_id)
  }

  const getTeamManagerIds = (teamId: string) =>
    teamManagers.filter(m => m.team_id === teamId).sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(m => m.employee_id)

  const getTeamPrimaryManagerId = (teamId: string) =>
    teamManagers.find(m => m.team_id === teamId && m.role === 'primary')?.employee_id ?? null

  const getTeamSecondaryManagerIds = (teamId: string) =>
    teamManagers.filter(m => m.team_id === teamId && m.role === 'secondary').map(m => m.employee_id)

  const hasMyTeams = teams.some(t => getTeamManagerIds(t.id).includes(effectiveEmployee.id) || getTeamMemberIds(t.id).includes(effectiveEmployee.id))
  const shouldShowAll = showAllTeams || !hasMyTeams

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

      {/* 自分の所属（チーム・部署・店舗すべて） */}
      {(() => {
        const isMine = (t: Team) => getTeamManagerIds(t.id).includes(effectiveEmployee.id) || getTeamMemberIds(t.id).includes(effectiveEmployee.id)
        const typeOrder: Record<string, number> = { project: 0, department: 1, store: 2 }
        // プロジェクトと紐づいているチームを上に、紐づいていないものを下にする
        const hasProject = (t: Team) => (teamProjectNames[t.id]?.length ?? 0) > 0
        const myTeamsList = teams.filter(isMine).sort((a, b) => {
          const aHasProject = hasProject(a)
          const bHasProject = hasProject(b)
          if (aHasProject !== bHasProject) return aHasProject ? -1 : 1
          return (typeOrder[a.type] ?? 9) - (typeOrder[b.type] ?? 9)
        })
        if (myTeamsList.length === 0) return null
        return (
          <>
            <p className="text-xs font-semibold text-orange-600 mt-1 mb-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
              自分の所属
            </p>
            {myTeamsList.map(team => {
              const memberIds = getTeamMemberIds(team.id)
              const managerIds = getTeamManagerIds(team.id)
              const isManagedByMe = managerIds.includes(effectiveEmployee.id)
              const isExpanded = expandedTeams.has(`my-${team.id}`)
              return (
                <Card key={`my-${team.id}`} className="border-orange-200 bg-orange-50/50">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center gap-2">
                      <Badge className={`${TEAM_TYPE_COLORS[team.type]} text-[9px] border-0 flex-shrink-0`}>{TEAM_TYPE_LABELS[team.type]}</Badge>
                      <p className="text-sm font-medium text-gray-800 truncate flex-1">{team.name}</p>
                      {isManagedByMe && <Badge className="bg-orange-100 text-orange-700 text-[9px] border-0">リーダー</Badge>}
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400" onClick={() => toggleExpand(`my-${team.id}`)}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">メンバー {memberIds.length}名　担当リーダー {managerIds.length}名</p>
                    {teamProjectNames[team.id]?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {teamProjectNames[team.id].map(pn => (
                          <Badge key={pn} className="text-[9px] bg-violet-100 text-violet-700 border-0">{pn}</Badge>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="px-4 pb-3 space-y-2">
                      <div className="bg-white/70 border border-gray-200 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                            <span className="w-1 h-3 bg-gray-400 rounded-full" />メンバー
                          </p>
                          {!isReadOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-orange-600 hover:text-orange-800 px-2"
                              onClick={() => setInviteDialog({ teamId: team.id, teamName: team.name, asManager: false })}
                              disabled={isPending}
                            >
                              <Mail className="w-3 h-3 mr-1" />招待
                            </Button>
                          )}
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
                                <Link href={`/admin/employees/${empId}`} className="text-xs text-gray-700 hover:underline hover:text-orange-600" onClick={e => e.stopPropagation()}>{getEmployeeName(empId)}</Link>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div className="bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                            <span className="w-1 h-3 bg-amber-400 rounded-full" />担当リーダー
                          </p>
                          {!isReadOnly && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs text-orange-600 hover:text-orange-800 px-2"
                              onClick={() => setInviteDialog({ teamId: team.id, teamName: team.name, asManager: true })}
                              disabled={isPending}
                            >
                              <Mail className="w-3 h-3 mr-1" />招待
                            </Button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {managerIds.length === 0 && <p className="text-xs text-muted-foreground">担当なし</p>}
                          {teamManagers.filter(m => m.team_id === team.id).sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(manager => {
                            const emp = getEmployee(manager.employee_id)
                            const isPrimary = manager.role === 'primary'
                            return (
                              <div key={manager.employee_id} className={`flex items-center gap-1 ${isPrimary ? 'bg-amber-100' : 'bg-blue-100'} rounded-full pl-1 pr-2 py-0.5`}>
                                <span className={`text-[9px] font-bold ${isPrimary ? 'text-amber-600' : 'text-blue-500'}`}>{isPrimary ? '主' : '副'}</span>
                                <Avatar className="w-4 h-4 flex-shrink-0">
                                  <AvatarImage src={emp?.avatar_url ?? undefined} />
                                  <AvatarFallback className={`text-[8px] ${isPrimary ? 'bg-amber-300 text-amber-700' : 'bg-blue-300 text-blue-700'}`}>{emp?.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <Link href={`/admin/employees/${manager.employee_id}`} className={`text-xs hover:underline ${isPrimary ? 'text-amber-700 hover:text-amber-900' : 'text-blue-700 hover:text-blue-900'}`} onClick={e => e.stopPropagation()}>{getEmployeeName(manager.employee_id)}</Link>
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
            <button
              onClick={() => setShowAllTeams(prev => !prev)}
              className="w-full flex items-center gap-1.5 mt-3 mb-1 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showAllTeams ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              すべてのチーム・部署・店舗
            </button>
          </>
        )
      })()}

      {/* チーム (project) */}
      {shouldShowAll && [...teams].filter(t => t.type === 'project').sort((a, b) => {
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
                  <button
                    className="text-sm font-semibold text-gray-800 truncate text-left flex items-center gap-1 group"
                    onClick={() => isDirectEdit && setEditTeam({ id: team.id, name: team.name, type: team.type, prefecture: team.prefecture ?? '' })}
                    style={{ cursor: isDirectEdit ? 'pointer' : 'default' }}
                  >
                    {team.name}
                    {isDirectEdit && <Pencil className="w-3 h-3 text-gray-300 group-hover:text-orange-400 flex-shrink-0 opacity-0 group-hover:opacity-100" />}
                  </button>
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
              {teamProjectNames[team.id]?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {teamProjectNames[team.id].map(pn => (
                    <Badge key={pn} className="text-[9px] bg-violet-100 text-violet-700 border-0">{pn}</Badge>
                  ))}
                </div>
              )}
            </CardHeader>

            {isExpanded && (
              <CardContent className="px-4 pb-3 space-y-2">
                {/* メンバー */}
                <div className="bg-white/70 border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                      <span className="w-1 h-3 bg-gray-400 rounded-full" />メンバー
                    </p>
                    {!isReadOnly && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-orange-600 hover:text-orange-800 px-2"
                          onClick={() => setInviteDialog({ teamId: team.id, teamName: team.name, asManager: false })}
                          disabled={isPending}
                        >
                          <Mail className="w-3 h-3 mr-1" />招待
                        </Button>
                        {isDirectEdit ? (
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
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className={`flex flex-wrap gap-1.5 min-h-[28px] rounded-lg p-1 -m-1 transition-colors ${dropTarget === 'member' && dragEmp?.teamId === team.id ? 'bg-gray-200 ring-2 ring-gray-400 ring-dashed' : ''}`}
                    onDragOver={e => { e.preventDefault(); if (dragEmp?.teamId === team.id) setDropTarget('member') }}
                    onDragLeave={() => { setDropTarget(null); setDropBeforeId(null) }}
                    onDrop={() => handleDrop(team.id, 'member', dropBeforeId)}
                  >
                    {memberIds.length === 0 && (
                      <p className="text-xs text-muted-foreground">メンバーなし</p>
                    )}
                    {memberIds.map(empId => {
                      const emp = getEmployee(empId)
                      return (
                      <div key={empId}
                        draggable={isDirectEdit}
                        onDragStart={() => isDirectEdit && setDragEmp({ id: empId, teamId: team.id, from: 'member' })}
                        onDragEnd={() => { setDragEmp(null); setDropTarget(null); setDropBeforeId(null) }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragEmp?.teamId === team.id) { setDropTarget('member'); setDropBeforeId(empId) } }}
                        className={`flex items-center gap-1 bg-gray-100 rounded-full pl-0.5 pr-2 py-0.5 transition-all ${isDirectEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${dropBeforeId === empId && dragEmp?.from === 'member' && dragEmp?.id !== empId ? 'ring-2 ring-orange-400' : ''}`}
                      >
                        <Avatar className="w-4 h-4 flex-shrink-0">
                          <AvatarImage src={emp?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-[8px] bg-gray-300 text-gray-600">{emp?.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <Link href={`/admin/employees/${empId}`} className="text-xs text-gray-700 hover:underline hover:text-orange-600" onClick={e => e.stopPropagation()}>{getEmployeeName(empId)}</Link>
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
                <div className="bg-amber-50/60 border border-amber-200 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-amber-700 flex items-center gap-1">
                      <span className="w-1 h-3 bg-amber-400 rounded-full" />担当リーダー
                    </p>
                    {!isReadOnly && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-orange-600 hover:text-orange-800 px-2"
                          onClick={() => setInviteDialog({ teamId: team.id, teamName: team.name, asManager: true })}
                          disabled={isPending}
                        >
                          <Mail className="w-3 h-3 mr-1" />招待
                        </Button>
                        {isDirectEdit ? (
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
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className={`flex flex-wrap gap-1.5 min-h-[28px] rounded-lg p-1 -m-1 transition-colors ${dropTarget === 'manager' && dragEmp?.teamId === team.id ? 'bg-amber-100 ring-2 ring-amber-400 ring-dashed' : ''}`}
                    onDragOver={e => { e.preventDefault(); if (dragEmp?.teamId === team.id) setDropTarget('manager') }}
                    onDragLeave={() => { setDropTarget(null); setDropBeforeId(null) }}
                    onDrop={() => handleDrop(team.id, 'manager', dropBeforeId)}
                  >
                    {managerIds.length === 0 && (
                      <p className="text-xs text-muted-foreground">担当なし</p>
                    )}
                    {teamManagers
                      .filter(m => m.team_id === team.id)
                      .sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      .map(manager => {
                        const emp = getEmployee(manager.employee_id)
                        const isPrimary = manager.role === 'primary'
                        return (
                        <div key={manager.employee_id}
                          draggable={isDirectEdit}
                          onDragStart={() => isDirectEdit && setDragEmp({ id: manager.employee_id, teamId: team.id, from: 'manager' })}
                          onDragEnd={() => { setDragEmp(null); setDropTarget(null); setDropBeforeId(null) }}
                          onDragOver={e => { e.preventDefault(); e.stopPropagation(); if (dragEmp?.teamId === team.id) { setDropTarget('manager'); setDropBeforeId(manager.employee_id) } }}
                          className={`flex items-center gap-1 ${isPrimary ? 'bg-amber-100' : 'bg-blue-100'} rounded-full pl-1 pr-2 py-0.5 transition-all ${isDirectEdit ? 'cursor-grab active:cursor-grabbing' : ''} ${dropBeforeId === manager.employee_id && dragEmp?.from === 'manager' && dragEmp?.id !== manager.employee_id ? 'ring-2 ring-orange-400' : ''}`}
                        >
                          <span className={`text-[9px] font-bold ${isPrimary ? 'text-amber-600' : 'text-blue-500'}`}>{isPrimary ? '主' : '副'}</span>
                          <Avatar className="w-4 h-4 flex-shrink-0">
                            <AvatarImage src={emp?.avatar_url ?? undefined} />
                            <AvatarFallback className={`text-[8px] ${isPrimary ? 'bg-amber-300 text-amber-700' : 'bg-blue-300 text-blue-700'}`}>{emp?.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <Link href={`/admin/employees/${manager.employee_id}`} className={`text-xs hover:underline ${isPrimary ? 'text-amber-700 hover:text-amber-900' : 'text-blue-700 hover:text-blue-900'}`} onClick={e => e.stopPropagation()}>{getEmployeeName(manager.employee_id)}</Link>
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

      {/* 部署 (department) */}
      {shouldShowAll && [...teams].filter(t => t.type === 'department').sort((a, b) => a.name.localeCompare(b.name, 'ja')).map(team => {
        const memberIds = getTeamMemberIds(team.id)
        const managerIds = getTeamManagerIds(team.id)
        const isExpanded = expandedTeams.has(team.id)
        const isManagedByMe = managerIds.includes(effectiveEmployee.id)
        const isMemberOfMe = !isManagedByMe && memberIds.includes(effectiveEmployee.id)
        return (
          <Card key={team.id} className={`${isManagedByMe ? 'border-orange-300 bg-orange-50' : isMemberOfMe ? 'border-green-200 bg-green-50' : ''}`}>
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Badge className={`${TEAM_TYPE_COLORS[team.type]} text-xs border-0 flex-shrink-0`}>
                    {TEAM_TYPE_LABELS[team.type]}
                  </Badge>
                  <button
                    className="text-sm font-semibold text-gray-800 truncate text-left flex items-center gap-1 group"
                    onClick={() => isDirectEdit && setEditTeam({ id: team.id, name: team.name, type: team.type, prefecture: team.prefecture ?? '' })}
                    style={{ cursor: isDirectEdit ? 'pointer' : 'default' }}
                  >
                    {team.name}
                    {isDirectEdit && <Pencil className="w-3 h-3 text-gray-300 group-hover:text-orange-400 flex-shrink-0 opacity-0 group-hover:opacity-100" />}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400" onClick={() => toggleExpand(team.id)}>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                  {isDirectEdit && (
                    <Button
                      variant="ghost" size="sm"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setConfirmDialog({ title: '削除の確認', message: `部署「${team.name}」を削除しますか？`, confirmLabel: '削除する', confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white', onConfirm: () => handleDeleteTeam(team.id) })}
                      disabled={isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">メンバー {memberIds.length}名　担当リーダー {managerIds.length}名</p>
              {teamProjectNames[team.id]?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {teamProjectNames[team.id].map(pn => (
                    <Badge key={pn} className="text-[9px] bg-violet-100 text-violet-700 border-0">{pn}</Badge>
                  ))}
                </div>
              )}
            </CardHeader>
            {isExpanded && (
              <CardContent className="px-4 pb-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-600">メンバー</p>
                    {isDirectEdit && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-orange-500 px-2" onClick={() => setAddDialog({ teamId: team.id, type: 'member' })}>
                        <UserPlus className="w-3 h-3 mr-1" />追加
                      </Button>
                    )}
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
                          <Link href={`/admin/employees/${empId}`} className="text-xs text-gray-700 hover:underline hover:text-orange-600" onClick={e => e.stopPropagation()}>{getEmployeeName(empId)}</Link>
                          {isDirectEdit && (
                            <button onClick={() => setConfirmDialog({ title: 'メンバー削除', message: `${getEmployeeName(empId)} をこの部署から削除しますか？`, confirmLabel: '削除', confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white', onConfirm: () => handleRemoveMember(team.id, empId) })} className="text-gray-300 hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-gray-600">担当リーダー</p>
                    {isDirectEdit && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-orange-500 px-2" onClick={() => setAddDialog({ teamId: team.id, type: 'manager' })}>
                        <UserPlus className="w-3 h-3 mr-1" />追加
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {managerIds.length === 0 && <p className="text-xs text-muted-foreground">担当なし</p>}
                    {teamManagers.filter(m => m.team_id === team.id).map(manager => {
                      const emp = getEmployee(manager.employee_id)
                      const isPrimary = manager.role === 'primary'
                      return (
                        <div key={manager.employee_id} className={`flex items-center gap-1 ${isPrimary ? 'bg-amber-100' : 'bg-blue-100'} rounded-full pl-1 pr-2 py-0.5`}>
                          <span className={`text-[9px] font-bold ${isPrimary ? 'text-amber-600' : 'text-blue-500'}`}>{isPrimary ? '主' : '副'}</span>
                          <Avatar className="w-4 h-4 flex-shrink-0">
                            <AvatarImage src={emp?.avatar_url ?? undefined} />
                            <AvatarFallback className={`text-[8px] ${isPrimary ? 'bg-amber-300 text-amber-700' : 'bg-blue-300 text-blue-700'}`}>{emp?.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <Link href={`/admin/employees/${manager.employee_id}`} className={`text-xs hover:underline ${isPrimary ? 'text-amber-700 hover:text-amber-900' : 'text-blue-700 hover:text-blue-900'}`} onClick={e => e.stopPropagation()}>{getEmployeeName(manager.employee_id)}</Link>
                          {isDirectEdit && (
                            <button onClick={() => setConfirmDialog({ title: 'リーダー削除', message: `${getEmployeeName(manager.employee_id)} をリーダーから削除しますか？`, confirmLabel: '削除', confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white', onConfirm: () => handleRemoveManager(team.id, manager.employee_id) })} className={`${isPrimary ? 'text-amber-400' : 'text-blue-400'} hover:text-red-500 ml-0.5`}><X className="w-3 h-3" /></button>
                          )}
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

      {/* 店舗 (store) — 都道府県別折りたたみ */}
      {shouldShowAll && (() => {
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
                          <button
                            className="text-sm font-semibold text-gray-800 truncate text-left flex items-center gap-1 group"
                            onClick={() => isDirectEdit && setEditTeam({ id: storeTeam.id, name: storeTeam.name, type: storeTeam.type, prefecture: storeTeam.prefecture ?? '' })}
                            style={{ cursor: isDirectEdit ? 'pointer' : 'default' }}
                          >
                            {storeTeam.name}
                            {isDirectEdit && <Pencil className="w-3 h-3 text-gray-300 group-hover:text-orange-400 flex-shrink-0 opacity-0 group-hover:opacity-100" />}
                          </button>
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
                      {teamProjectNames[storeTeam.id]?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {teamProjectNames[storeTeam.id].map(pn => (
                            <Badge key={pn} className="text-[9px] bg-violet-100 text-violet-700 border-0">{pn}</Badge>
                          ))}
                        </div>
                      )}
                    </CardHeader>
                    {isExpanded && (
                      <CardContent className="px-4 pb-3 space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-medium text-gray-600">メンバー</p>
                            {isDirectEdit && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                                onClick={() => { setAddDialog({ type: 'member', teamId: storeTeam.id }); setSelectedEmployeeIds(new Set()) }} disabled={isPending}>
                                <UserPlus className="w-3 h-3 mr-1" />追加
                              </Button>
                            )}
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
                                  <Link href={`/admin/employees/${empId}`} className="text-xs text-gray-700 hover:underline hover:text-orange-600" onClick={e => e.stopPropagation()}>{getEmployeeName(empId)}</Link>
                                  {isDirectEdit && (
                                    <button onClick={() => setConfirmDialog({ title: 'メンバー削除', message: `${getEmployeeName(empId)} を「${storeTeam.name}」から削除しますか？`, confirmLabel: '削除', confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white', onConfirm: () => handleRemoveMember(storeTeam.id, empId) })} className="text-gray-300 hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-medium text-gray-600">担当リーダー</p>
                            {isDirectEdit && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-600 hover:text-blue-800 px-2"
                                onClick={() => { setAddDialog({ type: 'manager', teamId: storeTeam.id }); setSelectedEmployeeIds(new Set()) }} disabled={isPending}>
                                <UserPlus className="w-3 h-3 mr-1" />追加
                              </Button>
                            )}
                          </div>
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
                                  <Link href={`/admin/employees/${manager.employee_id}`} className={`text-xs hover:underline ${isPrimary ? 'text-amber-700 hover:text-amber-900' : 'text-blue-700 hover:text-blue-900'}`} onClick={e => e.stopPropagation()}>{getEmployeeName(manager.employee_id)}</Link>
                                  {isDirectEdit && (
                                    <button onClick={() => setConfirmDialog({ title: 'リーダー削除', message: `${getEmployeeName(manager.employee_id)} を「${storeTeam.name}」のリーダーから削除しますか？`, confirmLabel: '削除', confirmClassName: 'flex-1 bg-red-500 hover:bg-red-600 text-white', onConfirm: () => handleRemoveManager(storeTeam.id, manager.employee_id) })} className={`${isPrimary ? 'text-amber-400' : 'text-blue-400'} hover:text-red-500 ml-0.5`}><UserMinus className="w-3 h-3" /></button>
                                  )}
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
            {/* admin/ops_manager: 承認待ち件数 */}
            {isDirectEdit && pendingRequests.length > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-[10px] h-4 px-1 border-0">
                {pendingRequests.length}
              </Badge>
            )}
            {/* manager: 未読の承認結果件数 */}
            {!isDirectEdit && unreadResults.length > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-[10px] h-4 px-1 border-0">
                {unreadResults.length}
              </Badge>
            )}
            {/* manager: 自分の承認待ち申請件数 */}
            {!isDirectEdit && pendingMyCount > 0 && (
              <Badge className="ml-1 bg-amber-400 text-white text-[10px] h-4 px-1 border-0">
                承認中{pendingMyCount}
              </Badge>
            )}
          </TabsTrigger>
          {isDirectEdit && (
            <TabsTrigger value="review-history" className="text-xs">承認履歴</TabsTrigger>
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
                payload: { type: 'project' },
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
              承認待ち {pendingRequests.length}件
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
                          {req.reviewed_by ? getEmployeeName(req.reviewed_by) : '承認者'}：
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

        {/* ===== 承認履歴タブ (admin/ops_manager のみ) ===== */}
        {isDirectEdit && (
          <TabsContent value="review-history" className="mt-3 space-y-3">
            {reviewedRequests.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  承認履歴がありません
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
                        <p className="text-[10px] text-gray-400">承認: {fmtDateTime(req.reviewed_at)}</p>
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
              <p className="text-xs font-medium text-gray-600 mb-1">チーム名 <span className="text-red-500">*</span></p>
              <input
                type="text"
                value={newTeamName}
                onChange={e => setNewTeamName(e.target.value)}
                placeholder="例: 新人早期育成チーム、店長業務認定"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">
                ブランド（任意・複数選択可）
              </p>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                店舗・部署は「ブランド・店舗・部署管理」で作成してください
              </p>
              <div className="flex flex-wrap gap-1">
                {brands.length === 0 && (
                  <span className="text-[10px] text-gray-400">ブランド未登録（ブランド管理で作成）</span>
                )}
                {brands.map(b => {
                  const active = newTeamBrandIds.has(b.id)
                  return (
                    <button
                      key={b.id}
                      onClick={() => {
                        setNewTeamBrandIds(prev => {
                          const next = new Set(prev)
                          if (active) next.delete(b.id); else next.add(b.id)
                          return next
                        })
                      }}
                      className={`text-[11px] rounded-full px-2 py-0.5 border ${active ? 'text-white border-transparent' : 'text-gray-500 border-gray-300 bg-gray-50 hover:bg-gray-100'}`}
                      style={active ? { background: b.color ?? '#94a3b8' } : {}}
                    >
                      {active && '✓ '}{b.name}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">
                リーダー（主） <span className="text-red-500">*</span>
              </p>
              <select
                value={newTeamManagerId}
                onChange={e => { setNewTeamManagerId(e.target.value); setNewTeamSubManagerIds(prev => prev.filter(id => id !== e.target.value)) }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-300"
              >
                <option value="">選択してください</option>
                {managerCandidates.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">リーダー（副）</p>
              {newTeamSubManagerIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {newTeamSubManagerIds.map(id => (
                    <span key={id} className="flex items-center gap-1 bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 text-xs">
                      {getEmployeeName(id)}
                      <button onClick={() => setNewTeamSubManagerIds(prev => prev.filter(x => x !== id))} className="text-blue-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <select
                value=""
                onChange={e => { if (e.target.value && !newTeamSubManagerIds.includes(e.target.value) && e.target.value !== newTeamManagerId) { setNewTeamSubManagerIds(prev => [...prev, e.target.value]) } e.target.value = '' }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">追加する...</option>
                {managerCandidates.filter(emp => emp.id !== newTeamManagerId && !newTeamSubManagerIds.includes(emp.id)).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">メンバー</p>
              {newTeamMemberIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {newTeamMemberIds.map(id => (
                    <span key={id} className="flex items-center gap-1 bg-gray-100 text-gray-700 rounded-full px-2 py-0.5 text-xs">
                      {getEmployeeName(id)}
                      <button onClick={() => setNewTeamMemberIds(prev => prev.filter(x => x !== id))} className="text-gray-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <select
                value=""
                onChange={e => { if (e.target.value && !newTeamMemberIds.includes(e.target.value)) { setNewTeamMemberIds(prev => [...prev, e.target.value]) } e.target.value = '' }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-300"
              >
                <option value="">追加する...</option>
                {employees.filter(emp => !newTeamMemberIds.includes(emp.id)).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleCreateTeam}
              disabled={isPending || !newTeamName.trim() || !newTeamManagerId}
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
                          if (role === 'primary' && selectedEmployeeIds.size > 1) {
                            // 主担当は1名のみ: 最初の1名だけ残す
                            const first = [...selectedEmployeeIds][0]
                            setSelectedEmployeeIds(new Set([first]))
                          }
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
                  {/* 申請できるのはチームのみ（店舗・部署はマスタで管理者が作成） */}
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

      {/* チーム編集ダイアログ */}
      <Dialog open={editTeam !== null} onOpenChange={open => { if (!open) setEditTeam(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">チーム編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600">名前</label>
              <input
                className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400"
                value={editTeam?.name ?? ''}
                onChange={e => setEditTeam(prev => prev ? { ...prev, name: e.target.value } : prev)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">種別</label>
              <div className="flex gap-2 mt-1">
                {(['project', 'department', 'store'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setEditTeam(prev => prev ? { ...prev, type } : prev)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      editTeam?.type === type
                        ? `${TEAM_TYPE_COLORS[type]} border-current`
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {TEAM_TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>
            {editTeam?.type === 'store' && (
              <div>
                <label className="text-xs font-medium text-gray-600">都道府県</label>
                <select
                  className="w-full mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-400"
                  value={editTeam.prefecture}
                  onChange={e => setEditTeam(prev => prev ? { ...prev, prefecture: e.target.value } : prev)}
                >
                  <option value="">未設定</option>
                  {PREFECTURES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1" onClick={() => setEditTeam(null)} disabled={isPending}>
                キャンセル
              </Button>
              <Button className="flex-1 bg-orange-500 hover:bg-orange-600" onClick={handleSaveEditTeam} disabled={isPending || !editTeam?.name.trim()}>
                {isPending ? '保存中...' : '保存'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* メンバー→リーダー昇格ダイアログ */}
      <Dialog open={!!promoteDialog} onOpenChange={open => { if (!open) setPromoteDialog(null) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">リーダーに変更</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            <strong>{promoteDialog ? getEmployeeName(promoteDialog.empId) : ''}</strong> をリーダーに変更します。役割を選択してください。
          </p>
          <div className="flex gap-2">
            <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={() => handlePromote('primary')} disabled={isPending}>
              リーダー（主）
            </Button>
            <Button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white" onClick={() => handlePromote('secondary')} disabled={isPending}>
              リーダー（副）
            </Button>
          </div>
          <Button variant="outline" onClick={() => setPromoteDialog(null)} className="w-full">キャンセル</Button>
        </DialogContent>
      </Dialog>

      {/* 主担当競合ダイアログ */}
      <Dialog open={!!primaryConflict} onOpenChange={open => { if (!open) setPrimaryConflict(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">主担当の変更</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-gray-600 space-y-2">
            <p>現在のチームリーダー 主担当は <strong>{primaryConflict ? getEmployeeName(primaryConflict.existingPrimaryId) : ''}</strong> さんです。</p>
            <p>主担当はチームに一人のみ設定できます。</p>
            <p><strong>{primaryConflict ? getEmployeeName(primaryConflict.existingPrimaryId) : ''}</strong> さんの役割を選択してください。</p>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white" onClick={() => handlePrimaryConflictResolve('secondary')} disabled={isPending}>
              リーダー（副）
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => handlePrimaryConflictResolve('member')} disabled={isPending}>
              メンバー
            </Button>
          </div>
          <Button variant="outline" onClick={() => setPrimaryConflict(null)} className="w-full">キャンセル</Button>
        </DialogContent>
      </Dialog>

      {/* ===== 招待ダイアログ ===== */}
      {inviteDialog && (
        <InviteMemberDialog
          open={!!inviteDialog}
          onOpenChange={v => { if (!v) setInviteDialog(null) }}
          teamId={inviteDialog.teamId}
          teamName={inviteDialog.teamName}
          asManager={inviteDialog.asManager}
          inviterName={currentEmployee.name}
          candidates={(() => {
            const memberIds = new Set(teamMembers.filter(m => m.team_id === inviteDialog.teamId).map(m => m.employee_id))
            const managerIds = new Set(teamManagers.filter(m => m.team_id === inviteDialog.teamId).map(m => m.employee_id))
            return employees.filter(e =>
              e.status === 'approved' &&
              !memberIds.has(e.id) &&
              !managerIds.has(e.id)
            )
          })()}
        />
      )}
    </div>
  )
}
