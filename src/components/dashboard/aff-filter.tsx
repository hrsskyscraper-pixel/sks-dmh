'use client'

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { RankRowMeta, AffType } from '@/lib/ranking-data'

const TYPE_LABEL: Record<AffType, string> = { store: '店舗', department: '部署', project: 'チーム' }
const TYPE_ORDER: AffType[] = ['store', 'department', 'project']

/**
 * 個人別ビュー用の所属（店舗・部署・PJチーム）フィルタ。
 * options には dataset.affiliationMeta（id=teamId, name=チーム名, affType=種別）を渡す。
 */
export function AffFilter({ options, value, onChange }: { options: RankRowMeta[]; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="h-8 text-xs max-w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">所属：すべて</SelectItem>
        {TYPE_ORDER.map(t => {
          const items = options
            .filter(o => o.affType === t)
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
          if (items.length === 0) return null
          return (
            <SelectGroup key={t}>
              <SelectLabel>{TYPE_LABEL[t]}</SelectLabel>
              {items.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
            </SelectGroup>
          )
        })}
      </SelectContent>
    </Select>
  )
}
