import { useState, useEffect } from 'react'
import { AdminDashboard, PendingReminderQuote, getPendingReminderQuotes, sendQuoteReminder } from '../../api/admin'
import { AdminScreen } from '../useAdminNav'

interface Props {
  dashboard: AdminDashboard | null
  onNav: (screen: AdminScreen) => void
  onBadgeChange?: () => void
}

interface KpiCardProps {
  label: string
  value: number | null
  colorClass: 'blue' | 'orange' | 'green' | 'red' | 'purple' | 'yellow'
  onClick: () => void
  icon: React.ReactNode
  badge?: boolean
}

function KpiCard({ label, value, colorClass, onClick, icon, badge }: KpiCardProps) {
  return (
    <div className="admin-kpi-card" onClick={onClick} style={{ position: 'relative' }}>
      {badge && value ? <span className="admin-kpi-badge">{value}</span> : null}
      <div className={`admin-kpi-icon ${colorClass}`}>{icon}</div>
      <div className="admin-kpi-value">{value ?? '—'}</div>
      <div className="admin-kpi-label">{label}</div>
    </div>
  )
}

function IconClock() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
}
function IconCash() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2V6h10a2 2 0 0 0-2-2H4zm2 6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H6zm7 4a1 1 0 1 0-2 0 1 1 0 0 0 2 0z" clipRule="evenodd"/></svg>
}
function IconUsers() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm8 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a5 5 0 0 0-5 5h10a5 5 0 0 0-5-5z"/></svg>
}
function IconReceipt() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 0 0-1 1v14l3-2 2 2 2-2 2 2 2-2 3 2V3a1 1 0 0 0-1-1H4zm2 5a1 1 0 0 1 1-1h6a1 1 0 1 1 0 2H7a1 1 0 0 1-1-1zm1 3a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H7z" clipRule="evenodd"/></svg>
}
function IconCalendar() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 0 0-1 1v1H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-1V3a1 1 0 1 0-2 0v1H7V3a1 1 0 0 0-1-1zm0 5a1 1 0 0 0 0 2h8a1 1 0 1 0 0-2H6z" clipRule="evenodd"/></svg>
}
function IconBell() {
  return <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zm0 16a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2z"/></svg>
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtCHF(amount: number) {
  return amount.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function daysSince(iso: string | null): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

interface ReminderModalProps {
  onClose: () => void
  onSent: () => void
}

function ReminderModal({ onClose, onSent }: ReminderModalProps) {
  const [quotes, setQuotes] = useState<PendingReminderQuote[] | null>(null)
  const [sending, setSending] = useState<number | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    getPendingReminderQuotes().then(setQuotes).catch(() => setQuotes([]))
  }, [])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSend(quoteId: number) {
    setSending(quoteId)
    try {
      await sendQuoteReminder(quoteId)
      showToast('Erinnerung gesendet', 'success')
      setQuotes(q => q ? q.filter(x => x.id !== quoteId) : q)
      onSent()
    } catch {
      showToast('Fehler beim Senden', 'error')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="admin-modal-header">
          <div className="admin-modal-title">Offerten-Erinnerungen</div>
          <button className="admin-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">
          {toast && (
            <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
          )}
          {quotes === null && (
            <div className="admin-loading"><div className="admin-spinner" />Lade…</div>
          )}
          {quotes !== null && quotes.length === 0 && (
            <div className="admin-empty">Keine fälligen Erinnerungen</div>
          )}
          {quotes !== null && quotes.length > 0 && (
            <div className="admin-list">
              {quotes.map(q => (
                <div key={q.id} className="admin-list-item" style={{ gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{q.quote_number}</div>
                    <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      {q.customer_name} — {q.project_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      Gesendet: {fmtDate(q.sent_at)} ({daysSince(q.sent_at)} Tage) · CHF {fmtCHF(q.total_amount)}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {q.customer_email}
                    </div>
                  </div>
                  <button
                    className="admin-btn admin-btn-primary"
                    style={{ whiteSpace: 'nowrap' }}
                    disabled={sending === q.id}
                    onClick={() => handleSend(q.id)}
                  >
                    {sending === q.id ? 'Sende…' : 'Erinnerung senden'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardScreen({ dashboard, onNav, onBadgeChange }: Props) {
  const [showReminderModal, setShowReminderModal] = useState(false)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Dashboard</div>
          <div className="admin-page-subtitle">Übersicht offener Aufgaben</div>
        </div>
      </div>

      <div className="admin-kpi-grid">
        <KpiCard
          label="Zeitkorrekturen offen"
          value={dashboard?.pending_corrections ?? null}
          colorClass="orange"
          onClick={() => onNav('corrections')}
          icon={<IconClock />}
        />
        <KpiCard
          label="Rechnungen offen"
          value={dashboard?.open_invoices ?? null}
          colorClass="red"
          onClick={() => onNav('invoices')}
          icon={<IconCash />}
        />
        <KpiCard
          label="Aktive Sessions"
          value={dashboard?.open_sessions ?? null}
          colorClass="green"
          onClick={() => onNav('hr-reports')}
          icon={<IconUsers />}
        />
        <KpiCard
          label="Absenzen pendent"
          value={dashboard?.pending_absences ?? null}
          colorClass="blue"
          onClick={() => onNav('absences')}
          icon={<IconCalendar />}
        />
        <KpiCard
          label="Offerten in Bearbeitung"
          value={dashboard?.draft_quotes ?? null}
          colorClass="purple"
          onClick={() => onNav('quotes')}
          icon={<IconReceipt />}
        />
        <KpiCard
          label="Erinnerungen fällig"
          value={dashboard?.quotes_pending_reminder ?? null}
          colorClass="yellow"
          onClick={() => setShowReminderModal(true)}
          icon={<IconBell />}
          badge
        />
      </div>

      {dashboard === null && (
        <div className="admin-loading">
          <div className="admin-spinner" />
          Lade Dashboard…
        </div>
      )}

      {showReminderModal && (
        <ReminderModal
          onClose={() => setShowReminderModal(false)}
          onSent={() => { onBadgeChange?.() }}
        />
      )}
    </div>
  )
}
