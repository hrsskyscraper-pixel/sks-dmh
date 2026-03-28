'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import dynamic from 'next/dynamic'
const RadarChart = dynamic(() => import('@/components/charts/radar-chart').then(m => m.RadarChart), { ssr: false })
const PhaseProgressChart = dynamic(() => import('@/components/charts/phase-progress-chart').then(m => m.PhaseProgressChart), { ssr: false })
import { cn } from '@/lib/utils'
import { AlertTriangle, ChevronDown, ChevronUp, Camera, Loader2, CheckCircle2, XCircle, Bell, ClipboardList, Users, Instagram, Target, CalendarDays, Pencil } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { calcPhasePct } from '@/lib/milestone'
import { sortCategories } from '@/lib/category-order'
import { Input } from '@/components/ui/input'
import type { Employee, Skill, Achievement, MilestoneMap, ProjectPhase, Goal } from '@/types/database'

type AchievementWithSkill = Achievement & { skills: Skill | null }

interface Props {
  employee: Employee
  skills: Skill[]
  achievements: Achievement[]
  cumulativeHours: number
  milestones: MilestoneMap
  projectPhases: ProjectPhase[]
  skillPhaseMap: Record<string, string | null>
  currentProject: { id: string; name: string; is_active: boolean } | null
  employeeProjects: { id: string; name: string; is_active: boolean }[]
  unreadNotifications: AchievementWithSkill[]
  pendingAchievementsCount?: number
  pendingTeamRequestsCount?: number
  currentGoal: Pick<Goal, 'id' | 'content' | 'set_at' | 'deadline'> | null
  isOwnDashboard: boolean
}

const PHASE_COLORS = ['bg-orange-500', 'bg-amber-500', 'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500']

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

function getCategoryColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category)
  if (idx >= 0) return CATEGORY_COLOR_PALETTE[idx % CATEGORY_COLOR_PALETTE.length]
  return 'bg-gray-100 text-gray-700'
}

function calcSkillTargetHours(skillId: string, allSkills: Skill[], skillPhaseMap: Record<string, string | null>, projectPhases: ProjectPhase[], milestones: MilestoneMap): number {
  const phaseId = skillPhaseMap[skillId]
  const phase = projectPhases.find(p => p.id === phaseId)
  if (!phase) return 0
  const m = milestones[phase.name]
  if (!m || m.end <= m.start) return 0
  const phaseSkills = allSkills.filter(s => skillPhaseMap[s.id] === phaseId).sort((a, b) => a.order_index - b.order_index)
  const rank = phaseSkills.findIndex(s => s.id === skillId) + 1
  const total = phaseSkills.length
  if (total === 0) return 0
  return Math.round(m.start + (rank / total) * (m.end - m.start))
}

function fmtHireDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

function calcHireYear(hireDate: string | null): number {
  if (!hireDate) return 1
  const hire = new Date(hireDate)
  const today = new Date()
  const hireFY = hire.getMonth() >= 3 ? hire.getFullYear() : hire.getFullYear() - 1
  const todayFY = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1
  return Math.max(1, todayFY - hireFY + 1)
}

