'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import type { Employee, Skill, Achievement } from '@/types/database'

interface AchievementWithRelations extends Achievement {
  skills: Skill | null
  employees: Employee | null
}

interface EmpStat {
  standardPct: number
  totalSkills: number
  storeName: string | null
}

interface Props {
  currentEmployee: Employee
  employees: Employee[]
  skills: Skill[]
  achievements: AchievementWithRelations[]
  priorityMemberIds?: Set<string>
  managedTeams?: { id: string; name: string }[]
  managedTeamMembers?: { team_id: string; employee_id: string }[]
  empStatsMap?: Record<string, EmpStat>
}

function calcHireYear(hireDate: string | null): number {
  if (!hireDate) return 1
  const hire = new Date(hireDate)
  const today = new Date()
  const hireFY = hire.getMonth() >= 3 ? hire.getFullYear() : hire.getFullYear() - 1
  const todayFY = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return Math.max(1, todayFY - hireFY + 1)
}

export function TeamDashboard({ currentEmployee, employees, skills, achievements: initialAchievements, priorityMemberIds, managedTeams = [], managedTeamMembers = [], empStatsMap = {} }: Props) {
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab') === 'pending' ? 'pending' : 'overview'
  const [achievements, setAchievements] = useState(initialAchievements)
  const [isPending, startTransition] = useTransition()
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementWithRelations | null>(null)
  const [certifyComment, setCertifyComment] = useState('')
  const supabase = createClient()

  const pendingAchievements = achievements.filter(a => a.status === 'pending')
  const historyAchievements = achievements
    .filter(a => (a.status === 'certified' || a.status === 'rejected') && a.certified_by === currentEmployee.id)
    .sort((a, b) => new Date(b.certified_at ?? b.created_at).getTime() - new Date(a.certified_at ?? a.created_at).getTime())
  const hasPriority = priorityMemberIds && priorityMemberIds.size > 0

  const handleCertify = (achievement: AchievementWithRelations, comment: string) => {
    startTransition(async () => {
      const { data, error } = await supabase
        .from('achievements')
        .update({
          status: 'certified',
          certified_by: currentEmployee.id,
          certified_at: new Date().toISOString(),
          certify_comment: comment.trim() || null,
          is_read: false,
        })
        .eq('id', achievement.id)
        .select('*, skills(*), employees!achievements_employee_id_fkey(*)')
        .single()

      if (error) {
        toast.error('認定に失敗しました')
        return
      }

      if (data) {
        setAchievements(prev =>
          prev.map(a => a.id === achievement.id ? { ...a, ...(data as AchievementWithRelations) } : a)
        )
      }
      setSelectedAchievement(null)
      setCertifyComment('')
      toast.success(`「${achievement.skills?.name}」を認定しました！`)
    })
  }

  const handleReject = (achievement: AchievementWithRelations, comment: string) => {
    startTransition(async () => {
      const { data, error } = await supabase
        .from('achievements')
        .update({
          status: 'rejected',
          certified_by: currentEmployee.id,
          certified_at: new Date().toISOString(),
          certify_comment: comment.trim() || null,
          is_read: false,
        })
        .eq('id', achievement.id)
        .select('*, skills(*), employees!achievements_employee_id_fkey(*)')
        .single()

      if (error) {
        toast.error('差し戻しに失敗しました')
        return
      }

      if (data) {
        setAchievements(prev =>
          prev.map(a => a.id === achievement.id ? { ...a, ...(data as AchievementWithRelations) } : a)
        )
      }
      setSelectedAchievement(null)
      setCertifyComment('')
      toast.success(`「${achievement.skills?.name}」を差し戻しました`)
    })
  }

  const openDialog = (achievement: AchievementWithRelations) => {
    setSelectedAchievement(achievement)
    setCertifyComment('')
  }

  const closeDialog = () => {
    setSelectedAchievement(null)
    setCertifyComment('')
  }

  // 社員ごとの進捗
  const employeeStats = employees.map(emp => {
    const empAchievements = achievements.filter(a => a.employee_id === emp.id)
    const certified = empAchievements.filter(a => a.status === 'certified').length
    const pending = empAchievements.filter(a => a.status === 'pending').length
    const empStats = empStatsMap[emp.id]
    const totalSkills = empStats?.totalSkills ?? skills.length
    const pct = totalSkills > 0 ? Math.round((certified / totalSkills) * 100) : 0
    const standardPct = empStats?.standardPct ?? 0
    const storeName = empStats?.storeName ?? null
    return { employee: emp, certified, pending, pct, standardPct, storeName, totalSkills }
  })

  // 担当チームのメンバーを優先して並べるソート
  const sortedPendingAchievements = hasPriority
    ? [
        ...pendingAchievements.filter(a => a.employees && priorityMemberIds!.has(a.employees.id)),
        ...pendingAchievements.filter(a => !a.employees || !priorityMemberIds!.has(a.employees.id)),
      ]
    : pendingAchievements

  const priorityPending = hasPriority
    ? pendingAchievements.filter(a => a.employees && priorityMemberIds!.has(a.employees.id))
    : []
  const otherPending = hasPriority
    ? pendingAchievements.filter(a => !a.employees || !priorityMemberIds!.has(a.employees.id))
    : pendingAchievements

  const overviewStats = employeeStats.filter(({ employee }) => employee.role === 'employee')
  const priorityStats = hasPriority
    ? overviewStats.filter(({ employee }) => priorityMemberIds!.has(employee.id)).sort((a, b) => b.pct - a.pct)
    : []
  const otherStats = hasPriority
    ? overviewStats.filter(({ employee }) => !priorityMemberIds!.has(employee.id)).sort((a, b) => b.pct - a.pct)
    : overviewStats.sort((a, b) => b.pct - a.pct)

  return (
    <div className="p-4 space-y-4">
      <Tabs defaultValue={initialTab}>
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="overview" className="text-xs">チーム一覧</TabsTrigger>
          <TabsTrigger value="pending" className="text-xs">
            申請
            {pendingAchievements.length > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-[10px] h-4 px-1 border-0">
                {pendingAchievements.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">認定履歴</TabsTrigger>
        </TabsList>

        {/* 認定待ちタブ */}
        <TabsContent value="pending" className="mt-3 space-y-2">
          {pendingAchievements.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">認定待ちはありません</p>
              </CardContent>
            </Card>
          ) : hasPriority ? (
            <>
              {priorityPending.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-orange-700 px-1">担当チームのメンバー</p>
                  {priorityPending.map(achievement => (
                    <AchievementCard key={achievement.id} achievement={achievement} onOpen={openDialog} isPending={isPending} />
                  ))}
                </>
              )}
              {otherPending.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-500 px-1 mt-3">その他</p>
                  {otherPending.map(achievement => (
                    <AchievementCard key={achievement.id} achievement={achievement} onOpen={openDialog} isPending={isPending} />
                  ))}
                </>
              )}
            </>
          ) : (
            sortedPendingAchievements.map(achievement => (
              <AchievementCard key={achievement.id} achievement={achievement} onOpen={openDialog} isPending={isPending} />
            ))
          )}
        </TabsContent>

        {/* 認定履歴タブ */}
        <TabsContent value="history" className="mt-3 space-y-2">
          {historyAchievements.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">認定・差し戻し履歴はありません</p>
              </CardContent>
            </Card>
          ) : (
            historyAchievements.map(achievement => (
              <CertifyHistoryCard key={achievement.id} achievement={achievement} />
            ))
          )}
        </TabsContent>

        {/* チーム一覧タブ */}
        <TabsContent value="overview" className="mt-3 space-y-4">
          {managedTeams.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                担当チームがありません
              </CardContent>
            </Card>
          ) : (
            managedTeams.map(team => {
              const teamMemberIdSet = new Set(
                managedTeamMembers.filter(m => m.team_id === team.id).map(m => m.employee_id)
              )
              const teamStats = employeeStats
                .filter(s => teamMemberIdSet.has(s.employee.id))
                .sort((a, b) => (a.pct - a.standardPct) - (b.pct - b.standardPct))
              return (
                <div key={team.id} className="space-y-2">
                  <p className="text-xs font-semibold text-orange-700 px-1">{team.name}</p>
                  {teamStats.length === 0 ? (
                    <p className="text-xs text-muted-foreground px-1">メンバーなし</p>
                  ) : (
                    teamStats.map(({ employee, certified, pending, pct, standardPct, storeName, totalSkills }) => (
                      <OverviewCard key={`${team.id}-${employee.id}`} employee={employee} certified={certified} pending={pending} pct={pct} standardPct={standardPct} storeName={storeName} totalSkills={totalSkills} />
                    ))
                  )}
                </div>
              )
            })
          )}
        </TabsContent>
      </Tabs>

      {/* 認定・差し戻しダイアログ */}
      <Dialog open={selectedAchievement !== null} onOpenChange={open => { if (!open) closeDialog() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">申請内容の確認</DialogTitle>
          </DialogHeader>
          {selectedAchievement && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">{selectedAchievement.employees?.name}</p>
                <p className="text-sm font-semibold text-gray-800">{selectedAchievement.skills?.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">
                    {selectedAchievement.skills?.phase}
                  </Badge>
                  <Badge className="text-[10px] bg-gray-100 text-gray-600 border-0">
                    {selectedAchievement.skills?.category}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  申請日時: {formatAppliedAt(selectedAchievement.achieved_at)}
                </p>
              </div>
              {selectedAchievement.apply_comment && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">申請者コメント</p>
                  <p className="text-sm text-gray-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                    {selectedAchievement.apply_comment}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">コメント（任意）</p>
                <Textarea
                  placeholder="認定・差し戻しの理由や補足をご記入ください"
                  value={certifyComment}
                  onChange={e => setCertifyComment(e.target.value)}
                  className="text-sm min-h-[80px] resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <div className="flex gap-2 w-full">
              <Button
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
                onClick={() => selectedAchievement && handleCertify(selectedAchievement, certifyComment)}
                disabled={isPending}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />
                認定する
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400"
                onClick={() => selectedAchievement && handleReject(selectedAchievement, certifyComment)}
                disabled={isPending}
              >
                <XCircle className="w-4 h-4 mr-1" />
                差し戻す
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatAppliedAt(iso: string): string {
  const d = new Date(iso)
  const M = d.getMonth() + 1
  const D = d.getDate()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${M}月${D}日 ${hh}:${mm}`
}

function AchievementCard({
  achievement,
  onOpen,
  isPending,
}: {
  achievement: AchievementWithRelations & { employees: Employee | null; skills: Skill | null }
  onOpen: (a: AchievementWithRelations) => void
  isPending: boolean
}) {
  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="text-xs bg-orange-200 text-orange-700">
              {achievement.employees?.name.charAt(0) ?? '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">{achievement.employees?.name}</p>
            <p className="text-sm font-medium text-gray-800 leading-tight">
              {achievement.skills?.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">
                {achievement.skills?.phase}
              </Badge>
              <Badge className="text-[10px] bg-gray-100 text-gray-600 border-0">
                {achievement.skills?.category}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                申請: {formatAppliedAt(achievement.achieved_at)}
              </span>
            </div>
            {achievement.apply_comment && (
              <p className="text-xs text-gray-600 mt-1 bg-white rounded px-2 py-1 border border-amber-100">
                💬 {achievement.apply_comment}
              </p>
            )}
          </div>
          <Button
            size="sm"
            className="bg-green-500 hover:bg-green-600 text-white h-8 text-xs px-3 flex-shrink-0"
            onClick={() => onOpen(achievement)}
            disabled={isPending}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            確認・認定
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CertifyHistoryCard({
  achievement,
}: {
  achievement: AchievementWithRelations & { employees: Employee | null; skills: Skill | null }
}) {
  const isCertified = achievement.status === 'certified'
  return (
    <Card className={cn('border', isCertified ? 'border-green-200 bg-green-50' : 'border-red-100 bg-red-50')}>
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 flex-shrink-0', isCertified ? 'text-green-500' : 'text-red-400')}>
            {isCertified ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs text-muted-foreground">{achievement.employees?.name}</p>
              <Badge className={cn('text-[10px] border-0 px-1.5', isCertified ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                {isCertified ? '認定' : '差し戻し'}
              </Badge>
            </div>
            <p className="text-sm font-medium text-gray-800 leading-tight mt-0.5">
              {achievement.skills?.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">
                {achievement.skills?.phase}
              </Badge>
              <Badge className="text-[10px] bg-gray-100 text-gray-600 border-0">
                {achievement.skills?.category}
              </Badge>
              {achievement.certified_at && (
                <span className="text-[10px] text-muted-foreground">
                  {formatAppliedAt(achievement.certified_at)}
                </span>
              )}
            </div>
            {achievement.certify_comment && (
              <p className="text-xs text-gray-600 mt-1 bg-white rounded px-2 py-1 border border-gray-100">
                💬 {achievement.certify_comment}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function OverviewCard({
  employee,
  certified,
  pending,
  pct,
  standardPct,
  storeName,
  totalSkills,
}: {
  employee: Employee
  certified: number
  pending: number
  pct: number
  standardPct: number
  storeName: string | null
  totalSkills: number
}) {
  const diff = pct - standardPct
  const remaining = Math.max(0, totalSkills - certified - pending)
  return (
    <Card>
      <CardContent className="py-3 px-3">
        {/* ヘッダー: アバター + 名前 + バッジ */}
        <div className="flex items-center gap-2 mb-1.5">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarImage src={employee.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs bg-orange-200 text-orange-700">
              {employee.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">
            <p className="text-xs font-semibold text-gray-700">{employee.name}</p>
            <Badge className="bg-orange-100 text-orange-700 text-[9px] border-0 px-1.5 h-4 flex-shrink-0">
              {calcHireYear(employee.hire_date)}年目
            </Badge>
            {employee.employment_type === 'メイト' ? (
              <Badge className="bg-pink-100 text-pink-700 text-[9px] border-0 px-1.5 h-4 flex-shrink-0">メイト</Badge>
            ) : (
              <Badge className="bg-green-100 text-green-700 text-[9px] border-0 px-1.5 h-4 flex-shrink-0">社員</Badge>
            )}
            {storeName && (
              <Badge className="bg-blue-100 text-blue-700 text-[9px] border-0 px-1.5 h-4 flex-shrink-0">{storeName}</Badge>
            )}
          </div>
          {standardPct > 0 && (
            <div className="flex-shrink-0 text-right">
              <p className="text-[9px] text-gray-400 leading-none mb-0.5">オンタイムGAP</p>
              <p className={cn(
                'text-sm font-black leading-none',
                diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-gray-400'
              )}>
                {diff > 0 ? `▲+${diff}%` : diff < 0 ? `▼${diff}%` : '±0%'}
              </p>
            </div>
          )}
        </div>
        {/* 認定/申請中/残り */}
        <p className="text-[10px] text-muted-foreground mb-1.5">
          認定: {certified}件
          {pending > 0 && (
            <span className="ml-2 text-amber-500 inline-flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              申請中 {pending}
            </span>
          )}
          {remaining > 0 && (
            <span className="ml-2 text-gray-400">未認定 残り{remaining}件</span>
          )}
        </p>
        {/* GAP プログレスバー */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative h-2 bg-gray-200 rounded-full">
            <div
              className="absolute top-0 left-0 h-full bg-orange-400 rounded-full"
              style={{ width: `${pct}%` }}
            />
            {Math.abs(diff) > 0 && standardPct > 0 && (
              <div
                className="absolute top-0 h-full rounded-sm"
                style={{
                  left: `${Math.min(pct, standardPct)}%`,
                  width: `${Math.abs(diff)}%`,
                  background: diff < 0 ? 'rgba(251,191,36,0.25)' : 'rgba(52,211,153,0.25)',
                }}
              />
            )}
            {standardPct > 0 && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-0.5 h-3.5 bg-blue-400 rounded-sm z-10"
                style={{ left: `calc(${standardPct}% - 1px)` }}
              />
            )}
          </div>
          <span className="text-[11px] font-black w-8 text-right flex-shrink-0 text-orange-600">
            {pct}%
          </span>
        </div>
        {/* 数値サマリー */}
        <div className="flex items-center gap-3 mt-1.5 text-[10px]">
          <span className="text-blue-500">標準: {standardPct}%</span>
          <span className="text-orange-500">現在: {pct}%</span>
          <span className={cn(
            'font-semibold',
            diff < 0 ? 'text-red-500' : diff > 0 ? 'text-green-600' : 'text-gray-400'
          )}>
            GAP: {diff > 0 ? `+${diff}` : diff}%
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
