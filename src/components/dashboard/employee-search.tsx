'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type SearchEmployee = {
  id: string
  name: string
  kana: string | null
  avatarUrl: string | null
  roleIds: string[]
  storeIds: string[]
  storeNames: string[]
  projectIds: string[]
  /** 認定済みスキル（options.skillGroups の idx に対応） */
  certifiedSkillIdxs: number[]
}

export type SearchOptions = {
  storeGroups: { label: string; items: { id: string; name: string }[] }[]
  roles: { id: string; name: string }[]
  projects: { id: string; name: string }[]
  skillGroups: { phase: string; items: { idx: number; name: string }[] }[]
}

/** カタカナ→ひらがな＋NFKC＋小文字化（ひらがな入力でカナ氏名にもヒットさせる） */
function normalizeKana(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
}

const ALL = 'all'

export function EmployeeSearch({ employees, options }: { employees: SearchEmployee[]; options: SearchOptions }) {
  const [query, setQuery] = useState('')
  const [storeId, setStoreId] = useState(ALL)
  const [roleId, setRoleId] = useState(ALL)
  const [projectId, setProjectId] = useState(ALL)
  const [skillIdx, setSkillIdx] = useState(ALL)

  const roleNameById = useMemo(() => Object.fromEntries(options.roles.map(r => [r.id, r.name])), [options.roles])

  const results = useMemo(() => {
    const q = normalizeKana(query.trim())
    const skill = skillIdx === ALL ? null : Number(skillIdx)
    return employees.filter(e => {
      if (q && !normalizeKana(e.name).includes(q) && !(e.kana && normalizeKana(e.kana).includes(q))) return false
      if (storeId !== ALL && !e.storeIds.includes(storeId)) return false
      if (roleId !== ALL && !e.roleIds.includes(roleId)) return false
      if (projectId !== ALL && !e.projectIds.includes(projectId)) return false
      if (skill !== null && !e.certifiedSkillIdxs.includes(skill)) return false
      return true
    })
  }, [employees, query, storeId, roleId, projectId, skillIdx])

  const hasFilter = query.trim() !== '' || storeId !== ALL || roleId !== ALL || projectId !== ALL || skillIdx !== ALL

  return (
    <div className="p-4 max-w-lg mx-auto">
      {/* 名前検索 */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="名前・ふりがなで検索"
          className="pl-9 pr-8 bg-white"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="検索をクリア"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      {/* 絞り込み（自由に組み合わせ可・AND条件） */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Select value={storeId} onValueChange={setStoreId}>
          <SelectTrigger size="sm" className={cn('w-full text-xs bg-white', storeId !== ALL && 'border-orange-300 text-orange-700')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>店舗：すべて</SelectItem>
            {options.storeGroups.map(g => (
              <SelectGroup key={g.label}>
                <SelectLabel>{g.label}</SelectLabel>
                {g.items.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger size="sm" className={cn('w-full text-xs bg-white', roleId !== ALL && 'border-orange-300 text-orange-700')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>役職：すべて</SelectItem>
            {options.roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger size="sm" className={cn('w-full text-xs bg-white', projectId !== ALL && 'border-orange-300 text-orange-700')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>カリキュラム：すべて</SelectItem>
            {options.projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={skillIdx} onValueChange={setSkillIdx}>
          <SelectTrigger size="sm" className={cn('w-full text-xs bg-white', skillIdx !== ALL && 'border-orange-300 text-orange-700')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>習得スキル：すべて</SelectItem>
            {options.skillGroups.map(g => (
              <SelectGroup key={g.phase}>
                <SelectLabel>{g.phase}</SelectLabel>
                {g.items.map(s => <SelectItem key={s.idx} value={String(s.idx)}>{s.name}</SelectItem>)}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 件数 */}
      <p className="text-sm text-gray-600 mb-2">
        <span className="font-bold text-orange-600">{results.length}</span>人
        {hasFilter && <span className="text-xs text-gray-400 ml-1.5">（全{employees.length}人中）</span>}
      </p>

      {/* 結果一覧 */}
      {results.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center">
          <p className="text-sm text-gray-500">条件に一致する社員が見つかりませんでした</p>
          <p className="text-xs text-gray-400 mt-1">検索条件を変えてみてください</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {results.map(e => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5">
              <Avatar className="w-9 h-9 flex-shrink-0">
                <AvatarImage src={e.avatarUrl ?? undefined} />
                <AvatarFallback className="text-xs font-bold bg-gray-200 text-gray-500">{e.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{e.name}</p>
                {(e.storeNames.length > 0 || e.roleIds.length > 0) && (
                  <div className="flex items-center gap-1 flex-wrap mt-0.5">
                    {e.storeNames.map(s => (
                      <span key={s} className="text-[9px] bg-blue-100 text-blue-700 rounded px-1 py-px truncate max-w-[140px]">{s}</span>
                    ))}
                    {e.roleIds.map(id => roleNameById[id]).filter(Boolean).map(r => (
                      <span key={r} className="text-[9px] bg-purple-100 text-purple-700 rounded px-1 py-px truncate max-w-[140px]">{r}</span>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-500 flex-shrink-0">
                認定 <span className="text-sm font-black text-orange-600">{e.certifiedSkillIdxs.length}</span>件
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
