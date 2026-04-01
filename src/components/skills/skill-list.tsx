'use client'

import { useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle2, Clock, Circle, ChevronDown, ChevronRight, ChevronUp, Trophy, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { calcPhasePct } from '@/lib/milestone'
import { sortCategories } from '@/lib/category-order'
import { cn } from '@/lib/utils'
import type { Skill, Achievement, Category, MilestoneMap, ProjectPhase } from '@/types/database'

type AchievementWithCertifier = Achievement & {
  certified_employee?: { name: string } | null
  skills?: Skill | null
}

interface Props {
  employeeId: string
  skills: Skill[]
  achievements: AchievementWithCertifier[]
  readOnly?: boolean
  hireDate?: string | null
  phases: ProjectPhase[]
  skillPhaseMap: Record<string, string | null>
  cumulativeHours?: number
  milestones?: MilestoneMap
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

const CATEGORY_COLOR_PALETTE = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-amber-100 text-amber-700',
  'bg-red-100 text-red-700',
  'bg-teal-100 text-teal-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
]

const CATEGORY_PROGRESS_PALETTE = [
  '[&>div]:bg-blue-500',
  '[&>div]:bg-green-500',
  '[&>div]:bg-purple-500',
  '[&>div]:bg-amber-500',
  '[&>div]:bg-red-500',
  '[&>div]:bg-teal-500',
  '[&>div]:bg-pink-500',
  '[&>div]:bg-indigo-500',
]

function getCategoryColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category)
  if (idx >= 0) return CATEGORY_COLOR_PALETTE[idx % CATEGORY_COLOR_PALETTE.length]
  return 'bg-gray-100 text-gray-700'
}

const CATEGORY_BORDER_PALETTE = [
  'border-l-blue-500',
  'border-l-green-500',
  'border-l-purple-500',
  'border-l-amber-500',
  'border-l-red-500',
  'border-l-teal-500',
  'border-l-pink-500',
  'border-l-indigo-500',
]

const CATEGORY_BG_PALETTE = [
  'bg-blue-50/50',
  'bg-green-50/50',
  'bg-purple-50/50',
  'bg-amber-50/50',
  'bg-red-50/50',
  'bg-teal-50/50',
  'bg-pink-50/50',
  'bg-indigo-50/50',
]

function getCategoryBorderColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category)
  if (idx >= 0) return CATEGORY_BORDER_PALETTE[idx % CATEGORY_BORDER_PALETTE.length]
  return 'border-l-gray-300'
}

function getCategoryBgColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category)
  if (idx >= 0) return CATEGORY_BG_PALETTE[idx % CATEGORY_BG_PALETTE.length]
  return 'bg-gray-50/50'
}

function getCategoryProgressColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category)
  if (idx >= 0) return CATEGORY_PROGRESS_PALETTE[idx % CATEGORY_PROGRESS_PALETTE.length]
  return '[&>div]:bg-gray-500'
}

