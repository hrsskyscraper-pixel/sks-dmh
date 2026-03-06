'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CheckSquare, BadgeCheck, Upload, Users2, LogOut, Building2, FolderKanban } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import type { Role } from '@/types/database'

const navItems = [
  { href: '/',                 label: 'ダッシュボード', icon: LayoutDashboard,    roles: ['employee', 'manager', 'admin', 'ops_manager', 'testuser'] },
  { href: '/skills',           label: 'スキル',         icon: CheckSquare,        roles: ['employee', 'manager', 'admin', 'ops_manager', 'testuser'] },
  { href: '/team',             label: '認定',            icon: BadgeCheck,         roles: ['manager', 'admin', 'ops_manager', 'testuser'] },
  { href: '/admin/teams',      label: 'チーム',          icon: Building2,          roles: ['employee', 'manager', 'admin', 'ops_manager', 'testuser'] },
  { href: '/admin/employees',  label: 'メンバー',        icon: Users2,             roles: ['employee', 'manager', 'admin', 'ops_manager', 'testuser'] },
  { href: '/admin/csv-import', label: 'CSV取込',         icon: Upload,             roles: ['manager', 'admin', 'ops_manager', 'testuser'] },
  { href: '/admin/projects',   label: 'プロジェクト',     icon: FolderKanban,       roles: ['admin', 'ops_manager', 'testuser'] },
] as const

interface NavProps {
  role: Role
  unreadRequestCount?: number
}

export function BottomNav({ role, unreadRequestCount = 0 }: NavProps) {
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
          const showBadge = href === '/admin/teams' && unreadRequestCount > 0
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
                    {unreadRequestCount > 9 ? '9+' : unreadRequestCount}
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

export function TopBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky bg-white/80 backdrop-blur-sm border-b border-gray-100 z-40" style={{ top: 'var(--banner-h, 0px)' }}>
      <div className="flex items-center justify-between h-14 px-4 max-w-2xl mx-auto">
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {right}
      </div>
    </header>
  )
}
