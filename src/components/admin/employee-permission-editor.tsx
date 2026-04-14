'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Shield, Briefcase } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { updateEmployeePermission } from '@/app/(dashboard)/admin/business-roles/actions'
import { SYSTEM_PERMISSION_LABELS, type BusinessRole, type SystemPermission, type EmploymentType } from '@/types/database'

interface Props {
  employeeId: string
  employeeName: string
  currentPermission: SystemPermission
  currentBusinessRoleIds: string[]
  currentEmploymentType: EmploymentType
  businessRoles: BusinessRole[]
  canEdit: boolean
}

const PERMISSION_OPTIONS: SystemPermission[] = ['developer', 'ops_admin', 'training_leader', 'training_member']

export function EmployeePermissionEditor({
  employeeId,
  employeeName,
  currentPermission,
  currentBusinessRoleIds,
  currentEmploymentType,
  businessRoles,
  canEdit,
}: Props) {
  const [permission, setPermission] = useState<SystemPermission>(currentPermission)
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set(currentBusinessRoleIds))
  const [employmentType, setEmploymentType] = useState<EmploymentType>(currentEmploymentType)
  const [isPending, startTransition] = useTransition()

  const isDirty =
    permission !== currentPermission ||
    employmentType !== currentEmploymentType ||
    roleIds.size !== currentBusinessRoleIds.length ||
    [...roleIds].some(id => !currentBusinessRoleIds.includes(id))

  const toggleRole = (id: string) => {
    setRoleIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = () => {
    startTransition(async () => {
      const res = await updateEmployeePermission({
        employeeId,
        system_permission: permission,
        business_role_ids: [...roleIds],
        employment_type: employmentType,
      })
      if (res.error) { toast.error(res.error); return }
      toast.success(`${employeeName} の権限を更新しました`)
    })
  }

  const handleReset = () => {
    setPermission(currentPermission)
    setRoleIds(new Set(currentBusinessRoleIds))
    setEmploymentType(currentEmploymentType)
  }

  if (!canEdit) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
            <Shield className="w-4 h-4" />
            権限
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <div className="text-xs text-gray-500">システム権限</div>
          <Badge variant="secondary">{SYSTEM_PERMISSION_LABELS[currentPermission]}</Badge>
          <div className="text-xs text-gray-500 mt-2">業務役職</div>
          <div className="flex flex-wrap gap-1">
            {currentBusinessRoleIds.length === 0 ? (
              <span className="text-xs text-gray-400">なし</span>
            ) : (
              businessRoles
                .filter(r => currentBusinessRoleIds.includes(r.id))
                .map(r => <Badge key={r.id} variant="outline" className="text-[11px]">{r.name}</Badge>)
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Shield className="w-4 h-4" />
          権限・業務役職
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-600">雇用形態</label>
          <Select value={employmentType} onValueChange={v => setEmploymentType(v as EmploymentType)} disabled={isPending}>
            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="社員">社員</SelectItem>
              <SelectItem value="メイト">メイト</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">システム権限</label>
          <Select value={permission} onValueChange={v => setPermission(v as SystemPermission)} disabled={isPending}>
            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERMISSION_OPTIONS.map(p => (
                <SelectItem key={p} value={p}>{SYSTEM_PERMISSION_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-gray-500 mt-1">
            {permission === 'developer' && 'アプリ全体の管理権限（開発用）'}
            {permission === 'ops_admin' && '社員データ・マスタ管理の権限'}
            {permission === 'training_leader' && 'スキル承認・育成対象者の管理'}
            {permission === 'training_member' && '自分のスキル申請のみ'}
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <Briefcase className="w-3 h-3" />
            業務役職（複数選択可）
          </label>
          <div className="mt-2 space-y-1.5">
            {businessRoles.length === 0 ? (
              <p className="text-xs text-gray-400">業務役職マスタが空です</p>
            ) : (
              businessRoles.map(r => (
                <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={roleIds.has(r.id)}
                    onCheckedChange={() => toggleRole(r.id)}
                    disabled={isPending}
                  />
                  <span>{r.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {isDirty && (
          <div className="flex gap-2 pt-2 border-t">
            <Button size="sm" onClick={handleSave} disabled={isPending} className="bg-orange-500 hover:bg-orange-600 flex-1">
              {isPending ? '保存中...' : '保存'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleReset} disabled={isPending}>
              リセット
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
