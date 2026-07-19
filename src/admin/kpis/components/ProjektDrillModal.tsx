import { useEffect } from 'react'
import type { ReactNode } from 'react'
import type { PipelineProjektAgg } from '../pipelineAggregation'

const chf = (v: number | null | undefined) =>
  typeof v === 'number'
    ? `CHF ${v.toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : '—'

const OFFERTE_STATUS: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Entwurf', color: '#94a3b8' },
  gesendet: { label: 'Versendet', color: '#f59e0b' },
  akzeptiert: { label: 'Akzeptiert', color: '#22c55e' },
  abgelehnt: { label: 'Abgelehnt', color: '#ef4444' },
}

const RECHNUNG_STATUS: Record<string, { label: string; color: string }> = {
  ausstehend: { label: 'Ausstehend', color: '#94a3b8' },
  gesendet: { label: 'Versendet', color: '#3b82f6' },
  bezahlt: { label: 'Bezahlt', color: '#22c55e' },
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ background: color, color: '#fff', borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
      {label}
    </span>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: 'var(--text)' }}>{title}</div>
      {children}
    </div>
  )
}

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: '1px solid var(--border-subtle)',
  fontSize: 13,
} as const

const emptyLine = <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Keine im Zeitraum.</div>

function outsideHint(gesamt: number, gezeigt: number): ReactNode {
  if (gesamt <= gezeigt) return null
  return (
    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
      +{gesamt - gezeigt} ausserhalb des Zeitraums
    </div>
  )
}

interface Props {
  projekt: PipelineProjektAgg
  from: string | null
  to: string | null
  onClose: () => void
}

export default function ProjektDrillModal({ projekt: p, from, to, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const rangeLabel = from || to ? `Zeitraum ${from ?? '…'} – ${to ?? '…'}` : 'Alle Datensätze'

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="admin-modal-header">
          <div className="admin-modal-title">
            {p.projektNummer ? `${p.projektNummer} · ` : ''}{p.projektName}
          </div>
          <button className="admin-modal-close" onClick={onClose} aria-label="Schliessen">×</button>
        </div>

        <div className="admin-modal-body">
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{p.kunde} · {p.projektleiter}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {p.isClosed ? 'Abgeschlossen' : 'Offen'} · {rangeLabel}
          </div>

          <Section title={`Offerten (${p.offertenDetail.length})`}>
            {p.offertenDetail.length === 0 && emptyLine}
            {p.offertenDetail.map((o, i) => {
              const s = OFFERTE_STATUS[o.status] ?? { label: o.status, color: '#94a3b8' }
              return (
                <div key={i} style={rowStyle}>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Badge label={s.label} color={s.color} />
                    <span style={{ color: 'var(--text-muted)' }}>{o.datum ?? '—'}</span>
                  </span>
                  <span>{chf(o.betrag)}</span>
                </div>
              )
            })}
            {outsideHint(p.offertenGesamt, p.offertenDetail.length)}
          </Section>

          <Section title={`Rapporte (${p.rapporteDetail.length})`}>
            {p.rapporteDetail.length === 0 && emptyLine}
            {p.rapporteDetail.map((d, i) => (
              <div key={i} style={rowStyle}>
                <span style={{ color: 'var(--text-muted)' }}>{d}</span>
              </div>
            ))}
            {outsideHint(p.rapporteGesamt, p.rapporteDetail.length)}
          </Section>

          <Section title={`Rechnungen (${p.rechnungenDetail.length})`}>
            {p.rechnungenDetail.length === 0 && emptyLine}
            {p.rechnungenDetail.map((r, i) => {
              const s = RECHNUNG_STATUS[r.status] ?? { label: r.status, color: '#94a3b8' }
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Badge label={s.label} color={s.color} />
                    <strong>{chf(r.betrag)}</strong>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {r.gesendet_am ? `Versendet ${r.gesendet_am}` : 'Nicht versendet'}
                    {r.bezahlt_am ? ` · Bezahlt ${r.bezahlt_am} (${chf(r.bezahlt_betrag)})` : ''}
                  </div>
                </div>
              )
            })}
            {outsideHint(p.rechnungenGesamt, p.rechnungenDetail.length)}
          </Section>
        </div>
      </div>
    </div>
  )
}
