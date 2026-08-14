import { useEffect, useState } from 'react'
import { apiFetch, apiUrl } from '../../api/client'
import { INVOICE_STATUS_LABELS as STATUS_LABELS, INVOICE_STATUS_BADGE as STATUS_BADGE } from '../constants/statuses'
import { fmtCHF, fmtDate, todayISO } from '../utils/format'
import { StatusFilterPopover } from '../components/StatusFilterPopover'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { AdminCardList } from '../components/AdminCardList'
import { AutoGrowTextarea } from '../components/AutoGrowTextarea'
import { useIsMobile } from '../useIsMobile'

interface Invoice {
  id: number
  invoice_number: string
  project_name: string
  total_amount: number
  status: string
  created_at: string
  paid_at: string | null
  pdf_url: string | null
  storage_path?: string | null
  customer_email?: string | null
  projektleiter_id: string | null
  // Projektbezug: nach dem Bezahlen fragt die Übersicht, ob das Projekt
  // abgeschlossen werden soll — bei einem längst geschlossenen Projekt nicht.
  project_id: string | null
  project_status?: string | null
  project_is_closed?: boolean | null
}

interface ProjektleiterOption {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
  // Eindeutige Projektnummer — steht in der Auswahl hinter dem Namen, weil zwei
  // Projekte gleich heissen dürfen.
  project_id_text?: string | null
  customer?: { email?: string | null } | null
  is_closed?: boolean
}

const ALL_STATUSES = ['ausstehend', 'offen', 'gesendet', 'bezahlt', 'archiviert', 'inaktiv']

// Sammelrechnung: hat der Kunde mehrere Offerten eines Projekts angenommen
// ('mehrfach'-Gruppe), deckt EINE Rechnung alle noch unverrechneten ab. Das ist
// nicht offensichtlich — deshalb im Erfolgs-Toast benennen, welche das waren.
// Bei genau einer Offerte (Normalfall) bleibt der Text unverändert.
export function sammelrechnungHint(quoteNumbers?: string[]): string {
  if (!quoteNumbers || quoteNumbers.length < 2) return ''
  return ` — Sammelrechnung über ${quoteNumbers.length} Offerten (${quoteNumbers.join(', ')})`
}

// Hinweise, die den Erfolg NICHT in Frage stellen (heute: ein verrechneter Rapport
// ist als Garantiefall erfasst). Sie kommen als `warnings` aus dem Backend und
// werden an die Erfolgsmeldung gehängt — die Rechnung existiert bereits, der
// Hinweis sagt «nachschauen», nicht «fehlgeschlagen».
export function invoiceWarningHint(warnings?: unknown): string {
  if (!Array.isArray(warnings)) return ''
  const texts = warnings.filter((w): w is string => typeof w === 'string' && !!w.trim())
  return texts.length > 0 ? ` — ${texts.join(' ')}` : ''
}

