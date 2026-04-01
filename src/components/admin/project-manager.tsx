'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, GripVertical, UserMinus, UserPlus, ChevronDown, ChevronRight, MapPin, Store, FolderKanban, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateSkillCategory, updateSkillStandardHours, updateSkillName, toggleSkillCheckpoint, createSkill, deleteSkill, reorderSkills, updateSkillTargetDate } from '@/app/(dashboard)/actions'
import { sortCategories } from '@/lib/category-order'
import { cn } from '@/lib/utils'
import type { SkillProject, ProjectPhase, ProjectSkill, Skill, Team } from '@/types/database'

interface Props {
  projects: SkillProject[]
  phases: ProjectPhase[]
  projectSkills: ProjectSkill[]
  projectTeams: { project_id: string; team_id: string }[]
  allSkills: Skill[]
  teams: Pick<Team, 'id' | 'name' | 'type' | 'prefecture'>[]
}

const CATEGORY_ROW_COLORS: Record<number, { checked: string; unchecked: string }> = {
  0: { checked: 'bg-blue-50 border-blue-200', unchecked: 'bg-blue-50/30 border-blue-100' },
  1: { checked: 'bg-green-50 border-green-200', unchecked: 'bg-green-50/30 border-green-100' },
  2: { checked: 'bg-purple-50 border-purple-200', unchecked: 'bg-purple-50/30 border-purple-100' },
  3: { checked: 'bg-amber-50 border-amber-200', unchecked: 'bg-amber-50/30 border-amber-100' },
  4: { checked: 'bg-red-50 border-red-200', unchecked: 'bg-red-50/30 border-red-100' },
  5: { checked: 'bg-teal-50 border-teal-200', unchecked: 'bg-teal-50/30 border-teal-100' },
  6: { checked: 'bg-pink-50 border-pink-200', unchecked: 'bg-pink-50/30 border-pink-100' },
  7: { checked: 'bg-indigo-50 border-indigo-200', unchecked: 'bg-indigo-50/30 border-indigo-100' },
}

// カテゴリはスキルデータから動的に取得（コンポーネント内で計算）

