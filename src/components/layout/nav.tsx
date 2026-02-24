'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CheckSquare, Users, Upload, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Role } from '@/types/database'

const navItems = [
  { href: '/',        label: 'ダッシュボード', icon: LayoutDashboard, roles: ['employee', 'manager', 'admin'] },
  { href: '/skills',  label: 'スキル',         icon: CheckSquare,     roles: ['employee', 'manager', 'admin'] },
  { href: '/team',    label: 'チーム',          icon: Users,           roles: ['manager', 'admin'] },
  { href: '/admin/csv-import', label: 'CSV取込', icon: Upload,         roles: ['manager', 'admin'] },
  { href: '/admin/employees',  label: '社員管理', icon: Settings,      roles: ['admin'] },
] as const

interface NavProps {
  role: Role
}

export function BottomNav({ role }: NavProps) {
  const pathname = usePathname()
  const visibleItems = navItems.filter(item => (item.roles as readonly string[]).includes(role))

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-pb">
      <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
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
              <Icon className={cn('w-5 h-5', isActive && 'text-orange-500')} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export function TopBar({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-100 z-40">
      <div className="flex items-center justify-between h-14 px-4 max-w-2xl mx-auto">
        <h1 className="text-base font-bold text-gray-900">{title}</h1>
        {right}
      </div>
    </header>
  )
}