export default function InvoicesScreen({ onBadgeChange }: { onBadgeChange?: () => void }) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilters, setStatusFilters] = useState<Set<string>>(
    () => new Set(['ausstehend', 'offen', 'gesendet', 'bezahlt', 'inaktiv'])
  )
  const [search, setSearch] = useState('')
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)
  const [projektleiterOptions, setProjektleiterOptions] = useState<ProjektleiterOption[]>([])
  const [acting, setActing] = useState<number | null>(null)
  const isMobile = useIsMobile()
  const [confirmPaid, setConfirmPaid] = useState<Invoice | null>(null)
  // Zahlungsdatum: vorbelegt mit heute, nachtragbar — der Eingang wird oft erst
  // Tage später im Dashboard erfasst (Umsatzmonat + Aftersales-Frist hängen dran).
  const [paidDate, setPaidDate] = useState('')
  // Nach dem Bezahlen: «Projekt abschliessen?» — die Rechnung ist meist der
  // letzte Schritt eines Auftrags, das Schliessen ging bisher nur im Projekt.
  const [confirmCloseProject, setConfirmCloseProject] = useState<Invoice | null>(null)
  const [closingProject, setClosingProject] = useState(false)
  const [confirmUnpay, setConfirmUnpay] = useState<Invoice | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<Invoice | null>(null)
  // Postversand: Rechnung als versendet markieren, ohne sie zu mailen.
  const [confirmPostal, setConfirmPostal] = useState<Invoice | null>(null)
  const [postalDate, setPostalDate] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  // Generate invoice
  const [showGenerate, setShowGenerate] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  // genProject hält die Projekt-id (eindeutig), genProjectName den Anzeigenamen.
  const [genProject, setGenProject] = useState('')
  const [genProjectName, setGenProjectName] = useState('')
  const [genUseQuote, setGenUseQuote] = useState(false)
  const [generating, setGenerating] = useState(false)
  // Arbeitsbeschrieb ("Ausgeführte Arbeiten") — Vorschlag aus den Rapporten, vom
  // Projektleiter editierbar. Rapport-Texte sind Monteur-Sprache ("TB gerissen an
  // Lam."), auf einer Kundenrechnung oft zu knapp.
  const [genWorkDesc, setGenWorkDesc] = useState('')
  const [loadingWorkDesc, setLoadingWorkDesc] = useState(false)
  // Bemerkung auf der Rechnung (z.B. Referenz/Projekt-Nr. des Kunden) — reiner
  // Freitext, leer = kein Block auf dem PDF.
  const [genRemark, setGenRemark] = useState('')
  // Send invoice
  const [sendInvoice, setSendInvoice] = useState<Invoice | null>(null)
  const [sendEmail, setSendEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [hasAcceptedQuote, setHasAcceptedQuote] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setInvoices(await apiFetch('/pwa/admin/invoices') as Invoice[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    apiFetch('/pwa/admin/staff')
      .then(res => {
        const staff = res as { id: string; name: string; projektleiter: boolean }[]
        setProjektleiterOptions(
          staff
            .filter(s => s.projektleiter)
            .map(s => ({ id: s.id, name: s.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      })
      .catch(() => setProjektleiterOptions([]))
  }, [])

  async function openGenerate() {
    try {
      const p = await apiFetch('/pwa/admin/projects') as Project[]
      setProjects(p.filter(x => !x.is_closed))
    } catch { /* ignore */ }
    setGenProject('')
    setGenProjectName('')
    setGenUseQuote(false)
    setHasAcceptedQuote(false)
    setGenWorkDesc('')
    setGenRemark('')
    setShowGenerate(true)
  }

  async function checkQuote(projectId: string, projects: Project[]) {
    const projectName = projects.find(p => p.id === projectId)?.name ?? ''
    setGenProject(projectId)
    setGenProjectName(projectName)
    if (!projectId) { setHasAcceptedQuote(false); setGenWorkDesc(''); return }
    try {
      const quotes = await apiFetch('/pwa/admin/quotes') as { project_id?: string | null; project_name: string; status: string }[]
      // Zuordnung über die id; der Name nur für Alt-Offerten ohne project_id.
      setHasAcceptedQuote(quotes.some(q =>
        q.status === 'akzeptiert' &&
        (q.project_id ? q.project_id === projectId : q.project_name === projectName)))
    } catch {
      setHasAcceptedQuote(false)
    }
    // Vorschlag laden, nicht blockierend: schlaegt er fehl, bleibt das Feld leer und
    // die Rechnung entsteht ohne den Block.
    setLoadingWorkDesc(true)
    try {
      const res = await apiFetch(
        `/pwa/admin/invoices/work-description?project_name=${encodeURIComponent(projectName)}`
        + `&project_id=${encodeURIComponent(projectId)}`,
      ) as { work_description: string }
      setGenWorkDesc(res.work_description || '')
    } catch {
      setGenWorkDesc('')
    } finally {
      setLoadingWorkDesc(false)
    }
  }

  async function handleGenerate() {
    if (!genProject) return
    setGenerating(true)
    try {
      const res = await apiFetch('/pwa/admin/invoices/generate', {
        method: 'POST',
        body: JSON.stringify({
          project_name: genProjectName,
          project_id: genProject,
          use_quote: genUseQuote,
          work_description: genWorkDesc,
          remark: genRemark,
        }),
      }) as {
        invoice_number: string; total_amount: number
        quote_numbers?: string[]; warnings?: unknown
      }
      showToast(
        `Rechnung ${res.invoice_number} erstellt (${fmtCHF(res.total_amount)})`
        + sammelrechnungHint(res.quote_numbers)
        + invoiceWarningHint(res.warnings),
        'success',
      )
      setShowGenerate(false)
      load()
      onBadgeChange?.()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Erstellen', 'error')
    } finally {
      setGenerating(false)
    }
  }

  function openSendInvoice(inv: Invoice) {
    const proj = projects.length > 0
      ? projects.find(p => p.name === inv.project_name)
      : null
    setSendEmail(proj?.customer?.email || '')
    setSendInvoice(inv)
  }

  async function handleSendInvoice() {
    if (!sendInvoice || !sendEmail) return
    setSending(true)
    try {
      await apiFetch('/pwa/admin/invoices/send', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: sendInvoice.id, recipient_email: sendEmail }),
      })
      showToast(`Rechnung an ${sendEmail} gesendet`, 'success')
      setSendInvoice(null)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Versand fehlgeschlagen', 'error')
    } finally {
      setSending(false)
    }
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function openPaid(inv: Invoice) {
    setPaidDate(todayISO())
    setConfirmPaid(inv)
  }

  // Offen = noch nicht abgeschlossen/archiviert. Nur dann lohnt die Rückfrage.
  function projectStillOpen(inv: Invoice): boolean {
    if (!inv.project_id) return false
    if (inv.project_status) return inv.project_status === 'offen'
    return !inv.project_is_closed
  }

  async function handleMarkPaid(inv: Invoice) {
    setActing(inv.id)
    try {
      await apiFetch(`/pwa/admin/invoices/${inv.id}/mark-paid`, {
        method: 'POST',
        body: JSON.stringify({ paid_at: paidDate }),
      })
      showToast('Rechnung als bezahlt markiert', 'success')
      setConfirmPaid(null)
      load()
      onBadgeChange?.()
      // Anschlussfrage statt Automatik: eine Teilrechnung schliesst das Projekt nicht.
      if (projectStillOpen(inv)) setConfirmCloseProject(inv)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleCloseProject(inv: Invoice) {
    if (!inv.project_id) return
    setClosingProject(true)
    try {
      await apiFetch(`/pwa/admin/projects/${inv.project_id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'abgeschlossen' }),
      })
      showToast('Projekt abgeschlossen', 'success')
      setConfirmCloseProject(null)
      load()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Abschliessen', 'error')
    } finally {
      setClosingProject(false)
    }
  }

  async function handleArchive(id: number) {
    setActing(id)
    try {
      await apiFetch(`/pwa/admin/invoices/${id}/archive`, { method: 'POST' })
      showToast('Rechnung archiviert — Rapporte wieder verrechenbar', 'success')
      setConfirmArchive(null)
      load()
      onBadgeChange?.()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler beim Archivieren', 'error')
    } finally {
      setActing(null)
    }
  }

  function openPostal(inv: Invoice) {
    setPostalDate(todayISO())
    setConfirmPostal(inv)
  }

  async function handleMarkSentByPost(id: number) {
    setActing(id)
    try {
      await apiFetch(`/pwa/admin/invoices/${id}/mark-sent`, {
        method: 'POST',
        body: JSON.stringify({ sent_date: postalDate }),
      })
      showToast('Rechnung als per Post versendet markiert', 'success')
      setConfirmPostal(null)
      load()
      onBadgeChange?.()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  async function handleUnmarkPaid(id: number) {
    setActing(id)
    try {
      await apiFetch(`/pwa/admin/invoices/${id}/unmark-paid`, { method: 'POST' })
      showToast('Zahlung zurückgesetzt', 'success')
      setConfirmUnpay(null)
      load()
      onBadgeChange?.()
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Fehler', 'error')
    } finally {
      setActing(null)
    }
  }

  const filtered = invoices.filter(inv => {
    const matchStatus = statusFilters.has(inv.status)
    const matchSearch = inv.project_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase())
    const matchPl = !projektleiterFilter || inv.projektleiter_id === projektleiterFilter
    return matchStatus && matchSearch && matchPl
  })

  const totalOpen = invoices
    .filter(i => i.status === 'ausstehend' || i.status === 'offen' || i.status === 'gesendet')
    .reduce((s, i) => s + i.total_amount, 0)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Rechnungen</div>
          <div className="admin-page-subtitle">{filtered.length} Einträge · Offen: {fmtCHF(totalOpen)}</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={openGenerate}>
          + Rechnung erstellen
        </button>
      </div>

      <div className="admin-table-wrap">
        <div className="admin-filter-bar">
          <input
            className="admin-search"
            placeholder="Projekt oder Rechnungs-Nr. suchen…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <ProjektleiterFilter
            options={projektleiterOptions}
            value={projektleiterFilter}
            onChange={setProjektleiterFilter}
          />
          <StatusFilterPopover
            allStatuses={ALL_STATUSES}
            statusLabels={STATUS_LABELS}
            selected={statusFilters}
            onChange={setStatusFilters}
          />
        </div>

        {loading ? (
          <div className="admin-loading"><div className="admin-spinner" /> Laden…</div>
        ) : isMobile ? (
          <AdminCardList
            items={filtered}
            keyFor={inv => String(inv.id)}
            empty="Keine Rechnungen gefunden."
            renderCard={inv => (
              <>
                <div className="admin-card-head">
                  <span className="admin-card-title" style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>{inv.invoice_number}</span>
                  <span className={`admin-badge ${STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>
                    {STATUS_LABELS[inv.status] || inv.status}
                  </span>
                </div>
                <div className="admin-card-meta"><strong>{inv.project_name}</strong></div>
                <div className="admin-card-meta">
                  {fmtCHF(inv.total_amount)} · erstellt {fmtDate(inv.created_at)}{inv.paid_at ? ` · bezahlt ${fmtDate(inv.paid_at)}` : ''}
                </div>
                <div className="admin-card-actions">
                  {(inv.storage_path || inv.pdf_url) && (
                    <a
                      href={apiUrl(`/pwa/admin/invoices/${inv.id}/pdf`)}
                      target="_blank"
                      rel="noreferrer"
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                    >
                      PDF
                    </a>
                  )}
                  {(inv.status === 'ausstehend' || inv.status === 'offen') && (
                    <>
                      <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={() => openSendInvoice(inv)} disabled={acting === inv.id}>
                        Senden
                      </button>
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => openPostal(inv)} disabled={acting === inv.id}>
                        Per Post versendet
                      </button>
                    </>
                  )}
                  {(inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                    <>
                      <button className="admin-btn admin-btn-success admin-btn-sm" onClick={() => openPaid(inv)} disabled={acting === inv.id}>
                        Als bezahlt markieren
                      </button>
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setConfirmArchive(inv)} disabled={acting === inv.id}>
                        Archivieren
                      </button>
                    </>
                  )}
                  {inv.status === 'bezahlt' && (
                    <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={() => setConfirmUnpay(inv)} disabled={acting === inv.id}>
                      Zahlung zurücksetzen
                    </button>
                  )}
                </div>
              </>
            )}
          />
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Projekt</th>
                <th>Betrag</th>
                <th>Status</th>
                <th>Erstellt</th>
                <th>Bezahlt am</th>
                <th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="admin-table-empty">Keine Rechnungen gefunden.</td></tr>
              ) : filtered.map(inv => (
                <tr key={inv.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{inv.invoice_number}</td>
                  <td><strong>{inv.project_name}</strong></td>
                  <td style={{ fontWeight: 700 }}>{fmtCHF(inv.total_amount)}</td>
                  <td>
                    <span className={`admin-badge ${STATUS_BADGE[inv.status] || 'admin-badge-draft'}`}>
                      {STATUS_LABELS[inv.status] || inv.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(inv.created_at)}</td>
                  <td style={{ color: 'var(--muted)' }}>{fmtDate(inv.paid_at)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(inv.storage_path || inv.pdf_url) && (
                        <a
                          href={apiUrl(`/pwa/admin/invoices/${inv.id}/pdf`)}
                          target="_blank"
                          rel="noreferrer"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                        >
                          PDF
                        </a>
                      )}
                      {(inv.status === 'ausstehend' || inv.status === 'offen') && (
                        <>
                          <button
                            className="admin-btn admin-btn-primary admin-btn-sm"
                            onClick={() => openSendInvoice(inv)}
                            disabled={acting === inv.id}
                          >
                            Senden
                          </button>
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => openPostal(inv)}
                            disabled={acting === inv.id}
                          >
                            Per Post versendet
                          </button>
                        </>
                      )}
                      {(inv.status === 'ausstehend' || inv.status === 'offen' || inv.status === 'gesendet') && (
                        <>
                          <button
                            className="admin-btn admin-btn-success admin-btn-sm"
                            onClick={() => openPaid(inv)}
                            disabled={acting === inv.id}
                          >
                            Als bezahlt markieren
                          </button>
                          <button
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => setConfirmArchive(inv)}
                            disabled={acting === inv.id}
                          >
                            Archivieren
                          </button>
                        </>
                      )}
                      {inv.status === 'bezahlt' && (
                        <button
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => setConfirmUnpay(inv)}
                          disabled={acting === inv.id}
                        >
                          Zahlung zurücksetzen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bestätigungsdialog bezahlt markieren */}
      {confirmPaid && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Rechnung als bezahlt markieren?</div>
            <div className="admin-confirm-text">
              {confirmPaid.invoice_number} · {fmtCHF(confirmPaid.total_amount)}<br />
              Projekt: {confirmPaid.project_name}
            </div>
            <div style={{ margin: '12px 0' }}>
              <label className="admin-form-label" htmlFor="invoice-paid-date">Zahlungsdatum</label>
              <input
                id="invoice-paid-date"
                className="admin-form-input"
                type="date"
                value={paidDate}
                max={todayISO()}
                onChange={e => setPaidDate(e.target.value)}
              />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                Tag des Zahlungseingangs — nachtragbar, vorbelegt mit heute.
              </div>
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmPaid(null)}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-success"
                onClick={() => handleMarkPaid(confirmPaid)}
                disabled={acting === confirmPaid.id || !paidDate}
              >
                {acting === confirmPaid.id ? '…' : 'Ja, bezahlt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anschlussfrage nach dem Bezahlen: Projekt abschliessen? */}
      {confirmCloseProject && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Projekt abschliessen?</div>
            <div className="admin-confirm-text">
              Rechnung {confirmCloseProject.invoice_number} ist bezahlt.<br />
              «{confirmCloseProject.project_name}» wird beim Abschliessen für Mitarbeiter
              ausgeblendet. Rapporte und Dokumente bleiben erhalten.
            </div>
            <div className="admin-confirm-actions">
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => setConfirmCloseProject(null)}
                disabled={closingProject}
              >
                Offen lassen
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => handleCloseProject(confirmCloseProject)}
                disabled={closingProject}
              >
                {closingProject ? 'Schliessen…' : 'Ja, abschliessen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bestätigungsdialog Postversand */}
      {confirmPostal && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Als per Post versendet markieren?</div>
            <div className="admin-confirm-text">
              {confirmPostal.invoice_number} · {fmtCHF(confirmPostal.total_amount)}<br />
              Projekt: {confirmPostal.project_name}<br />
              Es wird keine E-Mail verschickt. Die Rechnung gilt danach als gesendet und
              läuft normal ins Mahnwesen — die Zahlungsfrist zählt ab dem Aufgabedatum.
            </div>
            <div style={{ margin: '12px 0' }}>
              <label className="admin-form-label" htmlFor="postal-sent-date">Aufgabedatum</label>
              <input
                id="postal-sent-date"
                className="admin-form-input"
                type="date"
                value={postalDate}
                max={todayISO()}
                onChange={e => setPostalDate(e.target.value)}
              />
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmPostal(null)}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={() => handleMarkSentByPost(confirmPostal.id)}
                disabled={acting === confirmPostal.id || !postalDate}
              >
                {acting === confirmPostal.id ? '…' : 'Als versendet markieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bestätigungsdialog Zahlung zurücksetzen */}
      {confirmUnpay && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Zahlung zurücksetzen?</div>
            <div className="admin-confirm-text">
              {confirmUnpay.invoice_number} · {fmtCHF(confirmUnpay.total_amount)}<br />
              Projekt: {confirmUnpay.project_name}<br />
              Die Rechnung gilt danach wieder als offen (gesendet bzw. ausstehend)
              und kann anschliessend archiviert werden.
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmUnpay(null)}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-danger"
                onClick={() => handleUnmarkPaid(confirmUnpay.id)}
                disabled={acting === confirmUnpay.id}
              >
                {acting === confirmUnpay.id ? '…' : 'Zahlung zurücksetzen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bestätigungsdialog Rechnung archivieren */}
      {confirmArchive && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box">
            <div className="admin-confirm-title">Rechnung archivieren?</div>
            <div className="admin-confirm-text">
              {confirmArchive.invoice_number} · {fmtCHF(confirmArchive.total_amount)}<br />
              Projekt: {confirmArchive.project_name}<br />
              Die Rechnung gilt danach als annulliert. Ihre Rapporte werden von der
              Rechnung gelöst — sie sind wieder verrechenbar und können bei Bedarf
              gelöscht oder korrigiert werden, bevor eine neue Rechnung erstellt wird.
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setConfirmArchive(null)}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-danger"
                onClick={() => handleArchive(confirmArchive.id)}
                disabled={acting === confirmArchive.id}
              >
                {acting === confirmArchive.id ? '…' : 'Archivieren'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Rechnung erstellen */}
      {showGenerate && (
        <div className="admin-confirm-overlay">
          {/* maxHeight/overflow: Arbeitsbeschrieb und Bemerkung wachsen mit dem Text —
              ohne das schöben sie auf kleinen Bildschirmen die Knöpfe aus dem Bild. */}
          <div className="admin-confirm-box" style={{ maxWidth: 440, maxHeight: '90vh', overflow: 'auto' }}>
            <div className="admin-confirm-title">Rechnung erstellen</div>
            <div style={{ marginBottom: 12 }}>
              <label className="admin-form-label">Projekt</label>
              <select className="admin-form-select" value={genProject} onChange={e => checkQuote(e.target.value, projects)}>
                <option value="">-- Projekt wählen --</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.project_id_text ? `${p.name} (${p.project_id_text})` : p.name}
                  </option>
                ))}
              </select>
            </div>
            {hasAcceptedQuote && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={genUseQuote} onChange={e => setGenUseQuote(e.target.checked)} />
                  Offerten-Positionen verwenden (statt Ist-Daten)
                </label>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, paddingLeft: 24 }}>
                  Aktivieren, wenn noch kein unterschriebener Arbeitsrapport vorliegt — die Rechnung wird dann aus der Offerte erstellt.
                </div>
              </div>
            )}
            {genProject && (
              <div style={{ marginBottom: 12 }}>
                <label className="admin-form-label" htmlFor="gen-work-desc">
                  Ausgeführte Arbeiten
                </label>
                <AutoGrowTextarea
                  id="gen-work-desc"
                  className="admin-form-input"
                  minRows={5}
                  maxLength={4000}
                  value={genWorkDesc}
                  placeholder={loadingWorkDesc ? 'Wird geladen…' : 'Erscheint auf der Rechnung über den Positionen. Leer lassen, um den Block wegzulassen.'}
                  onChange={e => setGenWorkDesc(e.target.value)}
                  disabled={loadingWorkDesc || generating}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Vorschlag aus den Rapporten dieses Projekts — vor dem Erstellen anpassen,
                  der Text steht so auf der Rechnung.
                </div>
              </div>
            )}
            {genProject && (
              <div style={{ marginBottom: 12 }}>
                <label className="admin-form-label" htmlFor="gen-remark">
                  Bemerkung
                </label>
                <AutoGrowTextarea
                  id="gen-remark"
                  className="admin-form-input"
                  minRows={2}
                  maxLength={1000}
                  value={genRemark}
                  placeholder="z.B. Referenz oder Projekt-Nr. des Kunden. Leer lassen, um den Block wegzulassen."
                  onChange={e => setGenRemark(e.target.value)}
                  disabled={generating}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Erscheint als eigener Block «Bemerkung» auf der Rechnung, über den Positionen.
                </div>
              </div>
            )}
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setShowGenerate(false)} disabled={generating}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={handleGenerate} disabled={!genProject || generating}>
                {generating ? 'Wird erstellt…' : 'Rechnung erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Rechnung senden */}
      {sendInvoice && (
        <div className="admin-confirm-overlay">
          <div className="admin-confirm-box" style={{ maxWidth: 440 }}>
            <div className="admin-confirm-title">Rechnung senden</div>
            <div className="admin-confirm-text" style={{ marginBottom: 12 }}>
              {sendInvoice.invoice_number} · {fmtCHF(sendInvoice.total_amount)}<br />
              Projekt: {sendInvoice.project_name}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label className="admin-form-label">Empfänger E-Mail</label>
              <input
                className="admin-form-input"
                type="email"
                value={sendEmail}
                onChange={e => setSendEmail(e.target.value)}
                placeholder="kunde@example.com"
              />
            </div>
            <div className="admin-confirm-actions">
              <button className="admin-btn admin-btn-secondary" onClick={() => setSendInvoice(null)} disabled={sending}>Abbrechen</button>
              <button className="admin-btn admin-btn-primary" onClick={handleSendInvoice} disabled={!sendEmail || sending}>
                {sending ? 'Wird gesendet…' : 'Rechnung senden'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
