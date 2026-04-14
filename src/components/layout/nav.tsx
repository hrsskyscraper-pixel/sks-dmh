'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { LayoutDashboard, CheckSquare, BadgeCheck, Upload, Users2, LogOut, Building2, FolderKanban, MessageSquare, UserPlus, Settings, User, FileText, HelpCircle, Shield, ScrollText, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { useNotificationCount } from '@/components/layout/notification-context'
import type { Role } from '@/types/database'
import { canAdminister } from '@/lib/permissions'

const navItems = [
  { href: '/',                 label: 'ホーム',     icon: LayoutDashboard,    roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/skills',           label: 'スキル',     icon: CheckSquare,        roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/timeline',         label: 'TL',         icon: MessageSquare,      roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/approvals',        label: '承認',        icon: BadgeCheck,         roles: ['store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/admin/teams',      label: 'チーム',      icon: Building2,          roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/admin/employees',  label: '仲間',        icon: Users2,             roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
] as const

interface NavProps {
  role: Role
  unreadRequestCount?: number
  pendingApprovalCount?: number
  dashboardBadge?: { count: number; color: 'red' | 'blue' } | null
  avatarUrl?: string | null
  employeeId?: string
  employeeName?: string
  rejectedSkillCount?: number
}

function AccountMenu({ avatarUrl, employeeId, employeeName, role, onLogout }: { avatarUrl?: string | null; employeeId?: string; employeeName?: string; role?: Role; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px]"
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-gray-200" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-gray-500" />
          </div>
        )}
        <span className="text-[10px] font-medium text-gray-400">My</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full right-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[160px] overflow-hidden">
            {employeeName && (
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-700 truncate">{employeeName}</p>
              </div>
            )}
            {employeeId && (
              <Link
                href={`/admin/employees/${employeeId}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-4 h-4 text-gray-400" />
                Myキャリア
              </Link>
            )}
            <Link
              href="/help"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-gray-400" />
              使い方ガイド
            </Link>
            <Link
              href="/changelog"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <History className="w-4 h-4 text-gray-400" />
              更新履歴
            </Link>
            {role && canAdminister({ role }) && (
              <Link
                href="/admin/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-4 h-4 text-gray-400" />
                設定
              </Link>
            )}
            <div className="border-t border-gray-100 mt-1">
              <Link
                href="/privacy"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-gray-400" />
                プライバシーポリシー
              </Link>
              <Link
                href="/terms"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <ScrollText className="w-3.5 h-3.5 text-gray-400" />
                利用規約
              </Link>
            </div>
            <button
              onClick={() => { setOpen(false); onLogout() }}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors w-full text-left border-t border-gray-100"
            >
              <LogOut className="w-4 h-4" />
              ログアウト
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function BottomNav({ role, unreadRequestCount = 0, pendingApprovalCount = 0, dashboardBadge = null, avatarUrl, employeeId, employeeName, rejectedSkillCount = 0 }: NavProps) {
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
          const showDashBadge = href === '/' && dashboardBadge && dashboardBadge.count > 0
          const showSkillBadge = href === '/skills' && rejectedSkillCount > 0
          const showBadge = showDashBadge || showSkillBadge || (href === '/admin/teams' && unreadRequestCount > 0) || (href === '/approvals' && pendingApprovalCount > 0)
          const badgeCount = showDashBadge ? dashboardBadge!.count : showSkillBadge ? rejectedSkillCount : href === '/approvals' ? pendingApprovalCount : unreadRequestCount
          const badgeBg = showDashBadge ? (dashboardBadge!.color === 'red' ? 'bg-red-500' : 'bg-blue-500') : showSkillBadge ? 'bg-red-500' : 'bg-red-500'
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
                  <span className={`absolute -top-1 -right-1 ${badgeBg} text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none`}>
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
        <AccountMenu
          avatarUrl={avatarUrl}
          employeeId={employeeId}
          employeeName={employeeName}
          role={role}
          onLogout={handleLogout}
        />
      </div>
    </nav>
  )
}

export function TopBar({ title, right, hideNotificationBell = false }: { title: string; right?: React.ReactNode; hideNotificationBell?: boolean }) {
  const notificationCount = useNotificationCount()
  return (
    <header className="sticky bg-white/80 backdrop-blur-sm border-b border-gray-100 z-40" style={{ top: 'var(--banner-h, 0px)' }}>
      <div className="flex items-center h-14 px-4 max-w-2xl mx-auto gap-2">
        <Link href="/" className="flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{title}</h1>
          {title === 'Growth Driver' && (
            <p className="text-[10px] text-gray-400 leading-none mt-1">GAPから、次の一歩へ。</p>
          )}
        </Link>
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