export function SkillList({ employeeId, skills, achievements: initialAchievements, readOnly = false, phases, skillPhaseMap, cumulativeHours, milestones }: Props) {
  const searchParams = useSearchParams()
  const initialPhaseId = phases.find(p => p.name === searchParams.get('phase'))?.id ?? phases[0]?.id ?? ''
  const [achievements, setAchievements] = useState(initialAchievements)
  const categories = sortCategories([...new Set(skills.map(s => s.category))])
  const allKeys = phases.flatMap(p => categories.map(c => `${p.id}-${c}`))
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(allKeys))
  const [expandedStatusGroups, setExpandedStatusGroups] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const initialTab = (() => {
    const t = searchParams.get('tab')
    if (t === 'pending' || t === 'certified') return t
    return 'skills' as const
  })()
  const [view, setView] = useState<'skills' | 'pending' | 'certified'>(initialTab)
  const [historyDialogAch, setHistoryDialogAch] = useState<AchievementWithCertifier | null>(null)
  const [chatHistory, setChatHistory] = useState<{ id: string; action: string; actor_id: string; actor_name: string; actor_avatar: string | null; comment: string | null; created_at: string }[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [applyDialogSkill, setApplyDialogSkill] = useState<Skill | null>(null)
  const [applyComment, setApplyComment] = useState('')
  const [reapplyDialogSkill, setReapplyDialogSkill] = useState<Skill | null>(null)
  const [reapplyComment, setReapplyComment] = useState('')
  const supabase = createClient()

  const openChatHistory = async (ach: AchievementWithCertifier) => {
    setHistoryDialogAch(ach)
    setChatLoading(true)
    setChatHistory([])
    const res = await fetch(`/api/achievement-history?id=${ach.id}`)
    const data = await res.json()
    setChatHistory(data)
    setChatLoading(false)
  }

  const getStatus = (skillId: string) => {
    const a = achievements.find(a => a.skill_id === skillId)
    return a?.status ?? null
  }

  const getAchievement = (skillId: string) => achievements.find(a => a.skill_id === skillId)

  const handleSubmitApply = (skill: Skill, comment: string) => {
    const existing = getAchievement(skill.id)

    startTransition(async () => {
      if (existing && existing.status === 'rejected') {
        const { data, error } = await supabase
          .from('achievements')
          .update({
            status: 'pending',
            achieved_at: new Date().toISOString(),
            apply_comment: comment.trim() || null,
            certify_comment: null,
          })
          .eq('id', existing.id)
          .select()
          .single()

        if (error) { toast.error('再申請に失敗しました'); return }
        setAchievements(prev => prev.map(a => a.id === existing.id ? { ...a, ...(data as AchievementWithCertifier) } : a))
        await supabase.from('achievement_history').insert({ achievement_id: existing.id, action: 'reapply', actor_id: employeeId, comment: comment.trim() || null })
        setReapplyDialogSkill(null)
        setReapplyComment('')
        fetch('/api/skill-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, skillName: skill.name, isReapply: true, comment: comment.trim() || null }) }).catch(() => {})
        toast.success(`「${skill.name}」を再申請しました！`, { description: '認定者の確認をお待ちください' })
      } else {
        const { data, error } = await supabase
          .from('achievements')
          .insert({ employee_id: employeeId, skill_id: skill.id, status: 'pending', apply_comment: comment.trim() || null })
          .select()
          .single()

        if (error) { toast.error('申請に失敗しました'); return }
        setAchievements(prev => [...prev, data])
        await supabase.from('achievement_history').insert({ achievement_id: data.id, action: 'apply', actor_id: employeeId, comment: comment.trim() || null })
        fetch('/api/skill-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, skillName: skill.name, isReapply: false, comment: comment.trim() || null }) }).catch(() => {})
        setApplyDialogSkill(null)
        setApplyComment('')
        toast.success(`「${skill.name}」を申請しました！`, { description: '認定者の確認をお待ちください' })
      }
    })
  }

  const toggleCategory = (key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const toggleStatusGroup = (key: string) => {
    setExpandedStatusGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const renderSkillRow = (skill: Skill) => {
    const status = getStatus(skill.id)
    const achievement = getAchievement(skill.id)
    return (
      <div
        key={skill.id}
        className={cn(
          'flex items-start gap-3 py-2.5 px-2 rounded-lg transition-colors',
          status === 'certified' && 'bg-green-50',
          status === 'pending' && 'bg-amber-50',
          status === 'rejected' && 'bg-red-50',
          !status && 'hover:bg-gray-50'
        )}
      >
        <div className="flex-shrink-0 mt-0.5">
          {status === 'certified' ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : status === 'pending' ? (
            <Clock className="w-5 h-5 text-amber-500" />
          ) : status === 'rejected' ? (
            <XCircle className="w-5 h-5 text-red-400" />
          ) : (
            <Circle className="w-5 h-5 text-gray-300" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm leading-tight',
            status === 'certified' && 'text-green-700 font-medium',
            status === 'pending' && 'text-amber-700',
            status === 'rejected' && 'text-red-600',
            !status && 'text-gray-700'
          )}>
            {skill.name}
          </p>
          {!status && skill.target_date_hint && (
            <p className="text-[10px] text-muted-foreground mt-0.5">目安: {skill.target_date_hint}</p>
          )}
          {status === 'rejected' && achievement && (achievement.certify_comment || achievement.certified_employee?.name) && (
            <p className="text-[11px] text-red-500 mt-0.5 bg-red-50 rounded px-1.5 py-0.5 border border-red-100">
              {achievement.certified_employee?.name && (
                <span className="font-medium">{achievement.certified_employee.name}：</span>
              )}
              {achievement.certify_comment ?? '差し戻しました'}
            </p>
          )}
        </div>

        {status === 'certified' && achievement && (
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-green-600 font-medium">{fmtDate(achievement.certified_at)}</p>
            {achievement.certified_employee?.name && (
              <p className="text-xs text-green-600">{achievement.certified_employee.name}　認定</p>
            )}
          </div>
        )}
        {status === 'pending' && achievement && (
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-amber-600 font-medium">{fmtDate(achievement.achieved_at)} 申請</p>
          </div>
        )}

        {status === 'rejected' && !readOnly && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs px-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 flex-shrink-0"
            onClick={() => { setReapplyDialogSkill(skill); setReapplyComment('') }}
            disabled={isPending}
          >
            再申請する
          </Button>
        )}

        {!status && !readOnly && (
          <Button
            size="sm"
            variant="outline"
            className="group h-7 text-xs px-2 border-orange-200 text-orange-600 hover:bg-orange-100 hover:border-orange-400 hover:text-orange-700 flex-shrink-0"
            onClick={() => { setApplyDialogSkill(skill); setApplyComment('') }}
            disabled={isPending}
          >
            <span className="group-hover:hidden">申請する</span>
            <span className="hidden group-hover:inline font-semibold">できました！</span>
          </Button>
        )}
      </div>
    )
  }

  const gridCols = phases.length <= 3 ? `grid-cols-${phases.length}` : 'grid-cols-3'

  const historyItems = [...achievements].sort(
    (a, b) => new Date(b.achieved_at ?? '').getTime() - new Date(a.achieved_at ?? '').getTime()
  )

  return (
    <div className="p-4 space-y-4">
      {/* ビュー切替 */}
      {(() => {
        const pendingCount = achievements.filter(a => a.status === 'pending' || a.status === 'rejected').length
        const certifiedCount = achievements.filter(a => a.status === 'certified').length
        const tabs = [
          { key: 'skills', label: '未申請' },
          { key: 'pending', label: '申請中', count: pendingCount },
          { key: 'certified', label: '承認済', count: certifiedCount },
        ] as const
        return (
          <div className="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
            {tabs.map(t => (
              <button
                key={t.key}
                className={cn('flex-1 py-1.5 font-medium transition-colors', view === t.key ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50')}
                onClick={() => setView(t.key as typeof view)}
              >
                {t.label}
                {'count' in t && t.count > 0 && (
                  <span className={cn('ml-1 text-[10px]', view === t.key ? 'text-orange-100' : 'text-gray-400')}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
        )
      })()}

      {/* 申請中ビュー（pending + rejected） */}
      {view === 'pending' && (
        <div className="space-y-2">
          {(() => {
            const items = historyItems.filter(a => a.status === 'pending' || a.status === 'rejected')
            if (items.length === 0) return <p className="text-sm text-gray-400 text-center py-8">申請中のスキルはありません</p>
            return items.map(ach => {
              const skillName = ach.skills?.name ?? skills.find(s => s.id === ach.skill_id)?.name ?? '不明'
              const skillCategory = (ach.skills?.category ?? skills.find(s => s.id === ach.skill_id)?.category ?? '') as Category | ''
              const catColor = getCategoryColor(skillCategory ?? '', categories)
              const skill = skills.find(s => s.id === ach.skill_id)
              return (
                <div key={ach.id} onClick={() => openChatHistory(ach)} className={cn(
                  'rounded-lg border cursor-pointer hover:shadow-sm transition-shadow py-2.5 px-3',
                  ach.status === 'pending' && 'bg-amber-50 border-amber-100',
                  ach.status === 'rejected' && 'bg-red-50 border-red-100',
                )}>
                  <div className="flex items-start gap-3">
                    {ach.certified_employee?.avatar_url ? (
                      <img src={ach.certified_employee.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" />
                    ) : (
                      <div className="flex-shrink-0 mt-0.5">
                        {ach.status === 'pending' ? <Clock className="w-4 h-4 text-amber-500" /> : <XCircle className="w-4 h-4 text-red-400" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{skillName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {skillCategory && <Badge className={cn('text-[10px] border-0', catColor)}>{skillCategory}</Badge>}
                        <span className="text-[10px] text-gray-400">{fmtDate(ach.achieved_at)} 申請</span>
                      </div>
                      {ach.certify_comment && (
                        <p className="text-[11px] mt-1 rounded px-1.5 py-0.5 border text-red-600 bg-red-50 border-red-100">
                          {ach.certified_employee?.name && <span className="font-medium">{ach.certified_employee.name}：</span>}
                          {ach.certify_comment}
                        </p>
                      )}
                      {ach.status === 'rejected' && ach.certified_at && (
                        <p className="text-[10px] text-red-400 mt-0.5">
                          {fmtDate(ach.certified_at)} {ach.certified_employee?.name ?? ''}が差し戻し
                        </p>
                      )}
                    </div>
                    <Badge className={cn('text-[10px] border-0 flex-shrink-0', ach.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600')}>
                      {ach.status === 'pending' ? '申請中' : '差し戻し'}
                    </Badge>
                  </div>
                  {ach.status === 'rejected' && !readOnly && skill && (
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); setReapplyDialogSkill(skill); setReapplyComment('') }}
                        className="text-[11px] text-orange-600 font-medium bg-orange-100 hover:bg-orange-200 rounded-full px-3 py-1 transition-colors"
                      >
                        再申請する
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* 承認済ビュー */}
      {view === 'certified' && (
        <div className="space-y-2">
          {(() => {
            const items = historyItems.filter(a => a.status === 'certified')
            if (items.length === 0) return <p className="text-sm text-gray-400 text-center py-8">承認済みのスキルはありません</p>
            return items.map(ach => {
              const skillName = ach.skills?.name ?? skills.find(s => s.id === ach.skill_id)?.name ?? '不明'
              const skillCategory = (ach.skills?.category ?? skills.find(s => s.id === ach.skill_id)?.category ?? '') as Category | ''
              const catColor = getCategoryColor(skillCategory ?? '', categories)
              return (
                <div key={ach.id} onClick={() => openChatHistory(ach)} className="flex items-start gap-3 py-2.5 px-3 rounded-lg border bg-green-50 border-green-100 cursor-pointer hover:shadow-sm transition-shadow">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{skillName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {skillCategory && <Badge className={cn('text-[10px] border-0', catColor)}>{skillCategory}</Badge>}
                      <span className="text-[10px] text-gray-400">{fmtDate(ach.achieved_at)} 申請</span>
                    </div>
                    {ach.certify_comment && (
                      <p className="text-[11px] mt-1 rounded px-1.5 py-0.5 border text-green-700 bg-green-50 border-green-100">
                        {ach.certified_employee?.name && <span className="font-medium">{ach.certified_employee.name}：</span>}
                        {ach.certify_comment}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <Badge className="text-[10px] border-0 bg-green-100 text-green-700">認定済み</Badge>
                    {ach.certified_at && (
                      <p className="text-[10px] text-green-600 mt-0.5">
                        {fmtDate(ach.certified_at)} {ach.certified_employee?.name ?? ''}が認定
                      </p>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {/* チェックリストビュー */}
      {view === 'skills' && <>
      {!readOnly && (
        <p className="text-xs text-muted-foreground text-center bg-orange-50 border border-orange-100 rounded-lg py-2 px-3">
          習得できたスキルの <span className="font-semibold text-orange-600">申請する</span> ボタンを押して申請してください
        </p>
      )}
      <Tabs defaultValue={initialPhaseId}>
        <TabsList className={cn('grid w-full h-9', gridCols)}>
          {phases.map(phase => {
            const phaseSkills = skills.filter(s => skillPhaseMap[s.id] === phase.id)
            const certified = phaseSkills.filter(s => getStatus(s.id) === 'certified').length
            return (
              <TabsTrigger key={phase.id} value={phase.id} className="text-xs">
                {phase.name}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {certified}/{phaseSkills.length}
                </span>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {phases.map(phase => {
          const phaseSkills = skills.filter(s => skillPhaseMap[s.id] === phase.id)
          const certified = phaseSkills.filter(s => getStatus(s.id) === 'certified').length
          const pct = phaseSkills.length > 0 ? Math.round((certified / phaseSkills.length) * 100) : 0
          const m = milestones?.[phase.name]
          const standardPct = m && cumulativeHours !== undefined ? calcPhasePct(cumulativeHours, m) : null
          const diff = standardPct !== null ? pct - standardPct : null

          return (
            <TabsContent key={phase.id} value={phase.id} className="space-y-3 mt-3">
              {/* フェーズ進捗バー */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 w-7 text-right flex-shrink-0">実績</span>
                  <Progress value={pct} className="flex-1 h-2 [&>div]:bg-orange-500" />
                  <span className="text-sm font-bold text-orange-500 w-10 text-right">{pct}%</span>
                </div>
                {standardPct !== null && standardPct > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400 w-7 text-right flex-shrink-0">標準</span>
                    <Progress value={standardPct} className="flex-1 h-2 bg-gray-100 [&>div]:bg-gray-400" />
                    <div className="w-10 text-right flex-shrink-0">
                      <span className="text-[11px] text-gray-400">{standardPct}%</span>
                    </div>
                  </div>
                )}
                {diff !== null && standardPct !== null && standardPct > 0 && (
                  <p className={cn(
                    'text-[11px] font-bold text-right',
                    diff >= 5 ? 'text-green-600' : diff <= -5 ? 'text-red-500' : 'text-gray-400'
                  )}>
                    {diff > 0 ? `▲ 標準より +${diff}pt` : diff < 0 ? `▼ 標準より ${diff}pt` : '± 標準通り'}
                  </p>
                )}
              </div>

              {/* カテゴリ別スキルリスト */}
              {categories.map(category => {
                const catSkills = phaseSkills.filter(s => s.category === category)
                if (catSkills.length === 0) return null

                const key = `${phase.id}-${category}`
                const isExpanded = expandedCategories.has(key)
                const catCertified = catSkills.filter(s => getStatus(s.id) === 'certified').length

                const uncompSkills = catSkills.filter(s => !getStatus(s.id)).sort((a, b) => a.order_index - b.order_index)
                const pendingSkills = catSkills.filter(s => getStatus(s.id) === 'pending').sort((a, b) => a.order_index - b.order_index)
                const rejectedSkills = catSkills.filter(s => getStatus(s.id) === 'rejected').sort((a, b) => a.order_index - b.order_index)
                const certifiedSkills = catSkills.filter(s => getStatus(s.id) === 'certified').sort((a, b) => a.order_index - b.order_index)

                const pendingKey = `${phase.id}-${category}-pending`
                const rejectedKey = `${phase.id}-${category}-rejected`
                const certifiedKey = `${phase.id}-${category}-certified`
                const isPendingExpanded = expandedStatusGroups.has(pendingKey)
                const isRejectedExpanded = expandedStatusGroups.has(rejectedKey)
                const isCertifiedExpanded = expandedStatusGroups.has(certifiedKey)

                return (
                  <Card key={category} className={cn('overflow-hidden border-l-4', getCategoryBorderColor(category, categories))}>
                    <button
                      className={cn('w-full flex items-center justify-between p-3 transition-colors', getCategoryBgColor(category, categories), 'hover:opacity-80')}
                      onClick={() => toggleCategory(key)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge className={cn('text-xs border-0', getCategoryColor(category, categories))}>{category}</Badge>
                          <span className="text-xs text-gray-500">{catCertified}/{catSkills.length}</span>
                          {catCertified === catSkills.length ? (
                            <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs flex items-center gap-0.5">
                              <Trophy className="w-3 h-3" />完了！
                            </Badge>
                          ) : (
                            <span className="text-xs font-bold text-orange-500">あと{catSkills.length - catCertified}件</span>
                          )}
                        </div>
                        <Progress
                          value={catSkills.length > 0 ? Math.round(catCertified / catSkills.length * 100) : 0}
                          className={cn('h-1.5', getCategoryProgressColor(category, categories))}
                        />
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <CardContent className="pt-0 pb-2 px-3">
                        <div className="space-y-1">{uncompSkills.map(skill => renderSkillRow(skill))}</div>

                        {pendingSkills.length > 0 && (
                          <div className={cn(uncompSkills.length > 0 && 'border-t border-amber-100 mt-2 pt-1')}>
                            <button
                              className="w-full flex items-center justify-between py-1.5 px-2 text-left hover:bg-amber-50 rounded-lg transition-colors"
                              onClick={e => { e.stopPropagation(); toggleStatusGroup(pendingKey) }}
                            >
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-xs text-amber-700 font-medium">申請中</span>
                                <span className="text-xs text-amber-500">{pendingSkills.length}件</span>
                              </div>
                              {isPendingExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                            {isPendingExpanded && <div className="space-y-1 mt-1">{pendingSkills.map(skill => renderSkillRow(skill))}</div>}
                          </div>
                        )}

                        {rejectedSkills.length > 0 && (
                          <div className={cn((uncompSkills.length > 0 || pendingSkills.length > 0) && 'border-t border-red-100 mt-2 pt-1')}>
                            <button
                              className="w-full flex items-center justify-between py-1.5 px-2 text-left hover:bg-red-50 rounded-lg transition-colors"
                              onClick={e => { e.stopPropagation(); toggleStatusGroup(rejectedKey) }}
                            >
                              <div className="flex items-center gap-1.5">
                                <XCircle className="w-3.5 h-3.5 text-red-400" />
                                <span className="text-xs text-red-600 font-medium">差し戻し</span>
                                <span className="text-xs text-red-400">{rejectedSkills.length}件</span>
                              </div>
                              {isRejectedExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                            {isRejectedExpanded && <div className="space-y-1 mt-1">{rejectedSkills.map(skill => renderSkillRow(skill))}</div>}
                          </div>
                        )}

                        {certifiedSkills.length > 0 && (
                          <div className={cn((uncompSkills.length > 0 || pendingSkills.length > 0 || rejectedSkills.length > 0) && 'border-t border-green-100 mt-2 pt-1')}>
                            <button
                              className="w-full flex items-center justify-between py-1.5 px-2 text-left hover:bg-green-50 rounded-lg transition-colors"
                              onClick={e => { e.stopPropagation(); toggleStatusGroup(certifiedKey) }}
                            >
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                <span className="text-xs text-green-700 font-medium">認定済</span>
                                <span className="text-xs text-green-500">{certifiedSkills.length}件</span>
                              </div>
                              {isCertifiedExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                            </button>
                            {isCertifiedExpanded && <div className="space-y-1 mt-1">{certifiedSkills.map(skill => renderSkillRow(skill))}</div>}
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                )
              })}
            </TabsContent>
          )
        })}
      </Tabs>
      </>}

      {/* 申請ダイアログ */}
      <Dialog open={applyDialogSkill !== null} onOpenChange={open => { if (!open) { setApplyDialogSkill(null); setApplyComment('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">スキルを申請する</DialogTitle></DialogHeader>
          {applyDialogSkill && (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm font-semibold text-gray-800">{applyDialogSkill.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={cn('text-[10px] border-0', getCategoryColor(applyDialogSkill.category, categories))}>{applyDialogSkill.category}</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">コメント（任意）</p>
                <Textarea
                  placeholder="習得したポイントや、気付いたこと、学んだことなど、一言コメントをどうぞ"
                  value={applyComment}
                  onChange={e => setApplyComment(e.target.value)}
                  className="text-sm min-h-[80px] resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => applyDialogSkill && handleSubmitApply(applyDialogSkill, applyComment)}
              disabled={isPending}
            >
              できました！申請する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 再申請ダイアログ */}
      <Dialog open={reapplyDialogSkill !== null} onOpenChange={open => { if (!open) { setReapplyDialogSkill(null); setReapplyComment('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">再申請する</DialogTitle></DialogHeader>
          {reapplyDialogSkill && (
            <div className="space-y-3">
              <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                <p className="text-sm font-semibold text-gray-800">{reapplyDialogSkill.name}</p>
                {(() => {
                  const a = getAchievement(reapplyDialogSkill.id)
                  if (!a) return null
                  const hasFeedback = a.certify_comment || a.certified_employee?.name
                  return hasFeedback ? (
                    <div className="mt-2">
                      <p className="text-xs text-red-500 font-medium">
                        差し戻し理由
                        {a.certified_employee?.name && <span className="ml-1 text-red-400">（{a.certified_employee.name} より）</span>}
                      </p>
                      {a.certify_comment && <p className="text-xs text-red-600 mt-0.5">{a.certify_comment}</p>}
                    </div>
                  ) : null
                })()}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">コメント（任意）</p>
                <Textarea
                  placeholder="再申請の補足コメントをどうぞ"
                  value={reapplyComment}
                  onChange={e => setReapplyComment(e.target.value)}
                  className="text-sm min-h-[80px] resize-none"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => reapplyDialogSkill && handleSubmitApply(reapplyDialogSkill, reapplyComment)}
              disabled={isPending}
            >
              再申請する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* チャット風履歴ダイアログ */}
      <Dialog open={!!historyDialogAch} onOpenChange={() => setHistoryDialogAch(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {historyDialogAch?.skills?.name ?? ''}の履歴
            </DialogTitle>
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
              {/* 差し戻し状態なら再申請ボタン */}
              {!readOnly && historyDialogAch?.status === 'rejected' && (() => {
                const skill = skills.find(s => s.id === historyDialogAch.skill_id)
                return skill ? (
                  <div className="flex justify-center pt-3 border-t mt-3">
                    <Button
                      className="bg-orange-500 hover:bg-orange-600 text-white"
                      onClick={() => {
                        setHistoryDialogAch(null)
                        setReapplyDialogSkill(skill)
                        setReapplyComment('')
                      }}
                    >
                      再申請する
                    </Button>
                  </div>
                ) : null
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
