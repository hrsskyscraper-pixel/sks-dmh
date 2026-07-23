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

  // スター → 星型
  if (ranks.star) {
    const id = `cr-${idKey}-star`
    const path =
      'M40,2 L49.3,26.9 L75.9,28 L54.9,44.6 L62.1,70.4 L40,55.6 L17.9,70.4 L25.1,44.6 L4.1,28 L30.7,26.9 Z'
    return (
      <svg {...common}>
        <defs>
          <Grad id={id} stops={MATERIAL.gold} />
        </defs>
        <path d={path} fill={`url(#${id})`} stroke="#a5560a" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    )
  }

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
