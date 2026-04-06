interface CardDef {
  label: string
  value: string
  color?: string
  sub?: string
}

interface Props {
  cards: CardDef[]
}

export default function KpiCards({ cards }: Props) {
  return (
    <div className="kpi-bi-cards">
      {cards.map((c, i) => (
        <div key={i} className="kpi-bi-card">
          <div className="kpi-bi-card-label">{c.label}</div>
          <div className="kpi-bi-card-value" style={c.color ? { color: c.color } : undefined}>
            {c.value}
          </div>
          {c.sub && <div className="kpi-bi-card-sub">{c.sub}</div>}
        </div>
      ))}
    </div>
  )
}
