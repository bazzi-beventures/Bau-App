import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

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
  if (!data.length) return null

  return (
    <div className="kpi-bi-chart-wrap">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2332" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={{ stroke: '#1e2332' }}
            tickLine={false}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v)}
          />
          <Tooltip
            contentStyle={{
              background: '#161a24',
              border: '1px solid #1e2332',
              borderRadius: 8,
              color: '#e8eaf0',
              fontSize: 12,
            }}
            formatter={(value: unknown) => typeof value === 'number' ? value.toLocaleString('de-CH') : String(value ?? '')}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: '#6b7280', paddingTop: 8 }}
          />
          {bars.map((b) => (
            <Bar key={b.dataKey} dataKey={b.dataKey} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
