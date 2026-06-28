'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setCurriculumParticipation } from '@/app/(dashboard)/curriculum-participation-actions'

/**
 * 担当リーダー向け: このカリキュラムで「育成対象として参加する／しない」を切り替えるトグル。
 * する（既定）= 各種ランキングに表示。しない = ランキングから除外（スキル申請・閲覧は引き続き可能）。
 */
export function CurriculumParticipationToggle({
  employeeId, projectId, projectName, initialParticipate, selfView,
}: {
  employeeId: string
  projectId: string
  projectName: string
  initialParticipate: boolean
  selfView: boolean
}) {
  const [participate, setParticipate] = useState(initialParticipate)
  const [pending, startTransition] = useTransition()

  const apply = (next: boolean) => {
    if (next === participate || pending) return
    setParticipate(next) // 楽観的更新
    startTransition(async () => {
      const res = await setCurriculumParticipation(employeeId, projectId, next)
      if (res.error) {
        setParticipate(!next)
        toast.error(res.error)
        return
      }
      toast.success(next ? 'このカリキュラムのランキングに参加します' : 'このカリキュラムのランキングから外しました')
    })
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
            <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0" />
            育成対象として参加（ランキングに表示）
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">
            「{projectName}」{selfView ? 'であなたを' : 'でこのメンバーを'}各種ランキングに{participate ? '表示します' : '表示しません'}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 flex-shrink-0">
          {([['する', true], ['しない', false]] as const).map(([label, val]) => (
            <button
              key={label}
              type="button"
              disabled={pending}
              onClick={() => apply(val)}
              className={cn(
                'px-3 py-1 text-xs font-semibold rounded-md transition-colors',
                participate === val
                  ? (val ? 'bg-white text-orange-600 shadow-sm' : 'bg-white text-gray-600 shadow-sm')
                  : 'text-gray-400 hover:text-gray-600',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