export function ProjectManager({
  projects: initialProjects,
  phases: initialPhases,
  projectSkills: initialProjectSkills,
  projectTeams: initialProjectTeams,
  allSkills,
  teams,
}: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [expandedStorePrefs, setExpandedStorePrefs] = useState<Set<string>>(new Set())
  const [showStoreTeams, setShowStoreTeams] = useState(false)
  const [skillsState, setSkillsState] = useState(allSkills)
  const categories = sortCategories([...new Set(skillsState.map(s => s.category))])
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)
  const [newCategoryForSkillId, setNewCategoryForSkillId] = useState<string | null>(null)
  const [showNewSkillDialog, setShowNewSkillDialog] = useState(false)
  const [newSkillName, setNewSkillName] = useState('')
  const [newSkillCategory, setNewSkillCategory] = useState('')
  const [dragSkillId, setDragSkillId] = useState<string | null>(null)
  const [dragOverInfo, setDragOverInfo] = useState<{ skillId: string; position: 'before' | 'after' } | null>(null)

  // ---- state ----
  const [projects, setProjects] = useState(initialProjects)
  const [phases, setPhases] = useState(initialPhases)
  const [projectSkills, setProjectSkills] = useState(initialProjectSkills)
  const [projectTeamsState, setProjectTeamsState] = useState(initialProjectTeams)

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjects[0]?.id ?? null
  )

  // プロジェクト作成・編集ダイアログ
  const [projectDialog, setProjectDialog] = useState<{ open: boolean; editing: SkillProject | null }>({ open: false, editing: null })
  const [projectName, setProjectName] = useState('')
  const [projectDesc, setProjectDesc] = useState('')

  // フェーズ追加ダイアログ
  const [phaseDialog, setPhaseDialog] = useState(false)
  const [phaseName, setPhaseName] = useState('')
  const [phaseHours, setPhaseHours] = useState('')

  // フェーズ編集ダイアログ
  const [editPhaseDialog, setEditPhaseDialog] = useState<ProjectPhase | null>(null)
  const [editPhaseName, setEditPhaseName] = useState('')
  const [editPhaseHours, setEditPhaseHours] = useState('')

  // ---- helpers ----
  const selectedProject = projects.find(p => p.id === selectedProjectId) ?? null
  const selectedPhases = phases.filter(p => p.project_id === selectedProjectId).sort((a, b) => a.order_index - b.order_index)
  const selectedProjectSkillIds = new Set(
    projectSkills.filter(ps => ps.project_id === selectedProjectId).map(ps => ps.skill_id)
  )
  const skillPhaseMap: Record<string, string | null> = {}
  for (const ps of projectSkills.filter(ps => ps.project_id === selectedProjectId)) {
    skillPhaseMap[ps.skill_id] = ps.project_phase_id
  }
  const linkedTeamIds = new Set(
    projectTeamsState.filter(pt => pt.project_id === selectedProjectId).map(pt => pt.team_id)
  )

  // ===== プロジェクト操作 =====

  function openCreateProject() {
    setProjectName('')
    setProjectDesc('')
    setProjectDialog({ open: true, editing: null })
  }

  function openEditProject(p: SkillProject) {
    setProjectName(p.name)
    setProjectDesc(p.description ?? '')
    setProjectDialog({ open: true, editing: p })
  }

  function handleSaveProject() {
    if (!projectName.trim()) { toast.error('プロジェクト名を入力してください'); return }
    startTransition(async () => {
      if (projectDialog.editing) {
        const { data, error } = await supabase
          .from('skill_projects')
          .update({ name: projectName.trim(), description: projectDesc.trim() || null })
          .eq('id', projectDialog.editing.id)
          .select()
          .single()
        if (error) { toast.error('更新に失敗しました'); return }
        setProjects(prev => prev.map(p => p.id === data.id ? data : p))
        toast.success('プロジェクトを更新しました')
      } else {
        const { data, error } = await supabase
          .from('skill_projects')
          .insert({ name: projectName.trim(), description: projectDesc.trim() || null })
          .select()
          .single()
        if (error) { toast.error('作成に失敗しました'); return }
        setProjects(prev => [...prev, data])
        setSelectedProjectId(data.id)
        toast.success('プロジェクトを作成しました')
      }
      setProjectDialog({ open: false, editing: null })
    })
  }

  function handleToggleArchive(project: SkillProject) {
    startTransition(async () => {
      const { data, error } = await supabase
        .from('skill_projects')
        .update({ is_active: !project.is_active })
        .eq('id', project.id)
        .select()
        .single()
      if (error) { toast.error('変更に失敗しました'); return }
      setProjects(prev => prev.map(p => p.id === data.id ? data : p))
      toast.success(data.is_active ? 'プロジェクトを有効化しました' : 'アーカイブしました')
    })
  }

  // ===== フェーズ操作 =====

  function handleAddPhase() {
    if (!selectedProjectId) return
    if (!phaseName.trim()) { toast.error('フェーズ名を入力してください'); return }
    const endHoursVal = parseInt(phaseHours)
    if (isNaN(endHoursVal) || endHoursVal <= 0) { toast.error('目標時間を正しく入力してください'); return }
    const nextOrder = selectedPhases.length > 0 ? Math.max(...selectedPhases.map(p => p.order_index)) + 1 : 0
    startTransition(async () => {
      const { data, error } = await supabase
        .from('project_phases')
        .insert({ project_id: selectedProjectId, name: phaseName.trim(), order_index: nextOrder, end_hours: endHoursVal })
        .select()
        .single()
      if (error) { toast.error('フェーズの追加に失敗しました'); return }
      setPhases(prev => [...prev, data])
      setPhaseName('')
      setPhaseHours('')
      setPhaseDialog(false)
      toast.success('フェーズを追加しました')
    })
  }

  function openEditPhase(phase: ProjectPhase) {
    setEditPhaseName(phase.name)
    setEditPhaseHours(String(phase.end_hours))
    setEditPhaseDialog(phase)
  }

  function handleSavePhase() {
    if (!editPhaseDialog) return
    if (!editPhaseName.trim()) { toast.error('フェーズ名を入力してください'); return }
    const endHoursVal = parseInt(editPhaseHours)
    if (isNaN(endHoursVal) || endHoursVal <= 0) { toast.error('目標時間を正しく入力してください'); return }
    startTransition(async () => {
      const { data, error } = await supabase
        .from('project_phases')
        .update({ name: editPhaseName.trim(), end_hours: endHoursVal })
        .eq('id', editPhaseDialog.id)
        .select()
        .single()
      if (error) { toast.error('更新に失敗しました'); return }
      setPhases(prev => prev.map(p => p.id === data.id ? data : p))
      setEditPhaseDialog(null)
      toast.success('フェーズを更新しました')
    })
  }

  function handleDeletePhase(phaseId: string) {
    startTransition(async () => {
      const { error } = await supabase.from('project_phases').delete().eq('id', phaseId)
      if (error) { toast.error('削除に失敗しました'); return }
      setPhases(prev => prev.filter(p => p.id !== phaseId))
      setProjectSkills(prev => prev.map(ps => ps.project_phase_id === phaseId ? { ...ps, project_phase_id: null } : ps))
      toast.success('フェーズを削除しました')
    })
  }

  // ===== スキル紐づけ操作 =====

  function handleToggleSkill(skillId: string, checked: boolean) {
    if (!selectedProjectId) return
    startTransition(async () => {
      if (checked) {
        const { data, error } = await supabase
          .from('project_skills')
          .insert({ project_id: selectedProjectId, skill_id: skillId, project_phase_id: null })
          .select()
          .single()
        if (error) { toast.error('スキルの追加に失敗しました'); return }
        setProjectSkills(prev => [...prev, data])
      } else {
        const { error } = await supabase
          .from('project_skills')
          .delete()
          .eq('project_id', selectedProjectId)
          .eq('skill_id', skillId)
        if (error) { toast.error('スキルの削除に失敗しました'); return }
        setProjectSkills(prev => prev.filter(ps => !(ps.project_id === selectedProjectId && ps.skill_id === skillId)))
      }
    })
  }

  function handleChangeSkillPhase(skillId: string, phaseId: string | null) {
    if (!selectedProjectId) return
    startTransition(async () => {
      const { data, error } = await supabase
        .from('project_skills')
        .update({ project_phase_id: phaseId })
        .eq('project_id', selectedProjectId)
        .eq('skill_id', skillId)
        .select()
        .single()
      if (error) { toast.error('フェーズの変更に失敗しました'); return }
      setProjectSkills(prev => prev.map(ps =>
        ps.project_id === selectedProjectId && ps.skill_id === skillId ? data : ps
      ))
    })
  }

  function handleChangeSkillCategory(skillId: string, newCategory: string) {
    startTransition(async () => {
      const result = await updateSkillCategory(skillId, newCategory)
      if (result.error) { toast.error(`カテゴリの変更に失敗しました: ${result.error}`); return }
      setSkillsState(prev => prev.map(s => s.id === skillId ? { ...s, category: newCategory } : s))
      toast.success('カテゴリを変更しました')
    })
  }

  function handleChangeStandardHours(skillId: string, value: string) {
    const hours = value === '' ? null : parseInt(value, 10)
    if (value !== '' && isNaN(hours as number)) return
    setSkillsState(prev => prev.map(s => s.id === skillId ? { ...s, standard_hours: hours } : s))
    startTransition(async () => {
      const result = await updateSkillStandardHours(skillId, hours)
      if (result.error) toast.error(`保存に失敗: ${result.error}`)
    })
  }

  function handleDrop(targetSkillId: string, targetPhaseId: string) {
    if (!dragSkillId || dragSkillId === targetSkillId) {
      setDragSkillId(null)
      setDragOverInfo(null)
      return
    }
    const dragSkill = skillsState.find(s => s.id === dragSkillId)
    if (!dragSkill) return

    // フェーズ変更（異なるフェーズにドロップした場合）
    const currentPhaseId = skillPhaseMap[dragSkillId]
    if (currentPhaseId !== targetPhaseId && targetPhaseId !== '__unassigned__') {
      handleChangeSkillPhase(dragSkillId, targetPhaseId)
    }

    // 並び順変更: 同じカテゴリ内で順番を入れ替え
    const targetSkill = skillsState.find(s => s.id === targetSkillId)
    if (targetSkill) {
      const pos = dragOverInfo?.position ?? 'after'
      // order_indexを再計算
      const allSorted = [...skillsState].sort((a, b) => a.order_index - b.order_index)
      const without = allSorted.filter(s => s.id !== dragSkillId)
      const targetIdx = without.findIndex(s => s.id === targetSkillId)
      const insertIdx = pos === 'before' ? targetIdx : targetIdx + 1
      without.splice(insertIdx, 0, dragSkill)
      const updated = without.map((s, i) => ({ ...s, order_index: i + 1 }))
      setSkillsState(updated)
      // DB保存（バッチ）
      startTransition(async () => {
        await reorderSkills(updated.map(s => s.id))
      })
    }

    setDragSkillId(null)
    setDragOverInfo(null)
  }

  function handleToggleCheckpoint(skillId: string, current: boolean) {
    setSkillsState(prev => prev.map(s => s.id === skillId ? { ...s, is_checkpoint: !current } : s))
    startTransition(async () => {
      const result = await toggleSkillCheckpoint(skillId, !current)
      if (result.error) toast.error(result.error)
    })
  }

  function handleChangeTargetDate(skillId: string, value: string) {
    const date = value || null
    setSkillsState(prev => prev.map(s => s.id === skillId ? { ...s, target_date_hint: date } : s))
    startTransition(async () => {
      const result = await updateSkillTargetDate(skillId, date)
      if (result.error) toast.error(result.error)
    })
  }

  function handleRenameSkill(skillId: string, newName: string) {
    if (!newName.trim()) return
    setSkillsState(prev => prev.map(s => s.id === skillId ? { ...s, name: newName.trim() } : s))
    startTransition(async () => {
      const result = await updateSkillName(skillId, newName.trim())
      if (result.error) toast.error(result.error)
    })
  }

  // ===== メンバー操作 =====

  function handleToggleTeam(teamId: string, isLinked: boolean) {
    if (!selectedProjectId) return
    startTransition(async () => {
      if (isLinked) {
        const { error } = await supabase
          .from('project_teams')
          .delete()
          .eq('project_id', selectedProjectId)
          .eq('team_id', teamId)
        if (error) { toast.error('チームの削除に失敗しました'); return }
        setProjectTeamsState(prev => prev.filter(pt => !(pt.project_id === selectedProjectId && pt.team_id === teamId)))
        toast.success('チームを外しました')
      } else {
        const { error } = await supabase
          .from('project_teams')
          .insert({ project_id: selectedProjectId, team_id: teamId })
        if (error) { toast.error('チームの追加に失敗しました'); return }
        setProjectTeamsState(prev => [...prev, { project_id: selectedProjectId, team_id: teamId }])
        toast.success('チームを追加しました')
      }
    })
  }

  // ===== Render =====
  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">

      {/* プロジェクト選択 + 作成ボタン */}
      <div className="flex items-center gap-2">
        <Select value={selectedProjectId ?? ''} onValueChange={v => setSelectedProjectId(v)}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="プロジェクトを選択" />
          </SelectTrigger>
          <SelectContent>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>
                <div className="flex items-center gap-2">
                  <span>{p.name}</span>
                  {!p.is_active && <Badge className="text-[9px] bg-gray-100 text-gray-500 border-0 px-1">アーカイブ</Badge>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={openCreateProject} disabled={isPending}>
          <Plus className="w-4 h-4 mr-1" />
          新規
        </Button>
      </div>

      {selectedProject && (
        <>
          {/* プロジェクト情報ヘッダー */}
          <Card>
            <CardContent className="pt-4 pb-4 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900">{selectedProject.name}</h2>
                    {selectedProject.is_active
                      ? <Badge className="bg-green-100 text-green-700 border-0 text-[10px]">有効</Badge>
                      : <Badge className="bg-gray-100 text-gray-500 border-0 text-[10px]">アーカイブ</Badge>
                    }
                  </div>
                  {selectedProject.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{selectedProject.description}</p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => openEditProject(selectedProject)} disabled={isPending}>
                    <Pencil className="w-3.5 h-3.5 mr-1" />編集
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => handleToggleArchive(selectedProject)} disabled={isPending}>
                    {selectedProject.is_active
                      ? <><Archive className="w-3.5 h-3.5 mr-1" />アーカイブ</>
                      : <><ArchiveRestore className="w-3.5 h-3.5 mr-1" />有効化</>
                    }
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* タブ */}
          <Tabs defaultValue="phases">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="phases">フェーズ</TabsTrigger>
              <TabsTrigger value="skills">スキル</TabsTrigger>
              <TabsTrigger value="members">チーム</TabsTrigger>
            </TabsList>

            {/* ===== フェーズタブ ===== */}
            <TabsContent value="phases" className="space-y-3 mt-3">
              <div className="space-y-2">
                {selectedPhases.map((phase, index) => (
                  <Card key={phase.id}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 w-5 text-right">{index + 1}</span>
                            <p className="text-sm font-semibold text-gray-800">{phase.name}</p>
                            <Badge className="bg-orange-100 text-orange-700 border-0 text-[10px]">{phase.end_hours}h</Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground ml-7">
                            目標累計時間: {phase.end_hours}h（{Math.floor(phase.end_hours / 8)}日）
                          </p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditPhase(phase)} disabled={isPending}>
                            <Pencil className="w-3.5 h-3.5 text-gray-400" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleDeletePhase(phase.id)} disabled={isPending}>
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setPhaseDialog(true)} disabled={isPending}>
                <Plus className="w-4 h-4 mr-1" />
                フェーズを追加
              </Button>
            </TabsContent>

            {/* ===== スキルタブ ===== */}
            <TabsContent value="skills" className="space-y-4 mt-3">
              {selectedPhases.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">先にフェーズを作成してください</p>
              )}
              {[...selectedPhases, { id: '__unassigned__', name: '未割当', order_index: 9999, project_id: '', end_hours: 0, created_at: '' }].map(phase => {
                const phaseSkills = phase.id === '__unassigned__'
                  ? skillsState.filter(s => !selectedProjectSkillIds.has(s.id) || !skillPhaseMap[s.id])
                  : skillsState.filter(s => skillPhaseMap[s.id] === phase.id)
                const sorted = phaseSkills.sort((a, b) => {
                  const catA = categories.indexOf(a.category)
                  const catB = categories.indexOf(b.category)
                  if (catA !== catB) return catA - catB
                  return a.order_index - b.order_index
                })
                if (sorted.length === 0) return null
                return (
                  <div
                    key={phase.id}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      if (dragSkillId && phase.id !== '__unassigned__') {
                        handleChangeSkillPhase(dragSkillId, phase.id)
                        setDragSkillId(null)
                        setDragOverInfo(null)
                      }
                    }}
                  >
                    <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">{phase.name}</h3>
                    <div className="space-y-1.5">
                      {sorted.map(skill => {
                        const isChecked = selectedProjectSkillIds.has(skill.id)
                        const currentPhaseId = skillPhaseMap[skill.id] ?? null
                        const isDragging = dragSkillId === skill.id
                        const isDragOver = dragOverInfo?.skillId === skill.id
                        return (
                          <div
                            key={skill.id}
                            draggable
                            onDragStart={() => setDragSkillId(skill.id)}
                            onDragEnd={() => { setDragSkillId(null); setDragOverInfo(null) }}
                            onDragOver={e => {
                              e.preventDefault()
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                              const pos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                              setDragOverInfo({ skillId: skill.id, position: pos })
                            }}
                            onDrop={e => { e.preventDefault(); handleDrop(skill.id, phase.id) }}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-3 py-2 border border-l-4 transition-all cursor-grab active:cursor-grabbing',
                              isDragging && 'opacity-30',
                              isDragOver && dragOverInfo?.position === 'before' && 'border-t-2 border-t-orange-500',
                              isDragOver && dragOverInfo?.position === 'after' && 'border-b-2 border-b-orange-500',
                              (() => {
                                const catIdx = categories.indexOf(skill.category)
                                const colors = CATEGORY_ROW_COLORS[catIdx % Object.keys(CATEGORY_ROW_COLORS).length] ?? CATEGORY_ROW_COLORS[0]
                                return isChecked ? colors.checked : colors.unchecked
                              })()
                            )}
                          >
                            <Checkbox
                              id={`skill-${skill.id}`}
                              checked={isChecked}
                              onCheckedChange={checked => handleToggleSkill(skill.id, !!checked)}
                              disabled={isPending}
                            />
                            <button
                              onClick={() => handleToggleCheckpoint(skill.id, skill.is_checkpoint)}
                              className={cn(
                                'text-[9px] font-bold rounded px-1 py-0.5 flex-shrink-0 transition-colors',
                                skill.is_checkpoint ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-400 hover:bg-gray-300'
                              )}
                              disabled={isPending}
                              title="チェックポイント"
                            >
                              CP
                            </button>
                            <input
                              defaultValue={skill.name}
                              title={skill.name}
                              onBlur={e => { if (e.target.value !== skill.name) handleRenameSkill(skill.id, e.target.value) }}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              className="flex-1 text-sm text-gray-800 min-w-0 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-orange-400 focus:outline-none px-0.5 py-0"
                              disabled={isPending}
                            />
                            <div title="カテゴリ">
                              <Select
                                value={skill.category}
                                onValueChange={v => {
                                  if (v === '__new__') { setNewCategoryForSkillId(skill.id); setShowNewCategoryInput(true); return }
                                  handleChangeSkillCategory(skill.id, v)
                                }}
                                disabled={isPending}
                              >
                                <SelectTrigger className="h-6 text-[10px] w-16 flex-shrink-0 px-1.5">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {categories.map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
                                  <SelectItem value="__new__">+ 新規</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center gap-0 flex-shrink-0" title="標準習得時間">
                              <Input
                                type="number"
                                min={0}
                                placeholder="-"
                                value={skill.standard_hours ?? ''}
                                onChange={e => handleChangeStandardHours(skill.id, e.target.value)}
                                className="h-6 text-[10px] w-10 text-right px-1"
                                disabled={isPending}
                              />
                              <span className="text-[9px] text-gray-400">h</span>
                            </div>
                            {isChecked && selectedPhases.length > 0 && (
                              <div title="フェーズ">
                                <Select
                                  value={currentPhaseId ?? 'none'}
                                  onValueChange={v => handleChangeSkillPhase(skill.id, v === 'none' ? null : v)}
                                  disabled={isPending}
                                >
                                  <SelectTrigger className="h-6 text-[10px] w-20 flex-shrink-0 px-1.5">
                                    <SelectValue placeholder="未設定" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">未設定</SelectItem>
                                    {selectedPhases.map(phase => (
                                      <SelectItem key={phase.id} value={phase.id}>{phase.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <div title={skill.target_date_hint ? `予定日: ${skill.target_date_hint}` : '予定日'} className="flex-shrink-0 relative">
                              <Input
                                type="date"
                                defaultValue={skill.target_date_hint ?? ''}
                                onBlur={e => {
                                  if (e.target.value !== (skill.target_date_hint ?? '')) handleChangeTargetDate(skill.id, e.target.value)
                                }}
                                className="h-6 text-[10px] w-20 flex-shrink-0 px-1 opacity-0 absolute inset-0 cursor-pointer"
                                disabled={isPending}
                              />
                              <span className={cn('text-[10px] h-6 w-20 flex items-center justify-center border rounded-md cursor-pointer', skill.target_date_hint ? 'text-gray-700 bg-white border-gray-200' : 'text-gray-400 bg-gray-50 border-gray-200')}>
                                {skill.target_date_hint ? `${parseInt(skill.target_date_hint.slice(5, 7))}/${parseInt(skill.target_date_hint.slice(8, 10))}` : '予定日'}
                              </span>
                            </div>
                            <Button
                              variant="ghost" size="sm"
                              className="h-7 w-7 p-0 text-gray-300 hover:text-red-500 flex-shrink-0"
                              disabled={isPending}
                              onClick={() => {
                                if (!confirm(`「${skill.name}」を削除しますか？\n\nこのスキルに関連する認定データも削除されます。`)) return
                                startTransition(async () => {
                                  const result = await deleteSkill(skill.id)
                                  if (result.error) { toast.error(result.error); return }
                                  setSkillsState(prev => prev.filter(s => s.id !== skill.id))
                                  toast.success('スキルを削除しました')
                                })
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* スキル新規作成ボタン */}
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => { setNewSkillName(''); setNewSkillCategory(categories[0] ?? '接客'); setShowNewSkillDialog(true) }}
              >
                <Plus className="w-4 h-4 mr-1" />
                スキルを新規作成
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                選択中: {selectedProjectSkillIds.size} / {allSkills.length} スキル
              </p>
            </TabsContent>

            {/* ===== チームタブ ===== */}
            <TabsContent value="members" className="space-y-2 mt-3">
              <p className="text-xs text-muted-foreground px-1">
                紐づけチーム数: {linkedTeamIds.size}
              </p>

              {/* チーム（project） */}
              {(() => {
                const projectTeamsList = teams.filter(t => t.type === 'project')
                if (projectTeamsList.length === 0) return null
                return (
                  <div>
                    <p className="text-xs font-medium text-purple-600 mb-1 flex items-center gap-1"><FolderKanban className="w-3 h-3" />チーム</p>
                    {projectTeamsList.map(team => {
                      const isLinked = linkedTeamIds.has(team.id)
                      return (
                        <div key={team.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 border mb-1', isLinked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100')}>
                          <p className="text-sm font-medium text-gray-800 flex-1 truncate">{team.name}</p>
                          <Button size="sm" variant={isLinked ? 'outline' : 'default'} className={cn('h-7 text-xs px-2', isLinked ? 'border-red-200 text-red-600 hover:bg-red-50' : 'bg-blue-500 hover:bg-blue-600 text-white')} onClick={() => handleToggleTeam(team.id, isLinked)} disabled={isPending}>
                            {isLinked ? <><UserMinus className="w-3 h-3 mr-1" />外す</> : <><UserPlus className="w-3 h-3 mr-1" />追加</>}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* 部署（department） */}
              {(() => {
                const deptTeams = teams.filter(t => t.type === 'department')
                if (deptTeams.length === 0) return null
                return (
                  <div>
                    <p className="text-xs font-medium text-teal-600 mb-1 flex items-center gap-1"><Building2 className="w-3 h-3" />部署</p>
                    {deptTeams.map(team => {
                      const isLinked = linkedTeamIds.has(team.id)
                      return (
                        <div key={team.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 border mb-1', isLinked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100')}>
                          <p className="text-sm font-medium text-gray-800 flex-1 truncate">{team.name}</p>
                          <Button size="sm" variant={isLinked ? 'outline' : 'default'} className={cn('h-7 text-xs px-2', isLinked ? 'border-red-200 text-red-600 hover:bg-red-50' : 'bg-blue-500 hover:bg-blue-600 text-white')} onClick={() => handleToggleTeam(team.id, isLinked)} disabled={isPending}>
                            {isLinked ? <><UserMinus className="w-3 h-3 mr-1" />外す</> : <><UserPlus className="w-3 h-3 mr-1" />追加</>}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* 店舗（store）都道府県別折りたたみ */}
              {(() => {
                const storeTeams = teams.filter(t => t.type === 'store')
                if (storeTeams.length === 0) return null
                const PREF_ORDER = ['秋田県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','静岡県','茨城県']
                const grouped: Record<string, typeof storeTeams> = {}
                const noPref: typeof storeTeams = []
                for (const t of storeTeams) {
                  if (t.prefecture) { if (!grouped[t.prefecture]) grouped[t.prefecture] = []; grouped[t.prefecture].push(t) }
                  else noPref.push(t)
                }
                const prefOrder = PREF_ORDER.filter(p => grouped[p])
                for (const p of Object.keys(grouped)) { if (!prefOrder.includes(p)) prefOrder.push(p) }

                return (
                  <div>
                    <button onClick={() => setShowStoreTeams(prev => !prev)} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 mb-1">
                      {showStoreTeams ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <Store className="w-3.5 h-3.5" />店舗 ({storeTeams.length})
                    </button>
                    {showStoreTeams && (
                      <div className="ml-1 space-y-0.5">
                        {prefOrder.map(pref => {
                          const stores = grouped[pref]
                          const isExp = expandedStorePrefs.has(pref)
                          return (
                            <div key={pref}>
                              <button onClick={() => setExpandedStorePrefs(prev => { const n = new Set(prev); n.has(pref) ? n.delete(pref) : n.add(pref); return n })} className="flex items-center gap-1.5 px-1 py-1 text-xs text-gray-600 hover:text-gray-800 w-full">
                                {isExp ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                <MapPin className="w-3 h-3 text-gray-400" />
                                <span className="font-medium">{pref}</span>
                                <span className="text-gray-400 ml-auto">{stores.length}</span>
                              </button>
                              {isExp && stores.map(team => {
                                const isLinked = linkedTeamIds.has(team.id)
                                return (
                                  <div key={team.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 border mb-1 ml-5', isLinked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100')}>
                                    <p className="text-sm font-medium text-gray-800 flex-1 truncate">{team.name}</p>
                                    <Button size="sm" variant={isLinked ? 'outline' : 'default'} className={cn('h-7 text-xs px-2', isLinked ? 'border-red-200 text-red-600 hover:bg-red-50' : 'bg-blue-500 hover:bg-blue-600 text-white')} onClick={() => handleToggleTeam(team.id, isLinked)} disabled={isPending}>
                                      {isLinked ? <><UserMinus className="w-3 h-3 mr-1" />外す</> : <><UserPlus className="w-3 h-3 mr-1" />追加</>}
                                    </Button>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                        {noPref.map(team => {
                          const isLinked = linkedTeamIds.has(team.id)
                          return (
                            <div key={team.id} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 border mb-1', isLinked ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100')}>
                              <p className="text-sm font-medium text-gray-800 flex-1 truncate">{team.name}</p>
                              <Button size="sm" variant={isLinked ? 'outline' : 'default'} className={cn('h-7 text-xs px-2', isLinked ? 'border-red-200 text-red-600 hover:bg-red-50' : 'bg-blue-500 hover:bg-blue-600 text-white')} onClick={() => handleToggleTeam(team.id, isLinked)} disabled={isPending}>
                                {isLinked ? <><UserMinus className="w-3 h-3 mr-1" />外す</> : <><UserPlus className="w-3 h-3 mr-1" />追加</>}
                              </Button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}
            </TabsContent>
          </Tabs>
        </>
      )}

      {projects.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">プロジェクトがありません</p>
            <Button className="mt-3" onClick={openCreateProject}>
              <Plus className="w-4 h-4 mr-1" />
              最初のプロジェクトを作成
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== プロジェクト作成・編集ダイアログ ===== */}
      <Dialog open={projectDialog.open} onOpenChange={open => { if (!open) setProjectDialog({ open: false, editing: null }) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{projectDialog.editing ? 'プロジェクトを編集' : '新規プロジェクト'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">プロジェクト名 *</p>
              <Input
                placeholder="例: 社員オンボーディング"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">説明（任意）</p>
              <Textarea
                placeholder="プロジェクトの説明"
                value={projectDesc}
                onChange={e => setProjectDesc(e.target.value)}
                className="min-h-[72px] resize-none text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialog({ open: false, editing: null })}>キャンセル</Button>
            <Button onClick={handleSaveProject} disabled={isPending}>
              {projectDialog.editing ? '更新' : '作成'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== フェーズ追加ダイアログ ===== */}
      <Dialog open={phaseDialog} onOpenChange={open => { if (!open) { setPhaseDialog(false); setPhaseName(''); setPhaseHours('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>フェーズを追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">フェーズ名 *</p>
              <Input
                placeholder="例: ステージ1"
                value={phaseName}
                onChange={e => setPhaseName(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">目標累計時間（h）*</p>
              <Input
                type="number"
                placeholder="例: 80"
                value={phaseHours}
                onChange={e => setPhaseHours(e.target.value)}
                min="1"
              />
              {phaseHours && !isNaN(parseInt(phaseHours)) && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  ≈ {Math.floor(parseInt(phaseHours) / 8)}日（8h換算）
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPhaseDialog(false); setPhaseName(''); setPhaseHours('') }}>キャンセル</Button>
            <Button onClick={handleAddPhase} disabled={isPending}>追加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== フェーズ編集ダイアログ ===== */}
      <Dialog open={editPhaseDialog !== null} onOpenChange={open => { if (!open) setEditPhaseDialog(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>フェーズを編集</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">フェーズ名 *</p>
              <Input
                value={editPhaseName}
                onChange={e => setEditPhaseName(e.target.value)}
              />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">目標累計時間（h）*</p>
              <Input
                type="number"
                value={editPhaseHours}
                onChange={e => setEditPhaseHours(e.target.value)}
                min="1"
              />
              {editPhaseHours && !isNaN(parseInt(editPhaseHours)) && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  ≈ {Math.floor(parseInt(editPhaseHours) / 8)}日（8h換算）
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPhaseDialog(null)}>キャンセル</Button>
            <Button onClick={handleSavePhase} disabled={isPending}>更新</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* 新カテゴリ追加ダイアログ */}
      <Dialog open={showNewCategoryInput} onOpenChange={setShowNewCategoryInput}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">新しいカテゴリを追加</DialogTitle></DialogHeader>
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">カテゴリ名</p>
            <Input
              placeholder="例: トラブル対応"
              value={newCategoryInput}
              onChange={e => setNewCategoryInput(e.target.value)}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              追加後、各スキルのカテゴリを新しいカテゴリに変更できます。
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNewCategoryInput(false); setNewCategoryInput('') }}>キャンセル</Button>
            <Button
              disabled={!newCategoryInput.trim() || categories.includes(newCategoryInput.trim())}
              onClick={() => {
                const name = newCategoryInput.trim()
                if (newCategoryForSkillId) {
                  // 選択中のスキルのカテゴリを同時に変更
                  handleChangeSkillCategory(newCategoryForSkillId, name)
                }
                setShowNewCategoryInput(false)
                setNewCategoryInput('')
                setNewCategoryForSkillId(null)
                toast.success(`カテゴリ「${name}」を作成しました`)
              }}
            >
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* スキル新規作成ダイアログ */}
      <Dialog open={showNewSkillDialog} onOpenChange={setShowNewSkillDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>スキルを新規作成</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">スキル名</p>
              <Input placeholder="例: お客様対応（応用）" value={newSkillName} onChange={e => setNewSkillName(e.target.value)} className="text-sm" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">カテゴリ</p>
              <Select value={newSkillCategory} onValueChange={setNewSkillCategory}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSkillDialog(false)}>キャンセル</Button>
            <Button
              disabled={isPending || !newSkillName.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => {
                startTransition(async () => {
                  const result = await createSkill({ name: newSkillName.trim(), category: newSkillCategory })
                  if (result.error) { toast.error(result.error); return }
                  if (result.data) {
                    setSkillsState(prev => [...prev, {
                      id: result.data!.id,
                      name: newSkillName.trim(),
                      category: newSkillCategory,
                      phase: null,
                      order_index: 9999,
                      target_date_hint: null,
                      standard_hours: null,
                      is_checkpoint: false,
                      created_at: new Date().toISOString(),
                    }])
                  }
                  setShowNewSkillDialog(false)
                  toast.success('スキルを作成しました')
                })
              }}
            >作成</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
