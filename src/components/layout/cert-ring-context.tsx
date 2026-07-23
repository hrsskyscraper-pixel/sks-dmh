'use client'

import { createContext, useContext } from 'react'
import type { CertRanks } from '@/lib/cert-ranks'

/**
 * 社員ごとの社内資格ランク（employee_id → CertRanks）をアプリ全体に配信する。
 * レイアウトで一度だけ読み込み、どのアバターも employeeId で参照できるようにする。
 */
const CertRingContext = createContext<Record<string, CertRanks>>({})

export function CertRingProvider({
  ranks,
  children,
}: {
  ranks: Record<string, CertRanks>
  children: React.ReactNode
}) {
  return <CertRingContext.Provider value={ranks}>{children}</CertRingContext.Provider>
}

export function useCertRanks(employeeId?: string | null): CertRanks | undefined {
  const map = useContext(CertRingContext)
  return employeeId ? map[employeeId] : undefined
}
