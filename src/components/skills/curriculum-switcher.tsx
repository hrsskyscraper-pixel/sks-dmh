'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setSelectedProject } from '@/app/(dashboard)/actions'

interface Props {
  projects: { id: string; name: string; skillCount?: number }[]
  currentProjectId: string | null
  /** 切替後に遷移するパス（?project_id= が付与される）。既定 /skills */
  basePath?: string
  /** 親が既に横余白を持つ場合は false にして px-4 を外す（既定 true） */
  padded?: boolean
}

/** 「○○カリキュラム　122スキル」のように全スキル数を添える */
function label(p: { name: string; skillCount?: number }): string {
  return p.skillCount && p.skillCount > 0 ? `${p.name}　${p.skillCount}スキル` : p.name
}

/** スキルページ上部の「習得カリキュラム」表示＋切替（複数所属時はチップで切替） */
export function CurriculumSwitcher({ projects, currentProjectId, basePath = '/skills', padded = true }: Props) {
  const router = useRouter()
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const pad = padded ? 'px-4 pt-3 -mb-1' : ''

  if (projects.length === 0) return null
  const current = projects.find(p => p.id === currentProjectId) ?? projects[0]

  if (projects.length === 1) {
    return (
      <div className={cn(pad, 'flex items-center gap-1.5 text-xs text-gray-500')}>
        <BookOpen className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
        <span>習得カリキュラム</span>
        <span className="font-semibold text-gray-700 truncate">{label(current)}</span>
      </div>
    )
  }

  return (
    <div className={pad}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1.5">
        <BookOpen className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
        <span>習得カリキュラムを選択</span>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {projects.map(pj => {
          const isSelected = pj.id === current.id
          const isSwitching = pending && switchingId === pj.id
          return (
            <button
              key={pj.id}
              disabled={pending}
              onClick={() => {
                if (isSelected || pending) return
                setSwitchingId(pj.id)
                startTransition(async () => {
                  await setSelectedProject(pj.id)
                  router.replace(`${basePath}?project_id=${pj.id}`)
                })
              }}
              className={cn(
                'text-[11px] rounded-full px-3 py-1 transition-all flex items-center gap-1 border',
                isSelected
                  ? 'bg-orange-500 text-white border-orange-500 font-bold'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-orange-50',
                pending && !isSwitching && 'opacity-50',
              )}
            >
              {isSwitching && <Loader2 className="w-3 h-3 animate-spin" />}
              {label(pj)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
