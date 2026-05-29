'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RadarChart } from './radar-chart'
import { PhaseProgressChart } from './phase-progress-chart'

// レーダー／フェーズの2チャートを1つの dynamic import 境界にまとめる。
// 別々に dynamic import すると recharts が各チャンクへ二重バンドルされる
// （~90KB gz ×2）。1コンポーネントに統合して recharts を1コピーにする。
type Props = {
  radarData: React.ComponentProps<typeof RadarChart>['data']
  phaseStats: React.ComponentProps<typeof PhaseProgressChart>['data']
  cumulativeHours: number
  standardHours: number
}

export function DashboardCharts({ radarData, phaseStats, cumulativeHours, standardHours }: Props) {
  return (
    <>
      {/* レーダーチャート */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">スキルバランス</CardTitle></CardHeader>
        <CardContent><RadarChart data={radarData} /></CardContent>
      </Card>

      {/* フェーズ別進捗チャート */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700">フェーズ別達成率</CardTitle></CardHeader>
        <CardContent>
          <PhaseProgressChart data={phaseStats} cumulativeHours={cumulativeHours} standardHours={standardHours} />
        </CardContent>
      </Card>
    </>
  )
}
