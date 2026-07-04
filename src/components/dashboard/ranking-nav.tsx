import Link from 'next/link'
import { cn } from '@/lib/utils'

/** ランキング（棒グラフ）⇔ 推移（折れ線）のページ切替タブ */
export function RankingNav({ active }: { active: 'ranking' | 'trend' }) {
  const tabs = [
    { key: 'ranking' as const, href: '/ranking', label: '🏆 ランキング' },
    { key: 'trend' as const, href: '/ranking/trend', label: '📈 推移' },
  ]
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-0.5 mb-3">
      {tabs.map(t => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            'px-4 py-1.5 text-xs font-semibold rounded-md transition-colors',
            active === t.key ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700',
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )
}
