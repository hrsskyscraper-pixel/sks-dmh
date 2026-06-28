'use client'

import { useState, useRef, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { RankingList } from '@/components/dashboard/ranking-list'
import type { RankEntry } from '@/lib/skill-ranking'

/** 全員ランキングを下スクロールで順次表示（無限スクロール）。 */
export function RankingPaginated({ ranking, currentEmployeeId, pageSize = 50 }: { ranking: RankEntry[]; currentEmployeeId?: string; pageSize?: number }) {
  const [count, setCount] = useState(pageSize)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (count >= ranking.length) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setCount(c => Math.min(c + pageSize, ranking.length))
    }, { rootMargin: '300px' })
    io.observe(el)
    return () => io.disconnect()
  }, [count, ranking.length, pageSize])

  return (
    <>
      <RankingList ranking={ranking.slice(0, count)} currentEmployeeId={currentEmployeeId} />
      {count < ranking.length && (
        <div ref={sentinelRef} className="py-3 flex justify-center">
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
        </div>
      )}
    </>
  )
}
