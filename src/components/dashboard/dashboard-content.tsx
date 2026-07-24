'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { cn } from '@/lib/utils'
import { AlertTriangle, ChevronRight, Camera, Loader2, ClipboardList, Users, Instagram, Target, CalendarDays, Pencil, BookOpen, Building2, Undo2, Lightbulb } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { setSelectedProject } from '@/app/(dashboard)/actions'
import { SkillStatsContent } from '@/components/skills/skill-stats-content'
import { SkillPhotoInput } from '@/components/skills/skill-photo-input'
import { uploadSkillPhotos } from '@/lib/skill-photos'
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
  globalPendingAchievementsCount?: number
  teamPendingAchievementsCount?: number
  pendingTeamRequestsCount?: number
  currentGoal: (Pick<Goal, 'id' | 'content' | 'set_at' | 'deadline'> & { reason?: string }) | null
  isOwnDashboard: boolean
  careerSummary?: Record<string, string[]>
  storeName?: string | null
  position?: string | null
  internalCerts?: string[]
  employeeId?: string
  hasGoalRecords?: boolean
  skillManuals?: Record<string, { id: string; title: string; url: string; isPrimary: boolean }[]>
  rankingSlot?: React.ReactNode
  checkpointSlot?: React.ReactNode
  announcementsSlot?: React.ReactNode
  setupNoticeSlot?: React.ReactNode
  skillRankingSlot?: React.ReactNode
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
  globalPendingAchievementsCount = 0, teamPendingAchievementsCount = 0, pendingTeamRequestsCount = 0,
  currentGoal: initialGoal, isOwnDashboard, careerSummary = {}, storeName = null, position = null, internalCerts = [], employeeId, hasGoalRecords = false,
  skillManuals = {},
  rankingSlot, checkpointSlot, announcementsSlot, skillRankingSlot, setupNoticeSlot
}: Props) {
  const [expandedManuals, setExpandedManuals] = useState<Set<string>>(new Set())
  const [switchingProjectId, setSwitchingProjectId] = useState<string | null>(null)
  const [switchPending, startSwitchTransition] = useTransition()
  // 切り替えトランジション完了（サーバー再描画コミット）でスピナーを解除する
  useEffect(() => {
    if (!switchPending) setSwitchingProjectId(null)
  }, [switchPending])

  // マニュアルチップ描画（スキル一覧で再利用）
  function renderManualChips(skillId: string) {
    const list = skillManuals[skillId]
    if (!list || list.length === 0) return null
    const isExpanded = expandedManuals.has(skillId)
    const displayed = isExpanded ? list : list.slice(0, 3)
    const hiddenCount = list.length - 3
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {displayed.map(m => (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-0.5 text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 rounded px-1.5 py-0.5 border border-blue-100 max-w-[200px]"
            title={m.title}
          >
            <BookOpen className="w-2.5 h-2.5 flex-shrink-0" />
            <span className="truncate">{m.title}</span>
          </a>
        ))}
        {hiddenCount > 0 && (
          <button
            onClick={e => {
              e.stopPropagation()
              setExpandedManuals(prev => {
                const next = new Set(prev)
                if (isExpanded) next.delete(skillId); else next.add(skillId)
                return next
              })
            }}
            className="inline-flex items-center text-[10px] text-orange-700 bg-orange-50 hover:bg-orange-100 rounded px-1.5 py-0.5 border border-orange-200 font-medium"
          >
            {isExpanded ? '閉じる ▲' : `他 ${hiddenCount}件 ▼`}
          </button>
        )}
      </div>
    )
  }
  const [achievementList, setAchievementList] = useState(initialAchievements)
  const [isPending, startTransition] = useTransition()
  const [applyDialogSkill, setApplyDialogSkill] = useState<Skill | null>(null)
  const [applyComment, setApplyComment] = useState('')
  const [applyPhotos, setApplyPhotos] = useState<File[]>([])
  const [avatarUrl, setAvatarUrl] = useState(employee.avatar_url)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
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
  const rejectedIds = new Set(achievementList.filter(a => a.status === 'rejected').map(a => a.skill_id))

  const handleRequest = (skill: Skill, comment?: string, photos: File[] = []) => {
    if (!isOwnDashboard) {
      toast.error('プレビュー中は申請できません', { description: 'プレビュー（view-as）を解除し、ご自身のアカウントでお試しください' })
      return
    }
    // 既存行があるか（差し戻し済みなら再申請＝同じ行を更新。新規INSERTは重複キー違反になる）
    const existing = achievementList.find(a => a.skill_id === skill.id)
    if (existing && (existing.status === 'certified' || existing.status === 'pending')) return
    startTransition(async () => {
      let photoPaths: string[] = []
      if (photos.length > 0) {
        try { photoPaths = await uploadSkillPhotos(skill.id, photos) }
        catch (e) { toast.error('写真のアップロードに失敗しました', { description: (e as Error)?.message }); return }
      }
      const photoField = photoPaths.length > 0 ? { photo_paths: photoPaths } : {}
      if (existing) {
        // 差し戻し → 再申請
        const { data, error } = await supabase
          .from('achievements')
          .update({ status: 'pending', achieved_at: new Date().toISOString(), apply_comment: comment?.trim() || null, certify_comment: null, ...photoField })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) { toast.error('申請に失敗しました', { description: error.message }); return }
        setAchievementList(prev => prev.map(a => a.id === existing.id ? data : a))
        await supabase.from('achievement_history').insert({ achievement_id: existing.id, action: 'reapply' as const, actor_id: employee.id, comment: comment?.trim() || null })
      } else {
        const { data, error } = await supabase
          .from('achievements')
          .insert({ employee_id: employee.id, skill_id: skill.id, status: 'pending', apply_comment: comment?.trim() || null, photo_paths: photoPaths })
          .select()
          .single()
        if (error) { toast.error('申請に失敗しました', { description: error.message }); return }
        setAchievementList(prev => [...prev, data])
        await supabase.from('achievement_history').insert({ achievement_id: data.id, action: 'apply' as const, actor_id: employee.id, comment: comment?.trim() || null })
      }
      fetch('/api/skill-notification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: employee.id, skillName: skill.name, isReapply: !!existing, comment: comment?.trim() || null }) }).catch(() => {})
      setApplyDialogSkill(null)
      setApplyComment('')
      setApplyPhotos([])
      toast.success(`「${skill.name}」を申請しました！`, { description: '認定者の確認をお待ちください' })
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

  // カテゴリ一覧をスキルデータから動的取得（スキル行の色分け等で使用）
  const categories = sortCategories([...new Set(skills.map(s => s.category))])

  const totalCertified = certifiedIds.size
  const totalPending = pendingIds.size
  const totalSkills = skills.length
  const totalPct = totalSkills > 0 ? Math.round((totalCertified / totalSkills) * 100) : 0
  const totalPendingPct = totalSkills > 0 ? Math.round((totalPending / totalSkills) * 100) : 0

  const totalExpected = phaseStats.reduce((sum, { standardPct, total }) => sum + Math.round(standardPct * total / 100), 0)
  const gapSkills = totalCertified - totalExpected

  // 遅延スキル（未認定 AND 未申請、目標時間を過ぎている）
  const overdueSkills = skills
    .filter(skill => {
      const targetHours = calcSkillTargetHours(skill.id, skills, skillPhaseMap, projectPhases, milestones)
      return targetHours > 0 && targetHours <= cumulativeHours && !certifiedIds.has(skill.id) && !pendingIds.has(skill.id) && !rejectedIds.has(skill.id)
    })
    .sort((a, b) =>
      calcSkillTargetHours(a.id, skills, skillPhaseMap, projectPhases, milestones) -
      calcSkillTargetHours(b.id, skills, skillPhaseMap, projectPhases, milestones)
    )

  const firstName = employee.name.split(/\s/)[0]
  const fullName = employee.name

  return (
    <div className="p-4 space-y-4">
      {/* ウェルカムカード */}
      <Card className="bg-gradient-to-br from-orange-400 to-red-500 text-white border-0 shadow-lg">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-3 mb-3">
            <label htmlFor="dashboard-avatar" className="relative cursor-pointer group flex-shrink-0" title="写真を変更">
              <CertRingAvatar employeeId={employee.id} src={avatarUrl} name={firstName} size={56} avatarClassName="ring-2 ring-white/50" fallbackClassName="bg-orange-300 text-white" />
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
                <Link href={`/admin/employees/${employee.id}`} className="text-2xl font-bold hover:underline decoration-white/50 transition-colors">{fullName} さん</Link>
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
                {storeName && (
                  <span className="text-[10px] bg-white/20 text-white rounded-full px-2 py-0.5">{storeName}</span>
                )}
                {currentProject && (
                  <span className="text-[10px] bg-white/15 text-orange-100 rounded-full px-2 py-0.5">{currentProject.name}</span>
                )}
                {employee.role === 'store_manager' && <span className="text-[10px] bg-teal-400/40 text-teal-100 rounded-full px-2 py-0.5 font-medium">店長</span>}
                {employee.role === 'manager' && <span className="text-[10px] bg-blue-400/40 text-blue-100 rounded-full px-2 py-0.5 font-medium">マネジャー</span>}
                {employee.role === 'ops_manager' && <span className="text-[10px] bg-purple-400/40 text-purple-100 rounded-full px-2 py-0.5 font-medium">運用管理者</span>}
                {employee.role === 'executive' && <span className="text-[10px] bg-rose-400/40 text-rose-100 rounded-full px-2 py-0.5 font-medium">役員</span>}
                {employee.role === 'admin' && <span className="text-[10px] bg-red-400/40 text-red-100 rounded-full px-2 py-0.5 font-medium">開発者</span>}
                {position && <span className="text-[10px] bg-sky-400/40 text-sky-100 rounded-full px-2 py-0.5 font-medium">{position}</span>}
                {internalCerts.map(name => (
                  <span key={name} className="text-[10px] bg-emerald-400/40 text-emerald-100 rounded-full px-2 py-0.5 font-medium">{name}</span>
                ))}
              </div>
              {/* キャリア情報 */}
              {Object.keys(careerSummary).length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                  {['面接', '採用', '育成'].map(type => {
                    const names = careerSummary[type]
                    if (!names?.length) return null
                    return (
                      <span key={type} className="text-[10px] text-orange-100">
                        {type}: <span className="text-white font-medium">{names.join('・')}</span>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* 習得カリキュラム切り替え */}
          {employeeProjects.length > 1 && (
            <div className="mb-3 flex gap-1.5 flex-wrap">
              {employeeProjects.map(pj => {
                const isSwitching = switchingProjectId === pj.id
                const isSelected = pj.id === currentProject?.id
                const disabled = switchingProjectId !== null
                return (
                  <button
                    key={pj.id}
                    disabled={disabled}
                    onClick={() => {
                      if (isSelected || switchingProjectId) return
                      setSwitchingProjectId(pj.id)
                      startSwitchTransition(async () => {
                        await setSelectedProject(pj.id)
                        router.replace(`/?project_id=${pj.id}`)
                      })
                    }}
                    className={cn(
                      'text-[11px] rounded-full px-3 py-0.5 transition-all flex items-center gap-1',
                      isSelected
                        ? 'bg-white text-orange-600 font-bold'
                        : 'bg-white/20 text-white hover:bg-white/30',
                      disabled && !isSwitching && 'opacity-50',
                      isSwitching && 'bg-white/40 text-white'
                    )}
                  >
                    {isSwitching && <Loader2 className="w-3 h-3 animate-spin" />}
                    {pj.name}
                  </button>
                )
              })}
            </div>
          )}

          <SkillStatsContent
            totalPct={totalPct}
            totalCertified={totalCertified}
            totalSkills={totalSkills}
            totalPending={totalPending}
            totalRejected={achievementList.filter(a => a.status === 'rejected').length}
            totalUnapplied={totalSkills - totalCertified - totalPending - achievementList.filter(a => a.status === 'rejected').length}
            totalPendingPct={totalPendingPct}
            standardPct={totalExpected > 0 && totalSkills > 0 ? Math.round(totalExpected / totalSkills * 100) : 0}
          />
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
                  {goal.reason && <p className="text-[10px] text-orange-100 mt-0.5">目的：{goal.reason}</p>}
                  {goal.deadline && (
                    <span className="text-[10px] text-orange-200/70 flex items-center gap-0.5 mt-0.5">
                      <CalendarDays className="w-3 h-3" />
                      {goal.deadline} まで
                    </span>
                  )}
                </div>
                {isOwnDashboard && employeeId && (
                  <Link href={`/admin/employees/${employeeId}#目標`} className="opacity-50 hover:opacity-100 transition-opacity flex-shrink-0">
                    <Pencil className="w-3.5 h-3.5 text-white" />
                  </Link>
                )}
              </div>
            </div>
          ) : isOwnDashboard && employeeId ? (
            <Link href={`/admin/employees/${employeeId}?add=目標`} className="mt-3 block w-full bg-white/10 hover:bg-white/20 transition-colors rounded-lg px-3 py-2 text-left">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-orange-200" />
                <p className="text-sm text-orange-100">目標を設定する</p>
              </div>
            </Link>
          ) : null}
        </CardContent>
      </Card>

      {setupNoticeSlot}

      {/* ⚠️ 対応が必要（全社未承認・自チーム未承認・チーム変更承認依頼・期限遅れ・差し戻しをここに集約） */}
      {(() => {
        const rejectedCount = achievementList.filter(a => a.status === 'rejected').length
        const overdueCount = currentProject ? overdueSkills.length : 0
        const hasAction = globalPendingAchievementsCount > 0 || teamPendingAchievementsCount > 0 || pendingTeamRequestsCount > 0 || overdueCount > 0 || rejectedCount > 0
        if (!hasAction) return null
        return (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm font-semibold text-gray-700">対応が必要です</p>
          </div>
          {globalPendingAchievementsCount > 0 && (
            <Link href="/approvals">
              <Card className="border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-indigo-800 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />全社の認定待ちスキル申請
                      </p>
                      <p className="text-xs text-indigo-600">承認センターで全社の申請を確認できます</p>
                    </div>
                    <span className="text-2xl font-black text-indigo-600 flex-shrink-0">{globalPendingAchievementsCount}<span className="text-xs font-normal ml-0.5">件</span></span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {teamPendingAchievementsCount > 0 && (
            <Link href="/team?tab=pending">
              <Card className="border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-800 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />担当チームの認定待ちスキル申請
                      </p>
                      <p className="text-xs text-blue-600">あなたが担当するチームのメンバーの申請を認定できます</p>
                    </div>
                    <span className="text-2xl font-black text-blue-600 flex-shrink-0">{teamPendingAchievementsCount}<span className="text-xs font-normal ml-0.5">件</span></span>
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
                      <p className="text-sm font-medium text-amber-800">チーム変更の承認依頼</p>
                      <p className="text-xs text-amber-600">承認または差し戻しが必要な申請があります</p>
                    </div>
                    <span className="text-2xl font-black text-amber-600 flex-shrink-0">{pendingTeamRequestsCount}<span className="text-xs font-normal ml-0.5">件</span></span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}
          {/* 期限遅れスキル */}
          {overdueCount > 0 && currentProject && (
            <Link href="/skills" className="block">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 hover:bg-red-100 transition-colors flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-700">
                    「{currentProject.name}」のスキル習得が <span className="text-red-600">{overdueCount}件</span> 遅れています
                  </p>
                  <p className="text-xs text-red-500">タップして、今やるべきスキルを確認しましょう</p>
                </div>
                <ChevronRight className="w-4 h-4 text-red-400 flex-shrink-0" />
              </div>
            </Link>
          )}
          {/* 差し戻しスキル */}
          {rejectedCount > 0 && (
            <Link href="/skills?tab=rejected" className="block">
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 hover:bg-orange-100 transition-colors flex items-center gap-3">
                <Undo2 className="w-5 h-5 text-orange-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-orange-700">
                    差し戻されたスキルが <span className="text-orange-600">{rejectedCount}件</span> あります
                  </p>
                  <p className="text-xs text-orange-500">タップして、内容を確認して再申請しましょう</p>
                </div>
                <ChevronRight className="w-4 h-4 text-orange-400 flex-shrink-0" />
              </div>
            </Link>
          )}
        </div>
        )
      })()}

      {announcementsSlot}

      {rankingSlot}
      {skillRankingSlot}
      {checkpointSlot}

      {/* 改善提案・ご要望 */}
      <Link href="/improvements" className="block">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800">改善提案・ご要望</p>
            <p className="text-xs text-gray-500">アプリへのアイデアや困りごとを送れます</p>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
        </div>
      </Link>

      {/* 申請ダイアログ */}
      <Dialog open={applyDialogSkill !== null} onOpenChange={open => { if (!open) { setApplyDialogSkill(null); setApplyComment(''); setApplyPhotos([]) } }}>
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
              <SkillPhotoInput files={applyPhotos} onChange={setApplyPhotos} disabled={isPending} />
            </div>
          )}
          <DialogFooter>
            <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white" onClick={() => applyDialogSkill && handleRequest(applyDialogSkill, applyComment, applyPhotos)} disabled={isPending}>
              {isPending ? '申請中...' : 'できました！申請する'}
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
