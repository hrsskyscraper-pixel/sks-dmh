'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Clock, Circle, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Skill, Achievement, Phase, Category } from '@/types/database'

interface Props {
  employeeId: string
  skills: Skill[]
  achievements: Achievement[]
}

const PHASES: Phase[] = ['4月', '5月〜6月', '7月〜8月']
const CATEGORIES: Category[] = ['接客', '調理', '管理', 'その他']

const CATEGORY_COLORS: Record<Category, string> = {
  '接客': 'bg-blue-100 text-blue-700',
  '調理': 'bg-green-100 text-green-700',
  '管理': 'bg-purple-100 text-purple-700',
  'その他': 'bg-gray-100 text-gray-700',
}

export function SkillList({ employeeId, skills, achievements: initialAchievements }: Props) {
  const [achievements, setAchievements] = useState(initialAchievements)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['接客']))
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  const getStatus = (skillId: string) => {
    const a = achievements.find(a => a.skill_id === skillId)
    return a?.status ?? null
  }

  const handleRequest = (skill: Skill) => {
    const current = getStatus(skill.id)
    if (current) return // 既に申請済み or 認定済み

    startTransition(async () => {
      const { data, error } = await supabase
        .from('achievements')
        .insert({
          employee_id: employeeId,
          skill_id: skill.id,
          status: 'pending',
        })
        .select()
        .single()

      if (error) {
        toast.error('申請に失敗しました')
        return
      }
      setAchievements(prev => [...prev, data])
      toast.success(`「${skill.name}」を申請しました！`, {
        description: '認定者の確認をお待ちください',
      })
    })
  }

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div className="p-4 space-y-4">
      <Tabs defaultValue="4月">
        <TabsList className="grid w-full grid-cols-3 h-9">
          {PHASES.map(phase => {
            const phaseSkills = skills.filter(s => s.phase === phase)
            const certified = phaseSkills.filter(s => getStatus(s.id) === 'certified').length
            return (
              <TabsTrigger key={phase} value={phase} className="text-xs">
                {phase}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {certified}/{phaseSkills.length}
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {PHASES.map(phase => {
          const phaseSkills = skills.filter(s => s.phase === phase)
          const certified = phaseSkills.filter(s => getStatus(s.id) === 'certified').length
          const pct = phaseSkills.length > 0 ? Math.round((certified / phaseSkills.length) * 100) : 0

          return (
            <TabsContent key={phase} value={phase} className="space-y-3 mt-3">
              {/* フェーズ進捗バー */}
              <div className="flex items-center gap-3">
                <Progress value={pct} className="flex-1 h-2" />
                <span className="text-sm font-bold text-orange-500 w-10 text-right">{pct}%</span>
              </div>

              {/* カテゴリ別スキルリスト */}
              {CATEGORIES.map(category => {
                const catSkills = phaseSkills.filter(s => s.category === category)
                if (catSkills.length === 0) return null

                const key = `${phase}-${category}`
                const isExpanded = expandedCategories.has(key)
                const catCertified = catSkills.filter(s => getStatus(s.id) === 'certified').length

                return (
                  <Card key={category} className="overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
                      onClick={() => toggleCategory(key)}
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={cn('text-xs border-0', CATEGORY_COLORS[category])}>
                          {category}
                        </Badge>
                        <span className="text-xs text-gray-500">
                          {catCertified}/{catSkills.length}
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <CardContent className="pt-0 pb-2 px-3 space-y-1">
                        {catSkills.map(skill => {
                          const status = getStatus(skill.id)
                          return (
                            <div
                              key={skill.id}
                              className={cn(
                                'flex items-center gap-3 py-2.5 px-2 rounded-lg transition-colors',
                                status === 'certified' && 'bg-green-50',
                                status === 'pending' && 'bg-amber-50',
                                !status && 'hover:bg-gray-50'
                              )}
                            >
                              {/* ステータスアイコン */}
                              <div className="flex-shrink-0">
                                {status === 'certified' ? (
                                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                                ) : status === 'pending' ? (
                                  <Clock className="w-5 h-5 text-amber-500" />
                                ) : (
                                  <Circle className="w-5 h-5 text-gray-300" />
                                )}
                              </div>

                              {/* スキル名 */}
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  'text-sm leading-tight',
                                  status === 'certified' && 'text-green-700 font-medium',
                                  status === 'pending' && 'text-amber-700',
                                  !status && 'text-gray-700'
                                )}>
                                  {skill.name}
                                </p>
                                {skill.target_date_hint && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    目安: {skill.target_date_hint}
                                  </p>
                                )}
                              </div>

                              {/* アクションボタン */}
                              {!status && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs px-2 border-orange-200 text-orange-600 hover:bg-orange-50 flex-shrink-0"
                                  onClick={() => handleRequest(skill)}
                                  disabled={isPending}
                                >
                                  できた!
                                </Button>
                              )}
                              {status === 'pending' && (
                                <span className="text-[10px] text-amber-600 flex-shrink-0">申請中</span>
                              )}
                              {status === 'certified' && (
                                <span className="text-[10px] text-green-600 flex-shrink-0">認定済</span>
                              )}
                            </div>
                          )
                        })}
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
