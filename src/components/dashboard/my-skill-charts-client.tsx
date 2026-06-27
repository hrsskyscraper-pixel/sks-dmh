'use client'

import dynamic from 'next/dynamic'
import type { DashboardChartsProps } from '@/components/charts/dashboard-charts'

// recharts を ssr:false で遅延ロード（server コンポーネントからは dynamic ssr:false を使えないため、
// この薄い client ラッパーを経由する）
const DashboardCharts = dynamic(
  () => import('@/components/charts/dashboard-charts').then(m => m.DashboardCharts),
  { ssr: false }
)

export function MySkillChartsClient(props: DashboardChartsProps) {
  return <DashboardCharts {...props} />
}
