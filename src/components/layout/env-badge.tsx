import { isStagingEnv } from '@/lib/app-env'

/**
 * 開発版（ステージング）で常に画面に出す目印。本番と見間違えないため（2026-09-20 須貝さん指示）。
 * 2026-10-19: 開発版でスキルを更新してしまった件を受けて、誰でも気付けるように強めた。
 * - 画面上部に固定した縞模様の帯（どの画面でも、スクロールしても見える。文字が明滅する）
 * - 画面の縁を囲む緑の枠
 * - 画面全体を緑に寄せる薄い膜（ページごとの地色に関係なく効く）と、
 *   地色・テーマ色そのものの差し替え（globals.css の html[data-env="staging"]）
 * 帯の高さぶん body を下げ、上端に貼り付く見出しもずらす（globals.css）。
 * 本番では何も出さない。
 */
export function EnvBadge() {
  if (!isStagingEnv()) return null
  return (
    <>
      <div
        role="note"
        className="staging-stripes pointer-events-none fixed inset-x-0 top-0 z-[9999] flex select-none items-end justify-center px-2 pb-1 text-center text-xs font-bold text-white"
        style={{ height: 'var(--staging-band-h)' }}
      >
        <span className="staging-blink truncate rounded bg-emerald-950/85 px-2 py-0.5">
          ⚠ 開発版です。ここで変えた内容は、本番には反映されません
        </span>
      </div>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[9998]"
        style={{
          boxShadow: 'inset 0 0 0 5px var(--staging-accent)',
          background: 'oklch(0.85 0.12 150 / 0.16)',
          mixBlendMode: 'multiply',
        }}
      />
    </>
  )
}
