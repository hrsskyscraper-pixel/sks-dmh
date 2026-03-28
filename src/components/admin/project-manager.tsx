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
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, GripVertical, UserMinus, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateSkillCategory } from '@/app/(dashboard)/actions'
import { sortCategories } from '@/lib/category-order'
import { cn } from '@/lib/utils'
import type { SkillProject, ProjectPhase, ProjectSkill, EmployeeProject, Skill, Employee } from '@/types/database'

interface Props {
  projects: SkillProject[]
  phases: ProjectPhase[]
  projectSkills: ProjectSkill[]
  employeeProjects: EmployeeProject[]
  allSkills: Skill[]
  employees: Pick<Employee, 'id' | 'name' | 'employment_type' | 'hire_date'>[]
}

// カテゴリはスキルデータから動的に取得（コンポーネント内で計算）

export function ProjectManager({
  projects: initialProjects,
  phases: initialPhases,
  projectSkills: initialProjectSkills,
  employeeProjects: initialEmployeeProjects,
  allSkills,
  employees,
}: Props) {
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()
  const [skillsState, setSkillsState] = useState(allSkills)
  const categories = sortCategories([...new Set(skillsState.map(s => s.category))])
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false)

  // ---- state ----
  const [projects, setProjects] = useState(initialProjects)
  const [phases, setPhases] = useState(initialPhases)
  const [projectSkills, setProjectSkills] = useState(initialProjectSkills)
  const [employeeProjects, setEmployeeProjects] = useState(initialEmployeeProjects)

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
  const memberIds = new Set(
    employeeProjects.filter(ep => ep.project_id === selectedProjectId).map(ep => ep.employee_id)
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

  // ===== メンバー操作 =====

  function handleToggleMember(employeeId: string, isMember: boolean) {
    if (!selectedProjectId) return
    startTransition(async () => {
      if (isMember) {
        // 削除
        const { error } = await supabase
          .from('employee_projects')
          .delete()
          .eq('project_id', selectedProjectId)
          .eq('employee_id', employeeId)
        if (error) { toast.error('メンバーの削除に失敗しました'); return }
        setEmployeeProjects(prev => prev.filter(ep => !(ep.project_id === selectedProjectId && ep.employee_id === employeeId)))
        toast.success('メンバーを削除しました')
      } else {
        // 追加
        const { data, error } = await supabase
          .from('employee_projects')
          .insert({ project_id: selectedProjectId, employee_id: employeeId })
          .select()
          .single()
        if (error) { toast.error('メンバーの追加に失敗しました'); return }
        setEmployeeProjects(prev => [...prev, data])
        toast.success('メンバーを追加しました')
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
              <TabsTrigger value="members">メンバー</TabsTrigger>
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
              {categories.map(category => {
                const catSkills = skillsState.filter(s => s.category === category)
                if (catSkills.length === 0) return null
                return (
                  <div key={category}>
                    <h3 className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">{category}</h3>
                    <div className="space-y-1.5">
                      {catSkills.map(skill => {
                        const isChecked = selectedProjectSkillIds.has(skill.id)
                        const currentPhaseId = skillPhaseMap[skill.id] ?? null
                        return (
                          <div
                            key={skill.id}
                            className={cn(
                              'flex items-center gap-2 rounded-lg px-3 py-2 border',
                              isChecked ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 border-gray-100'
                            )}
                          >
                            <Checkbox
                              id={`skill-${skill.id}`}
                              checked={isChecked}
                              onCheckedChange={checked => handleToggleSkill(skill.id, !!checked)}
                              disabled={isPending}
                            />
                            <label htmlFor={`skill-${skill.id}`} className="flex-1 text-sm text-gray-800 cursor-pointer min-w-0 truncate">
                              {skill.name}
                            </label>
                            <Select
                              value={skill.category}
                              onValueChange={v => {
                                if (v === '__new__') { setShowNewCategoryInput(true); return }
                                handleChangeSkillCategory(skill.id, v)
                              }}
                              disabled={isPending}
                            >
                              <SelectTrigger className="h-7 text-xs w-24 flex-shrink-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {categories.map(c => (
                                  <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                                <SelectItem value="__new__">+ 新規追加</SelectItem>
                              </SelectContent>
                            </Select>
                            {isChecked && selectedPhases.length > 0 && (
                              <Select
                                value={currentPhaseId ?? 'none'}
                                onValueChange={v => handleChangeSkillPhase(skill.id, v === 'none' ? null : v)}
                                disabled={isPending}
                              >
                                <SelectTrigger className="h-7 text-xs w-32 flex-shrink-0">
                                  <SelectValue placeholder="フェーズ未設定" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">未設定</SelectItem>
                                  {selectedPhases.map(phase => (
                                    <SelectItem key={phase.id} value={phase.id}>{phase.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              <p className="text-xs text-muted-foreground text-center">
                選択中: {selectedProjectSkillIds.size} / {allSkills.length} スキル
              </p>
            </TabsContent>

            {/* ===== メンバータブ ===== */}
            <TabsContent value="members" className="space-y-2 mt-3">
              <p className="text-xs text-muted-foreground px-1">
                メンバー数: {memberIds.size}名
              </p>
              {employees.map(emp => {
                const isMember = memberIds.has(emp.id)
                return (
                  <div
                    key={emp.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 border',
                      isMember ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-100'
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                      <p className="text-[10px] text-muted-foreground">{emp.employment_type}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={isMember ? 'outline' : 'default'}
                      className={cn('h-7 text-xs px-2', isMember ? 'border-red-200 text-red-600 hover:bg-red-50' : 'bg-blue-500 hover:bg-blue-600 text-white')}
                      onClick={() => handleToggleMember(emp.id, isMember)}
                      disabled={isPending}
                    >
                      {isMember
                        ? <><UserMinus className="w-3 h-3 mr-1" />外す</>
                        : <><UserPlus className="w-3 h-3 mr-1" />追加</>
                      }
                    </Button>
                  </div>
                )
              })}
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
                // ダミーのスキルを追加してカテゴリを表示可能にする（実際にはスキルのカテゴリを変更する）
                setSkillsState(prev => [...prev, { ...prev[0], id: `__placeholder_${name}`, name: `（${name}にスキルを移動してください）`, category: name }])
                setShowNewCategoryInput(false)
                setNewCategoryInput('')
                toast.success(`カテゴリ「${name}」を追加しました。スキルのカテゴリを変更してください。`)
              }}
            >
              追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
