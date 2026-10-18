import { isStagingEnv } from '@/lib/app-env'

/**
 * 開発版（ステージング）で常に画面に出す目印。本番と見間違えないため（2026-09-20 須貝さん指示）。
 * 2026-10-19: 開発版でスキルを更新してしまった件を受けて、誰でも気付けるように強めた。
 * - 画面上部の帯（スクロールすると流れる）
 * - 画面の縁を囲むオレンジの枠と、右上の札（常に見える）
 * - 画面全体を暖色に寄せる薄い膜（ページごとの地色に関係なく効く）と、
 *   地色そのものの差し替え（globals.css の html[data-env="staging"]）
 * 本番では何も出さない。
 */
export function EnvBadge() {
  if (!isStagingEnv()) return null
  return (
    <>
      <div
        role="note"
        className="staging-stripes select-none px-3 py-1.5 text-center text-xs font-bold text-white"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)' }}
      >
        <span className="rounded bg-orange-700/90 px-2 py-0.5">
          ここは開発版です。ここで変えた内容は、本番には反映されません
        </span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[9998]"
        style={{
          boxShadow: 'inset 0 0 0 5px var(--staging-accent)',
          background: 'oklch(0.85 0.14 70 / 0.18)',
          mixBlendMode: 'multiply',
        }}
      />
      <div
        aria-label="開発版"
        className="pointer-events-none fixed right-[5px] z-[9999] select-none rounded-bl-lg px-3 py-0.5 text-[11px] font-black tracking-wider text-white shadow-lg"
        style={{ top: 'env(safe-area-inset-top, 0px)', background: 'var(--staging-accent)' }}
      >
        開発版
      </div>
    </>
  )
}
