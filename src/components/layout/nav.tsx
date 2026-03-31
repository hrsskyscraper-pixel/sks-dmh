'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CheckSquare, BadgeCheck, Upload, Users2, LogOut, Building2, FolderKanban, MessageSquare, UserPlus, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { useNotificationCount } from '@/components/layout/notification-context'
import type { Role } from '@/types/database'

const navItems = [
  { href: '/',                 label: 'ダッシュボード', icon: LayoutDashboard,    roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/skills',           label: 'スキル',         icon: CheckSquare,        roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/timeline',         label: 'タイムライン',   icon: MessageSquare,      roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/team',             label: '認定',            icon: BadgeCheck,         roles: ['store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/admin/teams',      label: 'チーム',          icon: Building2,          roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/admin/employees',  label: 'メンバー',        icon: Users2,             roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/approval',         label: '参加許諾',          icon: UserPlus,           roles: ['store_manager', 'manager', 'admin', 'ops_manager', 'executive'] },
  { href: '/admin/settings',   label: '設定',             icon: Settings,           roles: ['admin', 'ops_manager', 'executive'] },
] as const

interface NavProps {
  role: Role
  unreadRequestCount?: number
  pendingApprovalCount?: number
}

export function BottomNav({ role, unreadRequestCount = 0, pendingApprovalCount = 0 }: NavProps) {
  const pathname = usePathname()
  const router = useRouter()
  const visibleItems = navItems.filter(item => (item.roles as readonly string[]).includes(role))

  const handleLogout = async () => {
    // view-as cookie をクリア
    document.cookie = `${VIEW_AS_COOKIE}=; path=/; max-age=0`
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-pb">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const showBadge = (href === '/admin/teams' && unreadRequestCount > 0) || (href === '/approval' && pendingApprovalCount > 0)
          const badgeCount = href === '/approval' ? pendingApprovalCount : unreadRequestCount
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px]',
                isActive
                  ? 'text-orange-500'
                  : 'text-gray-400 hover:text-gray-600'
              )}
            >
              <div className="relative">
                <Icon className={cn('w-5 h-5', isActive && 'text-orange-500')} />
                {showBadge && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
        <button
          onClick={handleLogout}
          className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px] text-gray-400 hover:text-red-500"
        >
          <LogOut className="w-5 h-5" />
          <span className="text-[10px] font-medium">ログアウト</span>
        </button>
      </div>
    </nav>
  )
}

export function TopBar({ title, right, hideNotificationBell = false }: { title: string; right?: React.ReactNode; hideNotificationBell?: boolean }) {
  const notificationCount = useNotificationCount()
  return (
    <header className="sticky bg-white/80 backdrop-blur-sm border-b border-gray-100 z-40" style={{ top: 'var(--banner-h, 0px)' }}>
      <div className="flex items-center h-14 px-4 max-w-2xl mx-auto gap-2">
        <h1 className="text-base font-bold text-gray-900 flex-shrink-0">{title}</h1>
        <div className="flex-1 min-w-0 flex justify-end">
          {right}
        </div>
        {!hideNotificationBell && <Link
          href="/notifications"
          className="relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
          {notificationCount > 0 && (
            <span className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 leading-none">
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </Link>}
      </div>
    </header>
  )
}
