'use client'

import { useState, useTransition, useMemo } from 'react'
import { toast } from 'sonner'
import { Award, Search, Undo2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { grantSkill, revokeCertification } from '@/app/(dashboard)/admin/employees/[id]/actions'

interface SkillItem { id: string; name: string; phase: string | null; category: string }
interface CertifiedItem { achievementId: string; skillId: string; skillName: string; certifiedAt: string | null; certifierName: string | null }

interface Props {
  employeeId: string
  employeeName: string
  availableSkills: SkillItem[]
  /** 既に認定済みのスキルID（UI でマーク・非選択にする） */
  certifiedSkillIds: string[]
  /** 認定済みスキル一覧（取消用） */
  certifiedAchievements?: CertifiedItem[]
  canGrant: boolean
}

export function SkillGrantSection({ employeeId, employeeName, availableSkills, certifiedSkillIds, certifiedAchievements = [], canGrant }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()

  // 取消ダイアログ
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeTargetId, setRevokeTargetId] = useState<string | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [revokeSearch, setRevokeSearch] = useState('')

  const filteredCertified = useMemo(() => {
    const q = revokeSearch.trim().toLowerCase()
    return certifiedAchievements
      .filter(c => !q || c.skillName.toLowerCase().includes(q) || (c.certifierName ?? '').toLowerCase().includes(q))
      .sort((a, b) => (b.certifiedAt ?? '').localeCompare(a.certifiedAt ?? ''))
  }, [certifiedAchievements, revokeSearch])

  const handleRevoke = () => {
    if (!revokeTargetId) return
    const target = certifiedAchievements.find(c => c.achievementId === revokeTargetId)
    if (!target) return
    if (!confirm(`「${target.skillName}」の認定を取り消します。本人に通知が届きます。よろしいですか？`)) return
    startTransition(async () => {
      const res = await revokeCertification({ employeeId, achievementId: revokeTargetId, reason: revokeReason })
      if (res.error) { toast.error(res.error); return }
      toast.success(`「${target.skillName}」の認定を取り消しました`)
      setRevokeOpen(false); setRevokeTargetId(null); setRevokeReason(''); setRevokeSearch('')
    })
  }

  const certifiedSet = useMemo(() => new Set(certifiedSkillIds), [certifiedSkillIds])

  const filteredSkills = useMemo(() => {
    const q = search.trim().toLowerCase()
    return availableSkills
      .filter(s => !certifiedSet.has(s.id))
      .filter(s => !q || s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || (s.phase ?? '').toLowerCase().includes(q))
  }, [availableSkills, certifiedSet, search])

  const handleGrant = () => {
    if (!selectedSkillId) return
    startTransition(async () => {
      const res = await grantSkill({ employeeId, skillId: selectedSkillId, comment })
      if (res.error) { toast.error(res.error); return }
      toast.success(`${employeeName} にスキル認定を付与しました`)
      setOpen(false)
      setSelectedSkillId(null)
      setComment('')
      setSearch('')
    })
  }

  if (!canGrant) return null

  return (
    <>
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Award className="w-4 h-4" />
            スキル認定
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <p className="text-xs text-gray-500">
            リーダー判断で、このメンバーのスキルを直接認定できます。本人に LINE / メール通知が届きます。
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setOpen(true)} disabled={isPending} className="bg-emerald-500 hover:bg-emerald-600">
              <Award className="w-4 h-4 mr-1" />
              スキルを付与する
            </Button>
            <Button onClick={() => setRevokeOpen(true)} disabled={isPending || certifiedAchievements.length === 0} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">
              <Undo2 className="w-4 h-4 mr-1" />
              認定を取り消す
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={v => { if (!v) { setOpen(false); setSelectedSkillId(null); setComment(''); setSearch('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">スキル認定の付与</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-600">
            <strong>{employeeName}</strong> に付与するスキルを選択してください。
          </p>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="スキル名・カテゴリで検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
              disabled={isPending}
            />
          </div>

          <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
            {filteredSkills.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">
                {availableSkills.length === 0 ? '付与できるスキルがありません（所属プロジェクトを確認してください）' : '該当するスキルがありません'}
              </p>
            ) : (
              filteredSkills.map(s => (
                <label key={s.id} className={`flex items-start gap-2 px-3 py-2 cursor-pointer ${selectedSkillId === s.id ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="grantSkill"
                    checked={selectedSkillId === s.id}
                    onChange={() => setSelectedSkillId(s.id)}
                    className="mt-0.5 accent-emerald-500"
                    disabled={isPending}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{s.name}</p>
                    <div className="flex gap-1 mt-0.5">
                      {s.phase && <Badge variant="outline" className="text-[10px]">{s.phase}</Badge>}
                      <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                    </div>
                  </div>
                </label>
              ))
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">コメント（任意）</label>
            <Textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="認定のポイントや励ましの言葉など"
              className="mt-1 text-sm"
              rows={3}
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>キャンセル</Button>
            <Button onClick={handleGrant} disabled={isPending || !selectedSkillId} className="bg-emerald-500 hover:bg-emerald-600">
              {isPending ? '付与中...' : '認定を付与'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 取消ダイアログ */}
      <Dialog open={revokeOpen} onOpenChange={v => { if (!v) { setRevokeOpen(false); setRevokeTargetId(null); setRevokeReason(''); setRevokeSearch('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">認定の取り消し</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-600">
            <strong>{employeeName}</strong> の認定済みスキルから、取り消すものを選択してください。本人に通知が届きます。
          </p>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="スキル名・認定者で検索"
              value={revokeSearch}
              onChange={e => setRevokeSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
              disabled={isPending}
            />
          </div>

          <div className="border border-gray-200 rounded-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
            {filteredCertified.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-4">
                {certifiedAchievements.length === 0 ? '認定済みスキルがありません' : '該当するスキルがありません'}
              </p>
            ) : (
              filteredCertified.map(c => (
                <label key={c.achievementId} className={`flex items-start gap-2 px-3 py-2 cursor-pointer ${revokeTargetId === c.achievementId ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="revokeSkill"
                    checked={revokeTargetId === c.achievementId}
                    onChange={() => setRevokeTargetId(c.achievementId)}
                    className="mt-0.5 accent-red-500"
                    disabled={isPending}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{c.skillName}</p>
                    <p className="text-[11px] text-gray-500">
                      {c.certifiedAt ? new Date(c.certifiedAt).toLocaleDateString('ja-JP') : ''}
                      {c.certifierName ? ` / 認定: ${c.certifierName}` : ''}
                    </p>
                  </div>
                </label>
              ))
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">理由（任意・本人にも表示されます）</label>
            <Textarea
              value={revokeReason}
              onChange={e => setRevokeReason(e.target.value)}
              placeholder="例: 認定基準の再確認のため"
              className="mt-1 text-sm"
              rows={2}
              disabled={isPending}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)} disabled={isPending}>キャンセル</Button>
            <Button onClick={handleRevoke} disabled={isPending || !revokeTargetId} className="bg-red-500 hover:bg-red-600">
              {isPending ? '取消中...' : '取り消す'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
