'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
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

interface Props {
  currentEmployee: Employee
  employees: Employee[]
  skills: Skill[]
  achievements: AchievementWithRelations[]
  priorityMemberIds?: Set<string>
}

export function TeamDashboard({ currentEmployee, employees, skills, achievements: initialAchievements, priorityMemberIds }: Props) {
  const [achievements, setAchievements] = useState(initialAchievements)
  const [isPending, startTransition] = useTransition()
  const [selectedAchievement, setSelectedAchievement] = useState<AchievementWithRelations | null>(null)
  const [certifyComment, setCertifyComment] = useState('')
  const supabase = createClient()

  const pendingAchievements = achievements.filter(a => a.status === 'pending')
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
    const pct = skills.length > 0 ? Math.round((certified / skills.length) * 100) : 0
    return { employee: emp, certified, pending, pct }
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
      <Tabs defaultValue="pending">
        <TabsList className="grid w-full grid-cols-2 h-9">
          <TabsTrigger value="pending" className="text-xs">
            認定待ち
            {pendingAchievements.length > 0 && (
              <Badge className="ml-1 bg-red-500 text-white text-[10px] h-4 px-1 border-0">
                {pendingAchievements.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overview" className="text-xs">チーム一覧</TabsTrigger>
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

        {/* チーム一覧タブ */}
        <TabsContent value="overview" className="mt-3 space-y-3">
          {hasPriority && priorityStats.length > 0 && (
            <>
              <p className="text-xs font-semibold text-orange-700 px-1">担当チームのメンバー</p>
              {priorityStats.map(({ employee, certified, pending, pct }) => (
                <OverviewCard key={employee.id} employee={employee} certified={certified} pending={pending} pct={pct} />
              ))}
              {otherStats.length > 0 && (
                <p className="text-xs font-semibold text-gray-500 px-1 mt-3">その他</p>
              )}
            </>
          )}
          {otherStats.map(({ employee, certified, pending, pct }) => (
            <OverviewCard key={employee.id} employee={employee} certified={certified} pending={pending} pct={pct} />
          ))}
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

function OverviewCard({
  employee,
  certified,
  pending,
  pct,
}: {
  employee: Employee
  certified: number
  pending: number
  pct: number
}) {
  return (
    <Card>
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3 mb-2">
          <Avatar className="w-8 h-8 flex-shrink-0">
            <AvatarFallback className="text-xs bg-orange-200 text-orange-700">
              {employee.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-800">{employee.name}</p>
              <span className="text-base font-bold text-orange-500">{pct}%</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              認定: {certified}件
              {pending > 0 && (
                <span className="ml-2 text-amber-500 inline-flex items-center gap-0.5">
                  <Clock className="w-2.5 h-2.5" />
                  申請中 {pending}
                </span>
              )}
            </p>
          </div>
        </div>
        <Progress value={pct} className="h-1.5" />
      </CardContent>
    </Card>
  )
}
