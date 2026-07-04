'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export type TrendSeries = { id: string; name: string; color: string }
export type TrendPoint = { month: string } & Record<string, number | string>

/**
 * 月別スキル認定数の折れ線チャート（モバイル幅前提・最大8系列）。
 * 系列の色は呼び出し側（trend-explorer）が固定順パレットで entity に割り当てて渡す。
 */
export function TrendChart({ data, series, unit }: { data: TrendPoint[]; series: TrendSeries[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
        <CartesianGrid stroke="#f3f4f6" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={{ stroke: '#e5e7eb' }}
          interval="preserveStartEnd"
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          width={34}
        />
        <Tooltip
          itemSorter={item => -(item.value as number)}
          formatter={(value: number | string | undefined, name: string | undefined) => [`${value ?? 0}${unit}`, name]}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', padding: '6px 10px' }}
          labelStyle={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}
        />
        {series.map(s => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={s.id}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: s.color }}
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: '#fff' }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
