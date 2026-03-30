'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StoreTeam {
  id: string
  name: string
  prefecture: string | null
}

interface Props {
  teams: StoreTeam[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

// 地方→都道府県の表示順序
const REGION_ORDER = [
  '秋田県',
  '栃木県',
  '群馬県',
  '埼玉県',
  '千葉県',
  '東京都',
  '神奈川県',
  '新潟県',
  '静岡県',
  '茨城県',
]

export function StoreSelect({ teams, value, onChange, placeholder = '店舗を選択' }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedPref, setExpandedPref] = useState<string | null>(null)

  // 都道府県ごとにグループ化
  const grouped: Record<string, StoreTeam[]> = {}
  const noPref: StoreTeam[] = []
  for (const t of teams) {
    if (t.prefecture) {
      if (!grouped[t.prefecture]) grouped[t.prefecture] = []
      grouped[t.prefecture].push(t)
    } else {
      noPref.push(t)
    }
  }

  // 都道府県の並び順
  const prefOrder = REGION_ORDER.filter(p => grouped[p])
  // REGION_ORDER に含まれない都道府県を末尾に
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
      {/* トリガー */}
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
              {selectedTeam.prefecture && <span className="text-gray-400 mr-1">{selectedTeam.prefecture}</span>}
              {selectedTeam.name}
            </>
          ) : placeholder}
        </span>
        <ChevronDown className={cn('w-4 h-4 ml-2 flex-shrink-0 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* ドロップダウン */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
            {/* 未設定オプション */}
            <button
              type="button"
              onClick={() => handleSelect('__none__')}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
            >
              （未設定）
            </button>

            {/* 都道府県グループ */}
            {prefOrder.map(pref => {
              const stores = grouped[pref]
              const isExpanded = expandedPref === pref
              const hasSelected = stores.some(s => s.id === value)

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
                    <span className="text-xs text-gray-400 ml-auto">{stores.length}店舗</span>
                  </button>
                  {isExpanded && stores.map(store => (
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

            {/* 都道府県未設定の店舗 */}
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
