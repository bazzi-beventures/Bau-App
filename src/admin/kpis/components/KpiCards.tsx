interface CardDef {
  label: string
  value: string
  color?: string
  sub?: string
  subColor?: string
}

interface Props {
  cards: CardDef[]
  columns?: number
}

export default function KpiCards({ cards, columns }: Props) {
  return (
    <div
      className="kpi-bi-cards"
      style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}
    >
      {cards.map((c, i) => (
        <div key={i} className="kpi-bi-card">
          <div className="kpi-bi-card-label">{c.label}</div>
          <div className="kpi-bi-card-value" style={c.color ? { color: c.color } : undefined}>
            {c.value}
          </div>
          {c.sub && <div className="kpi-bi-card-sub" style={c.subColor ? { color: c.subColor } : undefined}>{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}
