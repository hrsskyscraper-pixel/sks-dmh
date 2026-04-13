'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { StoreSelect } from '@/components/ui/store-select'
import { CheckCircle, XCircle, UserPlus, GitPullRequest, Award, Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Tab = 'all' | 'skill' | 'team' | 'join' | 'done'

const REQUEST_TYPE_LABELS: Record<string, string> = {
  create_team: 'チーム作成',
  add_member: 'メンバー追加',
  remove_member: 'メンバー削除',
  add_manager: 'リーダー追加',
  remove_manager: 'リーダー削除',
}

const ROLE_OPTIONS_MANAGER = [
  { value: 'mate', label: 'メイト' },
  { value: 'employee', label: '社員' },
]
const ROLE_OPTIONS_ADMIN = [
  { value: 'mate', label: 'メイト' },
  { value: 'employee', label: '社員' },
  { value: 'store_manager', label: '店長' },
  { value: 'manager', label: 'マネジャー' },
  { value: 'ops_manager', label: '運用管理者' },
  { value: 'executive', label: '役員' },
]

interface Props {
  pendingAchievements: any[]
  pendingTeamRequests: any[]
  pendingJoins: any[]
  teamMap: Record<string, { id: string; name: string; type: string; prefecture: string | null }>
  projectTeams: { id: string; name: string }[]
  currentEmployeeId: string
  isSystemAdmin: boolean
  approverRole: string
  storeDeptTeams: { id: string; name: string; type: 'store' | 'project' | 'department'; prefecture: string | null }[]
  recentAchievements: any[]
  recentTeamRequests: any[]
  recentJoins: any[]
  reviewerMap: Record<string, { id: string; name: string; avatar_url: string | null }>
  auditLogs: any[]
}

export function ApprovalCenter({
  pendingAchievements, pendingTeamRequests, pendingJoins,
  teamMap, projectTeams, currentEmployeeId, isSystemAdmin, approverRole, storeDeptTeams,
  recentAchievements, recentTeamRequests, recentJoins, reviewerMap, auditLogs,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>('all')
  const [doneFilter, setDoneFilter] = useState<'all' | 'skill' | 'team' | 'join' | 'audit'>('all')
  const [donePersonFilter, setDonePersonFilter] = useState<'all' | 'actor' | 'target' | 'member'>('all')
  const [memberFilterId, setMemberFilterId] = useState<string | null>(null)
  const [memberFilterRole, setMemberFilterRole] = useState<'both' | 'actor' | 'target'>('both')
  const [memberPickerOpen, setMemberPickerOpen] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const supabase = createClient()

  // チャット風履歴
  const [chatAchId, setChatAchId] = useState<string | null>(null)
  const [chatSkillName, setChatSkillName] = useState('')
  const [chatHistory, setChatHistory] = useState<{ id: string; action: string; actor_name: string; actor_avatar: string | null; comment: string | null; created_at: string }[]>([])
  const [chatLoading, setChatLoading] = useState(false)

  const openChat = async (achievementId: string, skillName: string) => {
    setChatAchId(achievementId)
    setChatSkillName(skillName)
    setChatLoading(true)
    setChatHistory([])
    const res = await fetch(`/api/achievement-history?id=${achievementId}`)
    const data = await res.json()
    setChatHistory(data)
    setChatLoading(false)
  }

  // スキル認定
  const [certifyComment, setCertifyComment] = useState('')
  const [certifyTarget, setCertifyTarget] = useState<any>(null)
  const [certifyAction, setCertifyAction] = useState<'certified' | 'rejected'>('certified')

  const handleCertify = () => {
    if (!certifyTarget) return
    startTransition(async () => {
      const res = await fetch('/api/certify-skill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          achievementId: certifyTarget.id,
          action: certifyAction,
          comment: certifyComment.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? '更新に失敗しました')
        return
      }
      toast.success(certifyAction === 'certified' ? '認定しました' : '差し戻しました')
      setCertifyTarget(null)
      setCertifyComment('')
      window.location.reload()
    })
  }

  // チーム変更
  const handleTeamRequest = (requestId: string, action: 'approved' | 'rejected') => {
    startTransition(async () => {
      const { error } = await supabase.from('team_change_requests').update({
        status: action,
        reviewed_by: currentEmployeeId,
        reviewed_at: new Date().toISOString(),
      }).eq('id', requestId)
      if (error) { toast.error('更新に失敗しました'); return }
      toast.success(action === 'approved' ? '承認しました' : '差し戻しました')
      window.location.reload()
    })
  }

  // 参加許諾
  const [joinTarget, setJoinTarget] = useState<any>(null)
  const [joinName, setJoinName] = useState('')
  const [joinTeamId, setJoinTeamId] = useState('')
  const [joinProjectTeamId, setJoinProjectTeamId] = useState('')
  const [joinRole, setJoinRole] = useState('')
  const roleOptions = isSystemAdmin ? ROLE_OPTIONS_ADMIN : ROLE_OPTIONS_MANAGER

  const openJoinApproval = (emp: any) => {
    setJoinTarget(emp)
    setJoinName(emp.name)
    setJoinTeamId(emp.requested_team_id ?? '')
    setJoinProjectTeamId('')
    setJoinRole('')
  }

  const handleJoinApprove = () => {
    if (!joinTarget || !joinRole) return
    startTransition(async () => {
      const res = await fetch('/api/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: joinTarget.id,
          name: joinName.trim(),
          teamId: joinTeamId || null,
          projectTeamId: joinProjectTeamId || null,
          role: joinRole,
          approvedBy: currentEmployeeId,
        }),
      })
      if (res.ok) {
        toast.success(`${joinName} さんの参加を承認しました`)
        setJoinTarget(null)
        window.location.reload()
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? '承認に失敗しました')
      }
    })
  }

  // 統合リスト作成
  type Item = { type: 'skill' | 'team' | 'join'; date: string; data: any }
  const items: Item[] = []

  for (const a of pendingAchievements) {
    items.push({ type: 'skill', date: a.created_at, data: a })
  }
  for (const r of pendingTeamRequests) {
    items.push({ type: 'team', date: r.created_at, data: r })
  }
  for (const j of pendingJoins) {
    items.push({ type: 'join', date: j.created_at, data: j })
  }
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filtered = tab === 'all' ? items : items.filter(i => i.type === tab)

  const counts = {
    all: items.length,
    skill: pendingAchievements.length,
    team: pendingTeamRequests.length,
    join: pendingJoins.length,
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

  const fmtTime = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    if (diff < 60000) return 'たった今'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`
    return `${Math.floor(diff / 86400000)}日前`
  }

  // 処理済み統合リスト
  type DoneItem = { type: 'skill' | 'team' | 'join' | 'audit'; date: string; data: any; actorId?: string; targetId?: string }
  const doneItems: DoneItem[] = []
  for (const a of recentAchievements) doneItems.push({ type: 'skill', date: a.certified_at, data: a, actorId: a.certified_by, targetId: a.employee_id })
  for (const r of recentTeamRequests) doneItems.push({ type: 'team', date: r.reviewed_at, data: r, actorId: r.reviewed_by, targetId: r.requested_by })
  for (const j of recentJoins) doneItems.push({ type: 'join', date: j.approved_at ?? j.updated_at, data: j, actorId: j.approved_by, targetId: j.id })
  for (const log of auditLogs.filter(l => l.action !== 'approve_join')) {
    doneItems.push({ type: 'audit', date: log.created_at, data: log, actorId: log.actor_id, targetId: log.target_id })
  }
  doneItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  let filteredDone = doneFilter === 'all' ? doneItems : doneItems.filter(i => i.type === doneFilter)
  if (donePersonFilter === 'actor') filteredDone = filteredDone.filter(i => i.actorId === currentEmployeeId)
  else if (donePersonFilter === 'target') filteredDone = filteredDone.filter(i => i.targetId === currentEmployeeId)
  else if (donePersonFilter === 'member' && memberFilterId) {
    if (memberFilterRole === 'actor') filteredDone = filteredDone.filter(i => i.actorId === memberFilterId)
    else if (memberFilterRole === 'target') filteredDone = filteredDone.filter(i => i.targetId === memberFilterId)
    else filteredDone = filteredDone.filter(i => i.actorId === memberFilterId || i.targetId === memberFilterId)
  }

  // メンバー一覧（reviewerMapから取得）
  const memberList = Object.values(reviewerMap).sort((a, b) => a.name.localeCompare(b.name))
  const filteredMembers = memberSearch
    ? memberList.filter(m => m.name.includes(memberSearch))
    : memberList

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'all', label: 'すべて', count: counts.all },
    { key: 'skill', label: 'スキル認定', count: counts.skill },
    { key: 'team', label: 'チーム変更', count: counts.team },
    { key: 'join', label: '参加許諾', count: counts.join },
    { key: 'done', label: '処理済み', count: doneItems.length },
  ]

  return (
    <div className="px-4 py-4 space-y-3">
      {/* タブ */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className={`min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold ${
                tab === t.key ? 'bg-white/30 text-white' : 'bg-orange-100 text-orange-600'
              }`}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* 処理済みタブ */}
      {tab === 'done' ? (
        <div className="space-y-2">
          {/* サブフィルタ */}
          <div className="flex gap-1 overflow-x-auto pb-1">
            {([['all', 'すべて'], ['skill', 'スキル認定'], ['team', 'チーム変更'], ['join', '参加許諾'], ['audit', '管理操作']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setDoneFilter(key)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                  doneFilter === key ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>{label}</button>
            ))}
          </div>
          {/* 承認者/申請者フィルタ */}
          <div className="flex gap-1 flex-wrap">
            {([['all', '全員'], ['actor', '自分が処理'], ['target', '自分が対象']] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setDonePersonFilter(key); setMemberFilterId(null); setMemberPickerOpen(false) }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                  donePersonFilter === key ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
                }`}>{label}</button>
            ))}
            <button
              onClick={() => { setDonePersonFilter('member'); setMemberPickerOpen(true); setMemberSearch('') }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                donePersonFilter === 'member' ? 'bg-orange-500 text-white' : 'bg-orange-50 text-orange-600 hover:bg-orange-100'
              }`}
            >
              {donePersonFilter === 'member' && memberFilterId
                ? `${reviewerMap[memberFilterId]?.name ?? 'メンバー'}`
                : 'メンバーで絞込'}
            </button>
          </div>
          {/* メンバー選択パネル */}
          {donePersonFilter === 'member' && memberPickerOpen && (
            <Card className="border border-orange-200">
              <CardContent className="py-3 px-3 space-y-2">
                <Input
                  placeholder="名前で検索..."
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  className="h-8 text-sm"
                  autoFocus
                />
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filteredMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setMemberFilterId(m.id); setMemberPickerOpen(false) }}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-sm hover:bg-orange-50 transition-colors ${
                        memberFilterId === m.id ? 'bg-orange-100 font-medium' : ''
                      }`}
                    >
                      <Avatar className="w-6 h-6 flex-shrink-0">
                        <AvatarImage src={m.avatar_url ?? undefined} />
                        <AvatarFallback className="text-[9px] bg-gray-100 text-gray-600">{m.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))}
                  {filteredMembers.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">該当なし</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          {/* メンバー絞込時のサブフィルタ */}
          {donePersonFilter === 'member' && memberFilterId && (
            <div className="flex gap-1">
              {([['both', '両方'], ['actor', '処理者として'], ['target', '対象者として']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setMemberFilterRole(key)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                    memberFilterRole === key ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>{label}</button>
              ))}
            </div>
          )}
          {filteredDone.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Inbox className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">処理済みの履歴はありません</p>
            </div>
          ) : filteredDone.map((item, idx) => {
            if (item.type === 'skill') {
              const a = item.data
              const emp = a.employees
              const skill = a.skills
              const certifier = a.certifier ?? reviewerMap[a.certified_by]
              const isCertified = a.status === 'certified'
              return (
                <Card key={`done-skill-${a.id}`} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => openChat(a.id, skill?.name ?? '')}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarImage src={emp?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs bg-green-100 text-green-700">{emp?.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className="text-[9px] bg-green-100 text-green-700 border-0">スキル認定</Badge>
                          <Badge className={`text-[9px] border-0 ${isCertified ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {isCertified ? '認定' : '差し戻し'}
                          </Badge>
                          <span className="text-xs text-gray-400">{fmtTime(a.certified_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {emp?.name} — <span className={isCertified ? 'text-green-600' : 'text-red-500'}>{skill?.name}</span>
                        </p>
                        {a.certify_comment && <p className="text-xs text-gray-500 mt-0.5">{a.certify_comment}</p>}
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                          <span>申請: {fmtDate(a.created_at)}</span>
                          <span>{isCertified ? '認定' : '差戻'}: {fmtDate(a.certified_at)} ({certifier?.name ?? '不明'})</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }
            if (item.type === 'team') {
              const r = item.data
              const emp = r.employees
              const reviewer = reviewerMap[r.reviewed_by]
              const payload = r.payload as Record<string, any>
              const isApproved = r.status === 'approved'
              return (
                <Card key={`done-team-${r.id}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarImage src={emp?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs bg-purple-100 text-purple-700">{emp?.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className="text-[9px] bg-purple-100 text-purple-700 border-0">チーム変更</Badge>
                          <Badge className={`text-[9px] border-0 ${isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {isApproved ? '承認' : '差し戻し'}
                          </Badge>
                          <Badge className="text-[9px] bg-gray-100 text-gray-600 border-0">{REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}</Badge>
                          <span className="text-xs text-gray-400">{fmtTime(r.reviewed_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {emp?.name} — {payload?.team_name ?? teamMap[r.team_id]?.name ?? ''}
                        </p>
                        {r.review_comment && <p className="text-xs text-gray-500 mt-0.5">{r.review_comment}</p>}
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                          <span>申請: {fmtDate(r.created_at)}</span>
                          <span>{isApproved ? '承認' : '差戻'}: {fmtDate(r.reviewed_at)} ({reviewer?.name ?? '不明'})</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }
            if (item.type === 'join') {
              const j = item.data
              const teamName = teamMap[j.requested_team_id]?.name ?? ''
              const projectTeamName = j.requested_project_team_id ? teamMap[j.requested_project_team_id]?.name ?? '' : ''
              const approver = j.approved_by ? reviewerMap[j.approved_by] : null
              return (
                <Card key={`done-join-${j.id}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarImage src={j.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{j.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className="text-[9px] bg-blue-100 text-blue-700 border-0">参加許諾</Badge>
                          <Badge className="text-[9px] bg-emerald-100 text-emerald-700 border-0">承認済</Badge>
                          <span className="text-xs text-gray-400">{j.approved_at ? fmtTime(j.approved_at) : fmtTime(j.updated_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {j.name} <span className="text-xs text-gray-500">({j.email})</span>
                        </p>
                        {teamName && <p className="text-xs text-blue-500 mt-0.5">店舗: {teamName}</p>}
                        {projectTeamName && <p className="text-xs text-blue-500">チーム: {projectTeamName}</p>}
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                          <span>申請: {fmtDate(j.created_at)}</span>
                          {j.approved_at && <span>承認: {fmtDate(j.approved_at)}{approver ? ` (${approver.name})` : ''}</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }
            if (item.type === 'audit') {
              const log = item.data
              const actor = reviewerMap[log.actor_id]
              const target = reviewerMap[log.target_id]
              const details = log.details as Record<string, any>
              const AUDIT_LABELS: Record<string, string> = {
                change_role: 'ロール変更',
                approve_join: '参加承認',
              }
              const ROLE_LABELS: Record<string, string> = {
                employee: '社員', store_manager: '店長', manager: 'マネジャー',
                admin: '開発者', ops_manager: '運用管理者', executive: '役員',
              }
              const desc = log.action === 'change_role'
                ? `${ROLE_LABELS[details.old_role] ?? details.old_role} → ${ROLE_LABELS[details.new_role] ?? details.new_role}`
                : ''
              return (
                <Card key={`done-audit-${log.id}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarImage src={target?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs bg-amber-100 text-amber-700">{target?.name?.charAt(0) ?? '?'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge className="text-[9px] bg-amber-100 text-amber-700 border-0">管理操作</Badge>
                          <Badge className="text-[9px] bg-gray-100 text-gray-600 border-0">{AUDIT_LABELS[log.action] ?? log.action}</Badge>
                          <span className="text-xs text-gray-400">{fmtTime(log.created_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {details.target_name ?? target?.name ?? '不明'} {desc && <span className="text-amber-600">{desc}</span>}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          実行: {actor?.name ?? '不明'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }
            return null
          })}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Inbox className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p className="text-sm">承認待ちはありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item, i) => {
            if (item.type === 'skill') {
              const a = item.data
              const emp = a.employees
              const skill = a.skills
              return (
                <Card key={`skill-${a.id}`} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => openChat(a.id, skill?.name ?? '')}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarImage src={emp?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs bg-orange-100 text-orange-700">{emp?.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge className="text-[9px] bg-green-100 text-green-700 border-0">スキル認定</Badge>
                          <span className="text-xs text-gray-400">{fmtTime(a.created_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {emp?.name} — <span className="text-orange-600">{skill?.name}</span>
                        </p>
                        {a.apply_comment && <p className="text-xs text-gray-500 mt-0.5">{a.apply_comment}</p>}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" className="h-7 px-2 bg-green-500 hover:bg-green-600 text-[11px]"
                          onClick={(e) => { e.stopPropagation(); setCertifyTarget(a); setCertifyAction('certified'); setCertifyComment('') }}
                          disabled={isPending}>
                          <CheckCircle className="w-3 h-3 mr-0.5" />認定
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-red-500 border-red-200 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); setCertifyTarget(a); setCertifyAction('rejected'); setCertifyComment('') }}
                          disabled={isPending}>
                          <XCircle className="w-3 h-3 mr-0.5" />戻す
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            if (item.type === 'team') {
              const r = item.data
              const emp = r.employees
              const payload = r.payload as Record<string, any>
              return (
                <Card key={`team-${r.id}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarImage src={emp?.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs bg-purple-100 text-purple-700">{emp?.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge className="text-[9px] bg-purple-100 text-purple-700 border-0">チーム変更</Badge>
                          <Badge className="text-[9px] bg-gray-100 text-gray-600 border-0">{REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}</Badge>
                          <span className="text-xs text-gray-400">{fmtTime(r.created_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {emp?.name} — {payload?.team_name ?? teamMap[r.team_id]?.name ?? ''}
                        </p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <Button size="sm" className="h-7 px-2 bg-green-500 hover:bg-green-600 text-[11px]"
                          onClick={() => handleTeamRequest(r.id, 'approved')} disabled={isPending}>
                          <CheckCircle className="w-3 h-3 mr-0.5" />承認
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-red-500 border-red-200 hover:bg-red-50"
                          onClick={() => handleTeamRequest(r.id, 'rejected')} disabled={isPending}>
                          <XCircle className="w-3 h-3 mr-0.5" />差し戻し
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            if (item.type === 'join') {
              const j = item.data
              const teamName = teamMap[j.requested_team_id]?.name ?? ''
              const projectTeamName = j.requested_project_team_id ? teamMap[j.requested_project_team_id]?.name ?? '' : ''
              return (
                <Card key={`join-${j.id}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-9 h-9 flex-shrink-0">
                        <AvatarImage src={j.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{j.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge className="text-[9px] bg-blue-100 text-blue-700 border-0">参加許諾</Badge>
                          <span className="text-xs text-gray-400">{fmtTime(j.created_at)}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mt-0.5">
                          {j.name} <span className="text-xs text-gray-500">({j.email})</span>
                        </p>
                        {teamName && <p className="text-xs text-orange-500">店舗: {teamName}</p>}
                        {projectTeamName && <p className="text-xs text-orange-500">チーム: {projectTeamName}</p>}
                      </div>
                      <Button size="sm" className="h-7 px-2 bg-blue-500 hover:bg-blue-600 text-[11px] flex-shrink-0"
                        onClick={() => openJoinApproval(j)} disabled={isPending}>
                        <UserPlus className="w-3 h-3 mr-0.5" />確認
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            }
            return null
          })}
        </div>
      )}

      {/* スキル認定ダイアログ */}
      <Dialog open={!!certifyTarget} onOpenChange={() => setCertifyTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {certifyAction === 'certified' ? 'スキルを認定' : 'スキルを差し戻し'}
            </DialogTitle>
            <DialogDescription>
              {certifyTarget?.employees?.name} — {certifyTarget?.skills?.name}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={certifyComment}
            onChange={e => setCertifyComment(e.target.value)}
            placeholder="コメント（任意）"
            rows={2}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCertifyTarget(null)}>キャンセル</Button>
            <Button
              className={certifyAction === 'certified' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}
              onClick={handleCertify} disabled={isPending}
            >
              {certifyAction === 'certified' ? '認定する' : '差し戻す'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 参加許諾ダイアログ */}
      <Dialog open={!!joinTarget} onOpenChange={() => setJoinTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">参加を承認</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-gray-500">氏名</Label>
              <Input value={joinName} onChange={e => setJoinName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-gray-500">店舗／部署</Label>
              <div className="mt-1">
                <StoreSelect teams={storeDeptTeams} value={joinTeamId} onChange={setJoinTeamId} placeholder="未設定" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-gray-500">チーム</Label>
              <Select value={joinProjectTeamId} onValueChange={setJoinProjectTeamId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="未設定" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">（未設定）</SelectItem>
                  {projectTeams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">ロール <span className="text-red-500">*</span></Label>
              <Select value={joinRole} onValueChange={setJoinRole}>
                <SelectTrigger className={`mt-1 ${!joinRole ? 'border-red-300' : ''}`}><SelectValue placeholder="選択してください" /></SelectTrigger>
                <SelectContent>
                  {roleOptions.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJoinTarget(null)}>キャンセル</Button>
            <Button className="bg-green-500 hover:bg-green-600" onClick={handleJoinApprove} disabled={isPending || !joinRole}>
              承認する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* チャット風履歴ダイアログ */}
      <Dialog open={!!chatAchId} onOpenChange={() => setChatAchId(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{chatSkillName}の履歴</DialogTitle>
          </DialogHeader>
          {chatLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chatHistory.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">履歴はまだありません</p>
          ) : (
            <div className="space-y-3">
              {chatHistory.map(h => {
                const isApplicant = h.action === 'apply' || h.action === 'reapply'
                const actionLabels: Record<string, string> = { apply: '申請', reapply: '再申請', reject: '差し戻し', certify: '認定' }
                const actionColors: Record<string, string> = { apply: 'bg-orange-500', reapply: 'bg-orange-500', reject: 'bg-red-500', certify: 'bg-green-500' }
                const fmtDt = (d: string) => new Date(d).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                return (
                  <div key={h.id} className={`flex gap-2 ${isApplicant ? 'flex-row-reverse' : 'flex-row'}`}>
                    {h.actor_avatar ? (
                      <img src={h.actor_avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-4" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 mt-4">
                        <span className="text-[10px] text-gray-500 font-bold">{h.actor_name?.charAt(0)}</span>
                      </div>
                    )}
                    <div className={`flex flex-col ${isApplicant ? 'items-end' : 'items-start'} flex-1 min-w-0`}>
                      <div className={`flex items-center gap-1.5 mb-0.5 ${isApplicant ? 'flex-row-reverse' : ''}`}>
                        <span className={`text-[9px] text-white px-1.5 py-0.5 rounded-full ${actionColors[h.action] ?? 'bg-gray-500'}`}>
                          {actionLabels[h.action] ?? h.action}
                        </span>
                        <span className="text-[10px] text-gray-500">{h.actor_name}</span>
                        <span className="text-[10px] text-gray-400">{fmtDt(h.created_at)}</span>
                      </div>
                      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                        isApplicant
                          ? 'bg-orange-100 text-orange-900 rounded-tr-sm'
                          : h.action === 'certify'
                            ? 'bg-green-100 text-green-900 rounded-tl-sm'
                            : 'bg-red-100 text-red-900 rounded-tl-sm'
                      }`}>
                        {h.comment || (isApplicant ? '申請しました' : h.action === 'certify' ? '認定しました' : '差し戻しました')}
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* 最後が申請/再申請なら認定/戻すボタン */}
              {chatHistory.length > 0 && (() => {
                const last = chatHistory[chatHistory.length - 1]
                if (last.action !== 'apply' && last.action !== 'reapply') return null
                const ach = pendingAchievements.find((a: any) => a.id === chatAchId)
                if (!ach) return null
                return (
                  <div className="flex justify-center gap-2 pt-3 border-t mt-3">
                    <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => { setChatAchId(null); setCertifyTarget(ach); setCertifyAction('certified'); setCertifyComment('') }}
                      disabled={isPending}>
                      <CheckCircle className="w-3.5 h-3.5 mr-1" />認定
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => { setChatAchId(null); setCertifyTarget(ach); setCertifyAction('rejected'); setCertifyComment('') }}
                      disabled={isPending}>
                      <XCircle className="w-3.5 h-3.5 mr-1" />戻す
                    </Button>
                  </div>
                )
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
