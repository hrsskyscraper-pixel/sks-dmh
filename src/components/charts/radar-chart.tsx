'use client'

import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

interface RadarData {
  category: string
  value: number
  total: number
  certified: number
}

interface Props {
  data: RadarData[]
}

export function RadarChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RechartsRadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
        <PolarGrid stroke="#e5e7eb" />
        <PolarAngleAxis
          dataKey="category"
          tick={{ fontSize: 13, fontWeight: 600, fill: '#374151' }}
        />
        <Radar
          name="達成率"
          dataKey="value"
          stroke="#f97316"
          fill="#f97316"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, _name: any, props: any) => [
            `${value ?? 0}% (${props.payload.certified}/${props.payload.total})`,
            props.payload.category,
          ]}
          contentStyle={{
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '12px',
          }}
        />
      </RechartsRadarChart>
    </ResponsiveContainer>
  )
}