export function DashboardContent({
  employee, skills, achievements: initialAchievements, cumulativeHours, milestones,
  projectPhases, skillPhaseMap, currentProject, employeeProjects,
  unreadNotifications: initialNotifications,
  pendingAchievementsCount = 0, pendingTeamRequestsCount = 0,
  currentGoal: initialGoal, isOwnDashboard
}: Props) {
  const [achievementList, setAchievementList] = useState(initialAchievements)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [isPending, startTransition] = useTransition()
  const [applyDialogSkill, setApplyDialogSkill] = useState<Skill | null>(null)
  const [applyComment, setApplyComment] = useState('')
  const [avatarUrl, setAvatarUrl] = useState(employee.avatar_url)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [showAllOverdue, setShowAllOverdue] = useState(false)
  // goal
  const [goal, setGoal] = useState(initialGoal)
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [goalContent, setGoalContent] = useState(initialGoal?.content ?? '')
  const [goalDeadline, setGoalDeadline] = useState(initialGoal?.deadline ?? '')
  // instagram
  const [instagramDialogOpen, setInstagramDialogOpen] = useState(false)
  const [instagramInput, setInstagramInput] = useState(employee.instagram_url ?? '')
  const [instagramUrl, setInstagramUrl] = useState(employee.instagram_url)
  const supabase = createClient()
  const router = useRouter()

  const certifiedIds = new Set(achievementList.filter(a => a.status === 'certified').map(a => a.skill_id))
  const pendingIds = new Set(achievementList.filter(a => a.status === 'pending').map(a => a.skill_id))

  const handleRequest = (skill: Skill, comment?: string) => {
    if (certifiedIds.has(skill.id) || pendingIds.has(skill.id)) return
    startTransition(async () => {
      const { data, error } = await supabase
        .from('achievements')
        .insert({ employee_id: employee.id, skill_id: skill.id, status: 'pending', apply_comment: comment?.trim() || null })
        .select()
        .single()
      if (error) { toast.error('申請に失敗しました'); return }
      setAchievementList(prev => [...prev, data])
      setApplyDialogSkill(null)
      setApplyComment('')
      toast.success(`「${skill.name}」を申請しました！`, { description: '認定者の確認をお待ちください' })
    })
  }

  const handleMarkAsRead = (id: string) => {
    startTransition(async () => {
      const { error } = await supabase.from('achievements').update({ is_read: true }).eq('id', id)
      if (error) { toast.error('既読にできませんでした'); return }
      setNotifications(prev => prev.filter(n => n.id !== id))
    })
  }

  const handleAvatarUpload = async (file: File) => {
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${employee.id}.${ext}`
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) { toast.error('アップロードに失敗しました'); return }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      await supabase.from('employees').update({ avatar_url: publicUrl }).eq('id', employee.id)
      setAvatarUrl(publicUrl)
      toast.success('写真を更新しました')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleSaveGoal = () => {
    startTransition(async () => {
      const { data, error } = await supabase
        .from('goals')
        .insert({ employee_id: employee.id, content: goalContent.trim(), deadline: goalDeadline || null })
        .select('id, content, set_at, deadline')
        .single()
      if (error) { toast.error('目標の保存に失敗しました'); return }
      setGoal(data)
      setGoalDialogOpen(false)
      toast.success('目標を設定しました')
    })
  }

  const handleSaveInstagram = () => {
    startTransition(async () => {
      const url = instagramInput.trim() || null
      const { error } = await supabase
        .from('employees')
        .update({ instagram_url: url })
        .eq('id', employee.id)
      if (error) { toast.error('保存に失敗しました'); return }
      setInstagramUrl(url)
      setInstagramDialogOpen(false)
      toast.success('Instagramを設定しました')
    })
  }

  // フェーズ別進捗
  const phaseStats = projectPhases.map((phase, index) => {
    const phaseSkills = skills.filter(s => skillPhaseMap[s.id] === phase.id)
    const certified = phaseSkills.filter(s => certifiedIds.has(s.id)).length
    const pending = phaseSkills.filter(s => pendingIds.has(s.id)).length
    const pct = phaseSkills.length > 0 ? Math.round((certified / phaseSkills.length) * 100) : 0
    const m = milestones[phase.name]
    const standardPct = m ? calcPhasePct(cumulativeHours, m) : 0
    return {
      phase: phase.name,
      phaseId: phase.id,
      label: phase.name,
      months: '',
      total: phaseSkills.length,
      certified,
      pending,
      pct,
      standardPct,
      diff: pct - standardPct,
      colorClass: PHASE_COLORS[index % PHASE_COLORS.length],
    }
  })

  // カテゴリ一覧をスキルデータから動的取得
  const categories = sortCategories([...new Set(skills.map(s => s.category))])

  // カテゴリ別進捗（レーダーチャート用）
  const radarData = categories.map(category => {
    const catSkills = skills.filter(s => s.category === category)
    const certified = catSkills.filter(s => certifiedIds.has(s.id)).length
    return {
      category,
      value: catSkills.length > 0 ? Math.round((certified / catSkills.length) * 100) : 0,
      total: catSkills.length,
      certified,
    }
  })

  const totalCertified = certifiedIds.size
  const totalPending = pendingIds.size
  const totalSkills = skills.length
  const totalPct = totalSkills > 0 ? Math.round((totalCertified / totalSkills) * 100) : 0
  const totalPendingPct = totalSkills > 0 ? Math.round((totalPending / totalSkills) * 100) : 0
  const totalUnapplied = totalSkills - totalCertified - totalPending

  const totalExpected = phaseStats.reduce((sum, { standardPct, total }) => sum + Math.round(standardPct * total / 100), 0)
  const gapSkills = totalCertified - totalExpected

  // 遅延スキル（未認定 AND 未申請、目標時間を過ぎている）
  const overdueSkills = skills
    .filter(skill => {
      const targetHours = calcSkillTargetHours(skill.id, skills, skillPhaseMap, projectPhases, milestones)
      return targetHours > 0 && targetHours <= cumulativeHours && !certifiedIds.has(skill.id) && !pendingIds.has(skill.id)
    })
    .sort((a, b) =>
      calcSkillTargetHours(a.id, skills, skillPhaseMap, projectPhases, milestones) -
      calcSkillTargetHours(b.id, skills, skillPhaseMap, projectPhases, milestones)
    )

  // 申請中だが遅延しているスキル
  const overduePendingSkills = skills
    .filter(skill => {
      const targetHours = calcSkillTargetHours(skill.id, skills, skillPhaseMap, projectPhases, milestones)
      return targetHours > 0 && targetHours <= cumulativeHours && !certifiedIds.has(skill.id) && pendingIds.has(skill.id)
    })
    .sort((a, b) =>
      calcSkillTargetHours(a.id, skills, skillPhaseMap, projectPhases, milestones) -
      calcSkillTargetHours(b.id, skills, skillPhaseMap, projectPhases, milestones)
    )

  // 次に取り組むべきスキル（未認定 AND 未申請、目標時間順）
  const upcomingSkills = skills
    .filter(skill => !certifiedIds.has(skill.id) && !pendingIds.has(skill.id))
    .filter(skill => !overdueSkills.includes(skill))
    .sort((a, b) =>
      calcSkillTargetHours(a.id, skills, skillPhaseMap, projectPhases, milestones) -
      calcSkillTargetHours(b.id, skills, skillPhaseMap, projectPhases, milestones)
    )

  // 表示用: 遅延 + 申請中遅延 + 次のスキル を統合
  const allActionSkills = [
    ...overdueSkills.map(s => ({ ...s, _status: 'overdue' as const })),
    ...overduePendingSkills.map(s => ({ ...s, _status: 'pending' as const })),
  ]
  const hasOverdue = overdueSkills.length > 0 || overduePendingSkills.length > 0

  const firstName = employee.name.split(/\s/)[0]
  const fullName = employee.name
  const ACTION_LIMIT = 5
  const displayedAction = showAllOverdue ? allActionSkills : allActionSkills.slice(0, ACTION_LIMIT)

  return (
    <div className="p-4 space-y-4">
      {/* ウェルカムカード */}
      <Card className="bg-gradient-to-br from-orange-400 to-red-500 text-white border-0 shadow-lg">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-3 mb-3">
            <label htmlFor="dashboard-avatar" className="relative cursor-pointer group flex-shrink-0" title="写真を変更">
              <Avatar className="w-14 h-14 ring-2 ring-white/50">
                <AvatarImage src={avatarUrl ?? undefined} />
                <AvatarFallback className="bg-orange-300 text-white text-xl font-bold">{firstName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Camera className="w-4 h-4 text-white" />}
              </div>
            </label>
            <input id="dashboard-avatar" type="file" accept="image/*" className="hidden"
              onChange={e => { const file = e.target.files?.[0]; if (file) handleAvatarUpload(file); e.target.value = '' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-orange-100 text-sm">Enjoy your growth!</p>
              <div className="flex items-center gap-2 mb-1.5">
                <h2 className="text-2xl font-bold">{fullName} さん</h2>
                {instagramUrl && (
                  <a href={instagramUrl.startsWith('http') ? instagramUrl : `https://instagram.com/${instagramUrl.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="opacity-70 hover:opacity-100 transition-opacity">
                    <Instagram className="w-5 h-5 text-white" />
                  </a>
                )}
                {isOwnDashboard && !instagramUrl && (
                  <button onClick={() => { setInstagramInput(''); setInstagramDialogOpen(true) }} className="opacity-40 hover:opacity-70 transition-opacity" title="Instagramを設定">
                    <Instagram className="w-5 h-5 text-white" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {employee.hire_date && (
                  <span className="text-[10px] bg-white/15 text-orange-50 rounded-full px-2 py-0.5">{fmtHireDate(employee.hire_date)} 入社</span>
                )}
                <span className="text-[10px] bg-white/25 text-white font-semibold rounded-full px-2 py-0.5">{calcHireYear(employee.hire_date)}年目</span>
                {currentProject && (
                  <span className="text-[10px] bg-white/20 text-white rounded-full px-2 py-0.5">{currentProject.name}</span>
                )}
                {employee.role === 'manager' && <span className="text-[10px] bg-blue-400/40 text-blue-100 rounded-full px-2 py-0.5 font-medium">マネージャー</span>}
                {employee.role === 'ops_manager' && <span className="text-[10px] bg-purple-400/40 text-purple-100 rounded-full px-2 py-0.5 font-medium">運用管理者</span>}
                {employee.role === 'admin' && <span className="text-[10px] bg-red-400/40 text-red-100 rounded-full px-2 py-0.5 font-medium">開発者</span>}
              </div>
            </div>
          </div>

          {/* プロジェクト切り替え */}
          {employeeProjects.length > 1 && (
            <div className="mb-3 flex gap-1.5 flex-wrap">
              {employeeProjects.map(pj => (
                <button
                  key={pj.id}
                  onClick={() => router.push(`/?project_id=${pj.id}`)}
                  className={cn(
                    'text-[11px] rounded-full px-3 py-0.5 transition-colors',
                    pj.id === currentProject?.id
                      ? 'bg-white text-orange-600 font-bold'
                      : 'bg-white/20 text-white hover:bg-white/30'
                  )}
                >
                  {pj.name}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-4">
            <div>
              <p className="text-orange-100 text-xs">全体達成率</p>
              <p className="text-4xl font-black">{totalPct}<span className="text-xl">%</span></p>
            </div>
            <div className="ml-3">
              <p className="text-orange-100 text-xs">認定済み</p>
              <p className="text-2xl font-bold">{totalCertified}<span className="text-base text-orange-100">/{totalSkills}</span></p>
            </div>
            <div className="ml-5">
              <p className="text-orange-100 text-xs">申請中</p>
              <p className="text-2xl font-bold">{pendingIds.size}</p>
            </div>
            <div>
              <p className="text-orange-100 text-xs">未申請</p>
              <p className="text-2xl font-bold">{totalSkills - totalCertified - pendingIds.size}</p>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-orange-100 w-7 text-right flex-shrink-0">実績</span>
              <div className="flex-1 h-2.5 bg-white/30 rounded-full overflow-hidden flex">
                <div className="h-full bg-white transition-all" style={{ width: `${totalPct}%` }} />
                {totalPendingPct > 0 && (
                  <div className="h-full bg-yellow-300/70 transition-all" style={{ width: `${totalPendingPct}%` }} />
                )}
              </div>
              <span className="text-xs font-bold w-8 text-right flex-shrink-0">{totalPct}%</span>
            </div>
            {totalExpected > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-orange-100 w-7 text-right flex-shrink-0">標準</span>
                <Progress
                  value={totalSkills > 0 ? Math.round(totalExpected / totalSkills * 100) : 0}
                  className="flex-1 h-2.5 bg-white/20 [&>div]:bg-white/50"
                />
                <span className="text-xs font-bold text-white/70 w-8 text-right flex-shrink-0">
                  {totalSkills > 0 ? Math.round(totalExpected / totalSkills * 100) : 0}%
                </span>
              </div>
            )}
          </div>
          {totalExpected > 0 && (
            <div className={cn('mt-2 rounded-md px-3 py-1.5', gapSkills >= 0 ? 'bg-green-500/30 text-green-100' : 'bg-red-500/30 text-red-100')}>
              <p className="text-sm font-medium">
                {gapSkills >= 0 ? `▲ 標準より ${gapSkills}スキル分 進んでいます` : `▼ 標準より ${Math.abs(gapSkills)}スキル分 遅れています`}
              </p>
              {gapSkills < 0 && <p className="text-sm font-medium mt-0.5">一つ一つ、進めていきましょう！</p>}
            </div>
          )}
          {/* 目標 */}
          {goal ? (
            <div className="mt-3 bg-white/15 rounded-lg px-3 py-2">
              <div className="flex items-start gap-2">
                <Target className="w-3.5 h-3.5 text-orange-100 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{goal.content}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {goal.deadline && (
                      <span className="text-[10px] text-orange-100 flex items-center gap-0.5">
                        <CalendarDays className="w-3 h-3" />
                        {goal.deadline} まで
                      </span>
                    )}
                    <span className="text-[10px] text-orange-200/70">
                      {new Date(goal.set_at).toLocaleDateString('ja-JP')} 設定
                    </span>
                  </div>
                </div>
                {isOwnDashboard && (
                  <button onClick={() => { setGoalContent(goal.content); setGoalDeadline(goal.deadline ?? ''); setGoalDialogOpen(true) }} className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0">
                    <Pencil className="w-3.5 h-3.5 text-white" />
                  </button>
                )}
              </div>
            </div>
          ) : isOwnDashboard ? (
            <button onClick={() => { setGoalContent(''); setGoalDeadline(''); setGoalDialogOpen(true) }} className="mt-3 w-full bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-3 py-2 text-left">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-orange-200" />
                <p className="text-sm text-orange-100">目標を設定する</p>
              </div>
            </button>
          ) : null}
        </CardContent>
      </Card>

      {/* 未読通知 */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <Bell className="w-4 h-4 text-gray-500" />
            <p className="text-sm font-semibold text-gray-700">お知らせ</p>
          </div>
          {notifications.map(notification => (
            <Card key={notification.id} className={cn('border', notification.status === 'certified' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50')}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {notification.status === 'certified' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', notification.status === 'certified' ? 'text-green-700' : 'text-red-600')}>
                      {notification.status === 'certified' ? '認定されました！' : '差し戻しがあります'}
                    </p>
                    <p className="text-sm text-gray-800">{notification.skills?.name}</p>
                    {notification.certify_comment && (
                      <p className="text-xs text-gray-600 mt-1 bg-white/70 rounded px-2 py-1">💬 {notification.certify_comment}</p>
                    )}
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2 flex-shrink-0" onClick={() => handleMarkAsRead(notification.id)} disabled={isPending}>既読</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 対応が必要 */}
      {(pendingAchievementsCount > 0 || pendingTeamRequestsCount > 0) && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <ClipboardList className="w-4 h-4 text-blue-500" />
            <p className="text-sm font-semibold text-gray-700">対応が必要です</p>
          </div>
          {pendingAchievementsCount > 0 && (
            <Link href="/team?tab=pending">
              <Card className="border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-800">認定待ちのスキル申請</p>
                      <p className="text-xs text-blue-600">メンバーからの申請を確認してください</p>
                    </div>
                    <span className="text-2xl font-black text-blue-600 flex-shrink-0">{pendingAchievementsCount}<span className="text-xs font-normal ml-0.5">件</span></span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {pendingTeamRequestsCount > 0 && (
            <Link href="/admin/teams?tab=requests">
              <Card className="border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <ClipboardList className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-amber-800">チーム変更の申請審査</p>
                      <p className="text-xs text-amber-600">承認または差し戻しが必要な申請があります</p>
                    </div>
                    <span className="text-2xl font-black text-amber-600 flex-shrink-0">{pendingTeamRequestsCount}<span className="text-xs font-normal ml-0.5">件</span></span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      {/* 遅延スキル + 次に取り組むべきスキル */}
      {allActionSkills.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              今取り組むべきスキル（{allActionSkills.length}件）
            </CardTitle>
            <p className="text-xs text-amber-700 mt-0.5">
              現在 {cumulativeHours}h 時点で標準的に習得が求められているスキルです
              {overduePendingSkills.length > 0 && `（うち申請中 ${overduePendingSkills.length}件）`}
            </p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {displayedAction.map(skill => (
              <div key={skill.id} className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-3 py-2',
                skill._status === 'pending' ? 'bg-yellow-50 border border-yellow-200' : 'bg-white border border-amber-200'
              )}>
                <p className="text-sm text-gray-800 flex-1 min-w-0 truncate">{skill.name}</p>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge className={cn('text-[10px] border-0', getCategoryColor(skill.category, categories))}>{skill.category}</Badge>
                  {skill._status === 'pending' ? (
                    <Badge className="text-[10px] border-0 bg-yellow-200 text-yellow-800">申請中</Badge>
                  ) : (
                    <Button
                      size="sm" variant="outline"
                      className="group h-7 text-xs px-2 border-orange-200 text-orange-600 hover:bg-orange-100 hover:border-orange-400 hover:text-orange-700 flex-shrink-0"
                      onClick={() => { setApplyDialogSkill(skill); setApplyComment('') }}
                      disabled={isPending}
                    >
                      <span className="group-hover:hidden">申請する</span>
                      <span className="hidden group-hover:inline font-semibold">できました！</span>
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {allActionSkills.length > ACTION_LIMIT && (
              <Button variant="ghost" size="sm" className="w-full text-xs text-amber-700 hover:bg-amber-100 h-8" onClick={() => setShowAllOverdue(prev => !prev)}>
                {showAllOverdue ? <><ChevronUp className="w-3.5 h-3.5 mr-1" />閉じる</> : <><ChevronDown className="w-3.5 h-3.5 mr-1" />他 {allActionSkills.length - ACTION_LIMIT}件を表示</>}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* 次に取り組むスキル（自分で申請できる遅延スキルがない場合に表示） */}
      {overdueSkills.length === 0 && upcomingSkills.length > 0 && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              次のステップ（{Math.min(upcomingSkills.length, 5)}件）
            </CardTitle>
            <p className="text-xs text-blue-600 mt-0.5">順調です！次に習得を目指すスキルです</p>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {upcomingSkills.slice(0, 5).map(skill => (
              <div key={skill.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 py-2 border border-blue-200">
                <p className="text-sm text-gray-800 flex-1 min-w-0 truncate">{skill.name}</p>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge className={cn('text-[10px] border-0', getCategoryColor(skill.category, categories))}>{skill.category}</Badge>
                  <Button
                    size="sm" variant="outline"
                    className="group h-7 text-xs px-2 border-blue-200 text-blue-600 hover:bg-blue-100 hover:border-blue-400 hover:text-blue-700 flex-shrink-0"
                    onClick={() => { setApplyDialogSkill(skill); setApplyComment('') }}
                    disabled={isPending}
                  >
                    <span className="group-hover:hidden">申請する</span>
                    <span className="hidden group-hover:inline font-semibold">できました！</span>
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* レーダーチャート */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">スキルバランス</CardTitle></CardHeader>
        <CardContent><RadarChart data={radarData} /></CardContent>
      </Card>

      {/* フェーズ別進捗チャート */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">フェーズ別達成率</CardTitle></CardHeader>
        <CardContent>
          <PhaseProgressChart
            data={phaseStats}
            cumulativeHours={cumulativeHours}
            standardHours={projectPhases[projectPhases.length - 1]?.end_hours ?? 0}
          />
        </CardContent>
      </Card>

      {/* フェーズ別サマリーカード */}
      <div className={cn('grid gap-3', phaseStats.length <= 3 ? `grid-cols-${phaseStats.length}` : 'grid-cols-3')}>
        {phaseStats.map(({ phase, phaseId, label, total, certified, pending, pct, standardPct, diff, colorClass }) => (
          <Link key={phaseId} href={`/skills?phase=${encodeURIComponent(phase)}`}>
            <Card className="text-center overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="pt-3 pb-3 px-2">
                <Badge className={`${colorClass} text-white text-[10px] mb-0.5 border-0`}>{label}</Badge>
                <p className="text-2xl font-black text-gray-800">{pct}<span className="text-xs">%</span></p>
                {standardPct > 0 ? (
                  <>
                    <p className="text-[10px] text-gray-400">標準 {standardPct}%</p>
                    <p className={cn('text-[11px] font-bold mt-0.5', diff >= 5 ? 'text-green-600' : diff <= -5 ? 'text-red-500' : 'text-gray-500')}>
                      {diff > 0 ? `▲${diff}pt` : diff < 0 ? `▼${Math.abs(diff)}pt` : '±0'}
                    </p>
                  </>
                ) : (
                  <p className="text-[10px] text-gray-400">未開始</p>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">{certified}/{total}</p>
                {pending > 0 && <p className="text-[10px] text-amber-500">申請中 {pending}</p>}
                {total - certified - pending > 0 && <p className="text-[11px] font-bold text-orange-500">未申請 {total - certified - pending}</p>}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

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
                <Textarea placeholder="習得したポイントや、気付いたこと、学んだことなど" value={applyComment} onChange={e => setApplyComment(e.target.value)} className="text-sm min-h-[80px] resize-none" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={() => applyDialogSkill && handleRequest(applyDialogSkill, applyComment)} disabled={isPending}>
              できました！申請する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 目標設定ダイアログ */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">目標を設定する</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">目標</p>
              <Textarea placeholder="例: 調理スキルを全て取得する！" value={goalContent} onChange={e => setGoalContent(e.target.value)} className="text-sm min-h-[80px] resize-none" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">期限（任意）</p>
              <Input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} className="text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSaveGoal} disabled={isPending || !goalContent.trim()}>
              設定する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Instagram設定ダイアログ */}
      <Dialog open={instagramDialogOpen} onOpenChange={setInstagramDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">Instagramを設定する</DialogTitle></DialogHeader>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">InstagramのユーザーネームまたはURL</p>
            <Input placeholder="@username または https://instagram.com/..." value={instagramInput} onChange={e => setInstagramInput(e.target.value)} className="text-sm" />
          </div>
          <DialogFooter>
            <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={handleSaveInstagram} disabled={isPending}>
              保存する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
