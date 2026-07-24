import type { CertRanks, Grade } from '@/lib/cert-ranks'

// 階級 → メタリックなグラデーション（上=明 → 下=暗）
const MATERIAL: Record<string, [string, string, string]> = {
  blue: ['#8fd3ff', '#2f7ff0', '#1d4ed8'],
  silver: ['#fbfcfd', '#c2ccd8', '#5b6675'],
  gold: ['#fff2b0', '#f4a824', '#a5560a'],
  emerald: ['#8ef0c4', '#12b981', '#046a4d'],
  gray: ['#efeeec', '#ddd9d4', '#cbc7c1'],
}
const GRADE_MATERIAL: Record<Grade, string> = { 1: 'gold', 2: 'silver', 3: 'blue' }

function Grad({ id, stops }: { id: string; stops: [string, string, string] }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={stops[0]} />
      <stop offset="0.5" stopColor={stops[1]} />
      <stop offset="1" stopColor={stops[2]} />
    </linearGradient>
  )
}

/**
 * アバターの周りに描く資格リング（アバター本体は描かない・重ねる前提）。
 * 左半分＝調理階級 / 右半分＝接客階級。スターは星型、初級はリング全体を緑。
 * `idKey` はグラデーションIDの一意化用（通常 employeeId を渡す）。
 */
export function CertRing({
  ranks,
  size,
  idKey,
}: {
  ranks: CertRanks
  size: number
  idKey: string
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 80 80',
    style: { position: 'absolute' as const, inset: 0, pointerEvents: 'none' as const },
    'aria-hidden': true,
  }

  // スターはリングではなく、アバター左上の小さなバッジ（CertStarBadge）で表現する。
  const hasSplit = ranks.cook !== null || ranks.service !== null

  // 初級のみ → リング全体を緑
  if (!hasSplit) {
    if (!ranks.beginner) return null
    const id = `cr-${idKey}-beg`
    return (
      <svg {...common}>
        <defs>
          <Grad id={id} stops={MATERIAL.emerald} />
        </defs>
        <circle cx="40" cy="40" r="35" fill="none" stroke={`url(#${id})`} strokeWidth="5.5" />
      </svg>
    )
  }

  // 調理／接客の2分割リング（未取得の半分はグレー）
  const cookMat = ranks.cook ? MATERIAL[GRADE_MATERIAL[ranks.cook]] : MATERIAL.gray
  const servMat = ranks.service ? MATERIAL[GRADE_MATERIAL[ranks.service]] : MATERIAL.gray
  const gc = `cr-${idKey}-c`
  const gs = `cr-${idKey}-s`
  return (
    <svg {...common}>
      <defs>
        <Grad id={gc} stops={cookMat} />
        <Grad id={gs} stops={servMat} />
      </defs>
      {/* 左半分（調理） */}
      <path
        d="M 37.9 5.06 A 35 35 0 0 0 37.9 74.94"
        fill="none"
        stroke={`url(#${gc})`}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      {/* 右半分（接客） */}
      <path
        d="M 42.1 5.06 A 35 35 0 0 1 42.1 74.94"
        fill="none"
        stroke={`url(#${gs})`}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * スター保有者の目印。アバターの左上に小さな金色の星バッジを重ねる。
 * 白フチ付きで、どんな写真の上でも見えるようにする。
 */
export function CertStarBadge({ size, idKey }: { size: number; idKey: string }) {
  const badge = Math.max(12, Math.round(size * 0.44))
  const id = `star-${idKey}`
  // 24x24 viewBox の5角星（中心 12,12）
  const path =
    'M12 1.6 L14.9 8.5 L22.3 9.1 L16.6 13.9 L18.4 21.1 L12 17.2 L5.6 21.1 L7.4 13.9 L1.7 9.1 L9.1 8.5 Z'
  return (
    <svg
      width={badge}
      height={badge}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ position: 'absolute', left: -badge * 0.18, top: -badge * 0.18, pointerEvents: 'none' }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2b0" />
          <stop offset="0.5" stopColor="#f4a824" />
          <stop offset="1" stopColor="#c47708" />
        </linearGradient>
      </defs>
      {/* 白フチ（写真の上でも視認できるように） */}
      <path d={path} fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinejoin="round" />
      <path d={path} fill={`url(#${id})`} stroke="#a5560a" strokeWidth="0.8" strokeLinejoin="round" />
    </svg>
  )
}
