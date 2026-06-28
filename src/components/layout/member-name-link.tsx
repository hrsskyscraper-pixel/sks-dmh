'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useCanViewMemberCareer } from '@/components/layout/member-link-context'

/**
 * メンバー名のクリック導線。閲覧権限がある人（管理者・研修リーダー）には Myキャリアへの
 * リンクとして、それ以外にはただのテキストとして描画する。アプリ全体のメンバー名で共通利用する。
 * 親が <a>（カードリンク等）のときは asChildOfLink で span 化して入れ子の <a> を避ける。
 */
export function MemberNameLink({
  employeeId,
  children,
  className,
  stopPropagation = true,
}: {
  employeeId?: string | null
  children: React.ReactNode
  className?: string
  stopPropagation?: boolean
}) {
  const canView = useCanViewMemberCareer()

  if (!canView || !employeeId) {
    return className ? <span className={className}>{children}</span> : <>{children}</>
  }

  return (
    <Link
      href={`/admin/employees/${employeeId}`}
      prefetch={false}
      onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
      className={cn('hover:underline', className)}
    >
      {children}
    </Link>
  )
}
