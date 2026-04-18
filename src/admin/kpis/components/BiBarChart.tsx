import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { useChartTheme } from './useChartTheme'

interface BarDef {
  dataKey: string
  color: string
  label: string
}

interface Props {
  data: Record<string, unknown>[]
  xKey: string
  bars: BarDef[]
  height?: number
}

export default function BiBarChart({ data, xKey, bars, height = 260 }: Props) {
  const t = useChartTheme()
  if (!data.length) return null

  return (
    <div className="kpi-bi-chart-wrap">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: t.tickMuted, fontSize: 11 }}
            axisLine={{ stroke: t.axis }}
            tickLine={false}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: t.tickMuted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
          />
          <Tooltip
            contentStyle={{
              background: t.tooltipBg,
              border: `1px solid ${t.tooltipBorder}`,
              borderRadius: 8,
              color: t.tooltipText,
              fontSize: 12,
            }}
            formatter={(value: unknown) => typeof value === 'number' ? value.toLocaleString('de-CH') : String(value ?? '')}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: t.tickMuted, paddingTop: 8 }}
          />
          {bars.map((b) => (
            <Bar key={b.dataKey} dataKey={b.dataKey} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
