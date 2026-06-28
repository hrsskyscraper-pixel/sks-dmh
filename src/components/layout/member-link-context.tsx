'use client'

import { createContext, useContext } from 'react'

/**
 * 「メンバー名をクリックして Myキャリア（/admin/employees/[id]）を開けるか」をアプリ全体に配信する。
 * 値はログイン本人の権限（管理者 or 研修リーダー）。実際の閲覧可否はキャリアページ側でも検証される。
 */
const MemberLinkContext = createContext<boolean>(false)

export function MemberLinkProvider({ canView, children }: { canView: boolean; children: React.ReactNode }) {
  return <MemberLinkContext.Provider value={canView}>{children}</MemberLinkContext.Provider>
}

export function useCanViewMemberCareer() {
  return useContext(MemberLinkContext)
}
