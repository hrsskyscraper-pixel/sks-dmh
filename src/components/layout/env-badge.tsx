/**
 * 開発版（ステージング）で常に画面に出す目印。本番と見間違えないため（2026-09-20 須貝さん指示）。
 * 判定は接続先の Supabase がステージング（giwqelfbvsgucpnzzdao）か、NEXT_PUBLIC_APP_ENV=staging。本番では何も出さない。
 */
export function EnvBadge() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const isStaging = process.env.NEXT_PUBLIC_APP_ENV === 'staging' || url.includes('giwqelfbvsgucpnzzdao')
  if (!isStaging) return null
  return (
    <div
      aria-label="開発版"
      className="pointer-events-none fixed left-1/2 top-1 z-[9999] -translate-x-1/2 select-none rounded-full border-2 border-white bg-red-600 px-3 py-0.5 text-[11px] font-black tracking-wider text-white shadow-lg"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 4px)' }}
    >
      開発版 — 本番ではありません
    </div>
  )
}
