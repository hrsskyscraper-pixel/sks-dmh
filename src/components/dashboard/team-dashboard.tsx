'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Clock, User } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
}

export function TeamDashboard({ currentEmployee, employees, skills, achievements: initialAchievements }: Props) {
  const [achievements, setAchievements] = useState(initialAchievements)
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  const pendingAchievements = achievements.filter(a => a.status === 'pending')

  const handleCertify = (achievement: AchievementWithRelations) => {
    startTransition(async () => {
      const { data, error } = await supabase
        .from('achievements')
        .update({
          status: 'certified',
          certified_by: currentEmployee.id,
          certified_at: new Date().toISOString(),
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
      toast.success(`「${achievement.skills?.name}」を認定しました！`)
    })
  }

  // 社員ごとの進捗
  const employeeStats = employees.map(emp => {
    const empAchievements = achievements.filter(a => a.employee_id === emp.id)
    const certified = empAchievements.filter(a => a.status === 'certified').length
    const pending = empAchievements.filter(a => a.status === 'pending').length
    const pct = skills.length > 0 ? Math.round((certified / skills.length) * 100) : 0
    return { employee: emp, certified, pending, pct }
  })

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
          ) : (
            pendingAchievements.map(achievement => (
              <Card key={achievement.id} className="border-amber-200 bg-amber-50">
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
                    </div>
                    <Button
                      size="sm"
                      className="bg-green-500 hover:bg-green-600 text-white h-8 text-xs px-3 flex-shrink-0"
                      onClick={() => handleCertify(achievement)}
                      disabled={isPending}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      認定
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* チーム一覧タブ */}
        <TabsContent value="overview" className="mt-3 space-y-3">
          {employeeStats
            .filter(({ employee }) => employee.role === 'employee')
            .sort((a, b) => b.pct - a.pct)
            .map(({ employee, certified, pending, pct }) => (
              <Card key={employee.id}>
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
            ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
