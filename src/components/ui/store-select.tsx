'use client'

import { useState } from 'react'
import { Building2, ChevronDown, ChevronRight, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StoreTeam {
  id: string
  name: string
  type?: 'store' | 'department' | 'project'
  prefecture: string | null
}

interface Props {
  teams: StoreTeam[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const REGION_ORDER = [
  '秋田県', '栃木県', '群馬県', '埼玉県', '千葉県',
  '東京都', '神奈川県', '新潟県', '静岡県', '茨城県',
]

export function StoreSelect({ teams, value, onChange, placeholder = '店舗／部署を選択' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedPref, setExpandedPref] = useState<string | null>(null)

  // 部署と店舗を分離
  const departments = teams.filter(t => t.type === 'department')
  const stores = teams.filter(t => t.type !== 'department')

  // 店舗を都道府県ごとにグループ化
  const grouped: Record<string, StoreTeam[]> = {}
  const noPref: StoreTeam[] = []
  for (const t of stores) {
    if (t.prefecture) {
      if (!grouped[t.prefecture]) grouped[t.prefecture] = []
      grouped[t.prefecture].push(t)
    } else {
      noPref.push(t)
    }
  }

  const prefOrder = REGION_ORDER.filter(p => grouped[p])
  for (const p of Object.keys(grouped)) {
    if (!prefOrder.includes(p)) prefOrder.push(p)
  }

  const selectedTeam = teams.find(t => t.id === value)

  const handleSelect = (teamId: string) => {
    onChange(teamId)
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center justify-between w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'hover:bg-accent hover:text-accent-foreground',
          !selectedTeam && 'text-muted-foreground'
        )}
      >
        <span className="truncate">
          {selectedTeam ? (
            <>
              {selectedTeam.type === 'department' && <span className="text-teal-500 mr-1">[部署]</span>}
              {selectedTeam.prefecture && <span className="text-gray-400 mr-1">{selectedTeam.prefecture}</span>}
              {selectedTeam.name}
            </>
          ) : placeholder}
        </span>
        <ChevronDown className={cn('w-4 h-4 ml-2 flex-shrink-0 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect('__none__')}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
            >
              （未設定）
            </button>

            {/* 部署 */}
            {departments.length > 0 && (
              <>
                <div className="px-3 py-1.5 text-xs text-teal-600 font-semibold flex items-center gap-1.5 bg-teal-50">
                  <Building2 className="w-3 h-3" />
                  部署
                </div>
                {departments.map(dept => (
                  <button
                    key={dept.id}
                    type="button"
                    onClick={() => handleSelect(dept.id)}
                    className={cn(
                      'w-full text-left pl-6 pr-3 py-1.5 text-sm hover:bg-gray-50',
                      dept.id === value ? 'text-orange-600 font-medium bg-orange-50' : 'text-gray-600'
                    )}
                  >
                    {dept.name}
                  </button>
                ))}
              </>
            )}

            {/* 店舗（都道府県グループ） */}
            {prefOrder.map(pref => {
              const prefStores = grouped[pref]
              const isExpanded = expandedPref === pref
              const hasSelected = prefStores.some(s => s.id === value)

              return (
                <div key={pref}>
                  <button
                    type="button"
                    onClick={() => setExpandedPref(isExpanded ? null : pref)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-gray-50',
                      hasSelected ? 'text-orange-600 bg-orange-50' : 'text-gray-700'
                    )}
                  >
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                    }
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                    <span>{pref}</span>
                    <span className="text-xs text-gray-400 ml-auto">{prefStores.length}店舗</span>
                  </button>
                  {isExpanded && prefStores.map(store => (
                    <button
                      key={store.id}
                      type="button"
                      onClick={() => handleSelect(store.id)}
                      className={cn(
                        'w-full text-left pl-10 pr-3 py-1.5 text-sm hover:bg-gray-50',
                        store.id === value ? 'text-orange-600 font-medium bg-orange-50' : 'text-gray-600'
                      )}
                    >
                      {store.name}
                    </button>
                  ))}
                </div>
              )
            })}

            {noPref.length > 0 && (
              <div>
                <div className="px-3 py-2 text-xs text-gray-400 font-medium">その他</div>
                {noPref.map(store => (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => handleSelect(store.id)}
                    className={cn(
                      'w-full text-left pl-6 pr-3 py-1.5 text-sm hover:bg-gray-50',
                      store.id === value ? 'text-orange-600 font-medium bg-orange-50' : 'text-gray-600'
                    )}
                  >
                    {store.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
