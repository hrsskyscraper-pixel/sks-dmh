'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { LayoutDashboard, CheckSquare, BadgeCheck, LogOut, Building2, MessageSquare, Settings, User, FileText, HelpCircle, Shield, ScrollText, History, Type, Search, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CertRingAvatar } from '@/components/ui/cert-ring-avatar'
import { createClient } from '@/lib/supabase/client'
import { VIEW_AS_COOKIE } from '@/lib/view-as'
import { useNavData, useNotificationCount } from '@/components/layout/nav-data-context'
import type { Role } from '@/types/database'
import { canAdminister } from '@/lib/permissions'
import { setFontScale } from '@/app/(dashboard)/actions'
import { FONT_SCALE_COOKIE, FONT_SCALE_OPTIONS, DEFAULT_FONT_SCALE } from '@/lib/font-scale'

const navItems = [
  { href: '/',                 label: 'ホーム',     icon: LayoutDashboard,    roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/skills',           label: 'スキル',     icon: CheckSquare,        roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/timeline',         label: 'TL',         icon: MessageSquare,      roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/approvals',        label: '承認',        icon: BadgeCheck,         roles: ['store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
  { href: '/admin/teams',      label: '所属',        icon: Building2,          roles: ['employee', 'store_manager', 'manager', 'admin', 'ops_manager', 'executive', 'testuser'] },
] as const

interface NavProps {
  role: Role
  avatarUrl?: string | null
  employeeId?: string
  employeeName?: string
  fontScale?: number
}

function FontScaleSelector({ fontScale }: { fontScale: number }) {
  const [current, setCurrent] = useState(fontScale)
  const [, startTransition] = useTransition()

  const handleSelect = (scale: number) => {
    setCurrent(scale)
    // 即座に反映（楽観的更新）: <html> と Cookie を更新してから DB へ永続化
    document.documentElement.style.fontSize = `${scale}%`
    document.cookie = `${FONT_SCALE_COOKIE}=${scale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    startTransition(async () => { await setFontScale(scale) })
  }

  return (
    <div className="px-3 py-2.5 border-t border-gray-100">
      <p className="text-xs text-gray-500 mb-1.5 flex items-center gap-1.5">
        <Type className="w-3.5 h-3.5 text-gray-400" />
        文字サイズ
      </p>
      <div className="flex gap-1">
        {FONT_SCALE_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            className={cn(
              'flex-1 rounded-md border py-1 text-xs transition-colors',
              current === opt.value
                ? 'border-orange-400 bg-orange-50 text-orange-600 font-semibold'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 設定メニュー（歯車アイコンで開く）。
 * 以前はフッターの「My」ボタンから上方向に開いていたが、フッターの「My」は
 * Myキャリアへの直接遷移に変更したため、このメニューは Myキャリアページの
 * ヘッダー（ベルアイコンの左）に歯車として設置し、下方向に開く。
 */
export function AccountSettingsMenu({ employeeId, employeeName, role, fontScale = DEFAULT_FONT_SCALE }: { employeeId?: string; employeeName?: string; role?: Role; fontScale?: number }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  const handleLogout = async () => {
    // view-as cookie をクリア
    document.cookie = `${VIEW_AS_COOKIE}=; path=/; max-age=0`
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label="設定メニュー"
        className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors"
      >
        <Settings className="w-[18px] h-[18px] text-gray-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px] overflow-hidden">
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
            <Link
              href="/improvements"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Lightbulb className="w-4 h-4 text-gray-400" />
              改善提案
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
            <FontScaleSelector fontScale={fontScale} />
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
              onClick={() => { setOpen(false); handleLogout() }}
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

export function BottomNav({ role, avatarUrl, employeeId }: NavProps) {
  const pathname = usePathname()
  const { unreadTeamReqCount, pendingApprovalCount, dashboardBadge, rejectedSkillCount, overdueSkillCount } = useNavData()
  const unreadRequestCount = unreadTeamReqCount
  // スキルナビ＝遅延スキル＋差し戻し未処理の合計
  const skillBadgeCount = rejectedSkillCount + overdueSkillCount
  const visibleItems = navItems.filter(item => (item.roles as readonly string[]).includes(role))

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-pb">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const showDashBadge = href === '/' && dashboardBadge && dashboardBadge.count > 0
          const showSkillBadge = href === '/skills' && skillBadgeCount > 0
          const showBadge = showDashBadge || showSkillBadge || (href === '/admin/teams' && unreadRequestCount > 0) || (href === '/approvals' && pendingApprovalCount > 0)
          const badgeCount = showDashBadge ? dashboardBadge!.count : showSkillBadge ? skillBadgeCount : href === '/approvals' ? pendingApprovalCount : unreadRequestCount
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
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
        <Link
          href={employeeId ? `/admin/employees/${employeeId}` : '/'}
          className={cn(
            'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[56px]',
            pathname.startsWith('/admin/employees') ? 'text-orange-500' : 'text-gray-400 hover:text-gray-600'
          )}
        >
          {avatarUrl ? (
            <CertRingAvatar employeeId={employeeId} src={avatarUrl} size={24} avatarClassName="border border-gray-200" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-gray-500" />
            </div>
          )}
          <span className="text-[10px] font-medium">My</span>
        </Link>
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
          {title === 'Mission Board' && (
            <p className="text-[10px] text-gray-400 leading-none mt-1">ミッションボード</p>
          )}
        </Link>
        <div className="flex-1 min-w-0 flex justify-end">
          {right}
        </div>
        <Link
          href="/search"
          aria-label="メンバー検索"
          className="flex items-center justify-center w-9 h-9 rounded-full hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <Search className="w-[18px] h-[18px] text-gray-500" />
        </Link>
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
