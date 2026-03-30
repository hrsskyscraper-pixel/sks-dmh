'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { CheckCircle, UserPlus, XCircle } from 'lucide-react'
import { toast } from 'sonner'

interface PendingEmployee {
  id: string
  name: string
  email: string
  avatar_url: string | null
  requested_team_id: string | null
  created_at: string
}

interface Props {
  pendingEmployees: PendingEmployee[]
  teams: { id: string; name: string; type: string }[]
  projects: { id: string; name: string }[]
  currentEmployeeId: string
  isSystemAdmin: boolean
}

export function ApprovalManager({ pendingEmployees, teams, projects, currentEmployeeId, isSystemAdmin }: Props) {
  const router = useRouter()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<PendingEmployee | null>(null)
  const [processing, setProcessing] = useState(false)

  // 承認設定の状態
  const [settings, setSettings] = useState<Record<string, {
    teamId: string
    projectId: string
    employmentType: '社員' | 'メイト'
    role: string
  }>>({})

  const getSettings = (empId: string, requestedTeamId: string | null) => {
    return settings[empId] ?? {
      teamId: requestedTeamId ?? '',
      projectId: projects[0]?.id ?? '',
      employmentType: '社員' as const,
      role: 'employee',
    }
  }

  const updateSetting = (empId: string, requestedTeamId: string | null, key: string, value: string) => {
    const current = getSettings(empId, requestedTeamId)
    setSettings(prev => ({ ...prev, [empId]: { ...current, [key]: value } }))
  }

  const handleApprove = async (emp: PendingEmployee) => {
    setProcessing(true)
    const s = getSettings(emp.id, emp.requested_team_id)

    const res = await fetch('/api/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: emp.id,
        teamId: s.teamId,
        projectId: s.projectId,
        employmentType: s.employmentType,
        role: s.role,
        approvedBy: currentEmployeeId,
      }),
    })

    if (res.ok) {
      toast.success(`${emp.name} さんの参加を承認しました`)
      setConfirmTarget(null)
      setExpandedId(null)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? '承認に失敗しました')
    }
    setProcessing(false)
  }

  if (pendingEmployees.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <UserPlus className="w-10 h-10 mx-auto mb-3 opacity-50" />
        <p className="text-sm">参加待ちのメンバーはいません</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {pendingEmployees.map(emp => {
          const isExpanded = expandedId === emp.id
          const s = getSettings(emp.id, emp.requested_team_id)
          const requestedTeam = teams.find(t => t.id === emp.requested_team_id)
          const daysSince = Math.floor((Date.now() - new Date(emp.created_at).getTime()) / 86400000)

          return (
            <Card key={emp.id} className="overflow-hidden">
              <CardContent className="p-4">
                {/* 基本情報 */}
                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : emp.id)}>
                  <Avatar className="w-10 h-10">
                    <AvatarImage src={emp.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-orange-100 text-orange-600 font-bold">
                      {emp.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">{emp.name}</p>
                    <p className="text-xs text-gray-400 truncate">{emp.email}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">{daysSince === 0 ? '今日' : `${daysSince}日前`}</p>
                    {requestedTeam && (
                      <p className="text-xs text-orange-500 font-medium">{requestedTeam.name}</p>
                    )}
                  </div>
                </div>

                {/* 展開時の設定 */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t space-y-3">
                    <div>
                      <Label className="text-xs text-gray-500">店舗／部署</Label>
                      <Select value={s.teamId} onValueChange={v => updateSetting(emp.id, emp.requested_team_id, 'teamId', v)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {teams.map(t => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs text-gray-500">プロジェクト</Label>
                      <Select value={s.projectId} onValueChange={v => updateSetting(emp.id, emp.requested_team_id, 'projectId', v)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {projects.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs text-gray-500">雇用形態</Label>
                      <Select value={s.employmentType} onValueChange={v => updateSetting(emp.id, emp.requested_team_id, 'employmentType', v)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="社員">社員</SelectItem>
                          <SelectItem value="メイト">メイト</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {isSystemAdmin && (
                      <div>
                        <Label className="text-xs text-gray-500">ロール</Label>
                        <Select value={s.role} onValueChange={v => updateSetting(emp.id, emp.requested_team_id, 'role', v)}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">一般社員</SelectItem>
                            <SelectItem value="store_manager">店長</SelectItem>
                            <SelectItem value="manager">マネージャー</SelectItem>
                            <SelectItem value="admin">管理者</SelectItem>
                            <SelectItem value="ops_manager">運用管理者</SelectItem>
                            <SelectItem value="executive">役員</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button
                        className="flex-1 bg-green-500 hover:bg-green-600"
                        onClick={() => setConfirmTarget(emp)}
                        disabled={!s.teamId || !s.projectId}
                      >
                        <CheckCircle className="w-4 h-4 mr-1.5" />
                        承認
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* 確認ダイアログ */}
      <Dialog open={!!confirmTarget} onOpenChange={() => setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>参加を承認しますか？</DialogTitle>
            <DialogDescription>
              {confirmTarget?.name} さん（{confirmTarget?.email}）のシステム参加を承認します。
              承認後、本人にメール通知が送信されます。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)} disabled={processing}>
              キャンセル
            </Button>
            <Button
              className="bg-green-500 hover:bg-green-600"
              onClick={() => confirmTarget && handleApprove(confirmTarget)}
              disabled={processing}
            >
              {processing ? '処理中...' : '承認する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
