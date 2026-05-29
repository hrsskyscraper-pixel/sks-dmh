'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getNavCounts } from '@/app/(dashboard)/actions'
import { EMPTY_NAV_COUNTS, type NavCounts } from '@/lib/nav-counts'

const NavDataContext = createContext<NavCounts>(EMPTY_NAV_COUNTS)

/**
 * ナビのバッジ系カウントを「描画後に」取得して配信する。
 * レイアウトの SSR はこれを待たずに即返るため、ページ本体がすぐ表示される
 * （バッジは数百ms遅れて差し込まれる）。
 * ページ遷移ごと（pathname 変化）に再取得して、従来どおり最新の件数を保つ。
 */
export function NavDataProvider({ children }: { children: React.ReactNode }) {
  const [counts, setCounts] = useState<NavCounts>(EMPTY_NAV_COUNTS)
  const pathname = usePathname()

  useEffect(() => {
    let cancelled = false
    getNavCounts()
      .then(c => { if (!cancelled) setCounts(c) })
      .catch(() => { /* バッジは非必須なので失敗しても無視 */ })
    return () => { cancelled = true }
  }, [pathname])

  return <NavDataContext.Provider value={counts}>{children}</NavDataContext.Provider>
}

export function useNavData() {
  return useContext(NavDataContext)
}

/** 通知ベル用の薄いヘルパー（既存呼び出し互換） */
export function useNotificationCount() {
  return useContext(NavDataContext).notifCount
}
