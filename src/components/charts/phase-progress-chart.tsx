'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  Customized,
} from 'recharts'

interface PhaseData {
  phase: string
  label: string
  months: string
  total: number
  certified: number
  pending: number
  pct: number
  standardPct: number
}

interface Props {
  data: PhaseData[]
  cumulativeHours?: number
  standardHours?: number
}

const COLORS = ['#f97316', '#f59e0b', '#ef4444']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomXTickWithMonths(data: PhaseData[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function Tick({ x, y, index }: any) {
    const item = data[index]
    if (!item) return null
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fill="#6b7280" fontSize={11}>
          {item.label}
        </text>
        {item.months && (
          <text x={0} y={0} dy={26} textAnchor="middle" fill="#9ca3af" fontSize={10}>
            {item.months}
          </text>
        )}
      </g>
    )
  }
}

// チャート右上に勤務時間情報を表示するカスタムコンポーネント
function HoursLabel({ cumulativeHours, standardHours }: { cumulativeHours: number; standardHours: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function Inner({ width, margin }: any) {
    const x = (width ?? 0) + (margin?.left ?? 0) - 4
    return (
      <g>
        <text x={x} y={14} textAnchor="end" fill="#9ca3af" fontSize={10}>
          標準完了
        </text>
        <text x={x} y={26} textAnchor="end" fill="#9ca3af" fontSize={11} fontWeight="600">
          {standardHours}h
        </text>
        <text x={x} y={42} textAnchor="end" fill="#f97316" fontSize={10}>
          累計勤務
        </text>
        <text x={x} y={54} textAnchor="end" fill="#f97316" fontSize={11} fontWeight="700">
          {cumulativeHours}h
        </text>
      </g>
    )
  }
}

export function PhaseProgressChart({ data, cumulativeHours = 0, standardHours = 0 }: Props) {
  const TickComponent = CustomXTickWithMonths(data)
  const HoursLabelInner = HoursLabel({ cumulativeHours, standardHours })
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 20, left: -20 }} barCategoryGap="25%" barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
        <XAxis
          dataKey="label"
          tick={<TickComponent />}
          interval={0}
          axisLine={false}
          tickLine={false}
          height={45}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any, props: any) => {
            if (name === 'pct') return [`${value ?? 0}% (${props.payload.certified}/${props.payload.total}件)`, '実績']
            return [`${value ?? 0}%`, '標準']
          }}
          contentStyle={{
            borderRadius: '8px',
            border: 'none',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            fontSize: '12px',
          }}
        />
        <Legend
          formatter={(value) => value === 'pct' ? '実績' : '標準'}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
        />
        <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
        <Bar dataKey="standardPct" radius={[4, 4, 0, 0]} maxBarSize={40} fill="#d1d5db" />
        <Customized component={<HoursLabelInner />} />
      </BarChart>
    </ResponsiveContainer>
  )
}
