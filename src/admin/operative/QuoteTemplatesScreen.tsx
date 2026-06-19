import { useEffect, useState } from 'react'
import { apiFetch } from '../../api/client'
import { getMe } from '../../api/auth'
import { isFeatureEnabled } from '../../api/modules'

// Vorlagen für die Offerten-Sektionen "Montagepositionen" und "Sonderpositionen".
// Spiegelt die Schnell-Buttons im Offerte-Formular — hier zentral pflegbar, ohne Migration.

interface InstallationTpl {
  id: string
  label: string
  default_fee: number
  sort_order: number
  notes: string | null
}

type SpecialMode = 'pauschal' | 'stunden'

interface SpecialTpl {
  id: string
  label: string
  pricing_mode: SpecialMode
  default_fee: number
  default_hours: number | null
  sort_order: number
  notes: string | null
}

type Kind = 'installation' | 'special'

interface EditState {
  kind: Kind
  // 'new' = anlegen, sonst die zu bearbeitende ID
  id: string | 'new'
}

interface FormState {
  label: string
  default_fee: string
  pricing_mode: SpecialMode
  default_hours: string
  notes: string
}

const EMPTY_FORM: FormState = { label: '', default_fee: '', pricing_mode: 'pauschal', default_hours: '', notes: '' }

export default function QuoteTemplatesScreen() {
  const [installation, setInstallation] = useState<InstallationTpl[]>([])
  const [special, setSpecial] = useState<SpecialTpl[]>([])
  const [specialFeatureOn, setSpecialFeatureOn] = useState(true)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch('/pwa/admin/quote-position-templates') as { installation: InstallationTpl[]; special: SpecialTpl[] }
      setInstallation(data.installation ?? [])
      setSpecial(data.special ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    getMe().then(me => setSpecialFeatureOn(isFeatureEnabled(me, 'sonderpositionen'))).catch(() => {})
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function openNew(kind: Kind) {
    setForm(EMPTY_FORM)
    setEditing({ kind, id: 'new' })
    setError('')
  }

  function openEditInstallation(t: InstallationTpl) {
    setForm({ ...EMPTY_FORM, label: t.label, default_fee: String(t.default_fee), notes: t.notes ?? '' })
    setEditing({ kind: 'installation', id: t.id })
    setError('')
  }

  function openEditSpecial(t: SpecialTpl) {
    setForm({
      label: t.label,
      default_fee: String(t.default_fee),
      pricing_mode: t.pricing_mode,
      default_hours: t.default_hours != null ? String(t.default_hours) : '',
      notes: t.notes ?? '',
    })
    setEditing({ kind: 'special', id: t.id })
    setError('')
  }

  function basePath(kind: Kind) {
    return kind === 'installation' ? '/pwa/admin/installation-templates' : '/pwa/admin/special-position-templates'
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    const fee = parseFloat(form.default_fee.replace(',', '.'))
    if (!form.label.trim() || isNaN(fee) || fee < 0) return
    if (editing.kind === 'special' && form.pricing_mode === 'stunden') {
      const h = parseFloat(form.default_hours.replace(',', '.'))
      if (isNaN(h) || h <= 0) { setError('Bitte gültige Stundenzahl angeben'); return }
    }
    setSaving(true)
    setError('')
    try {
      const isEdit = editing.id !== 'new'
      const url = isEdit ? `${basePath(editing.kind)}/${editing.id}` : basePath(editing.kind)
      const body: Record<string, unknown> = {
        label: form.label.trim(),
        default_fee: fee,
        notes: form.notes.trim() || null,
      }
      if (editing.kind === 'special') {
        body.pricing_mode = form.pricing_mode
        body.default_hours = form.pricing_mode === 'stunden' ? parseFloat(form.default_hours.replace(',', '.')) : null
      }
      await apiFetch(url, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(body) })
      setEditing(null)
      showToast('Vorlage gespeichert')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editing || editing.id === 'new') return
    if (!window.confirm(`Vorlage "${form.label}" wirklich löschen?`)) return
    setSaving(true)
    setError('')
    try {
      await apiFetch(`${basePath(editing.kind)}/${editing.id}`, { method: 'DELETE' })
      setEditing(null)
      showToast('Vorlage gelöscht')
      load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSaving(false)
    }
  }

  const isSpecialModal = editing?.kind === 'special'

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Offert-Vorlagen</div>
          <div className="admin-page-subtitle">Schnell-Buttons für Montage- und Sonderpositionen im Offerte-Formular</div>
        </div>
      </div>

      {loading ? (
        <div className="admin-table-wrap"><div className="admin-loading"><div className="admin-spinner" /> Laden…</div></div>
      ) : (
        <>
          {/* ── Montagepositionen ── */}
          <div className="admin-page-header" style={{ marginTop: 8 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Montagepositionen</div>
              <div className="admin-page-subtitle">Pauschalbeträge für Montageleistungen</div>
            </div>
            <button className="admin-btn admin-btn-primary" onClick={() => openNew('installation')}>+ Neue Montage-Vorlage</button>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Bezeichnung</th><th>Betrag</th><th>Notiz</th><th></th></tr>
              </thead>
              <tbody>
                {installation.length === 0 ? (
                  <tr><td colSpan={4} className="admin-table-empty">Keine Montage-Vorlagen definiert.</td></tr>
                ) : installation.map(t => (
                  <tr key={t.id} onClick={() => openEditInstallation(t)} style={{ cursor: 'pointer' }}>
                    <td><strong>{t.label}</strong></td>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>CHF {t.default_fee.toFixed(2)}</td>
                    <td style={{ color: 'var(--muted)' }}>{t.notes || '—'}</td>
                    <td>
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={e => { e.stopPropagation(); openEditInstallation(t) }}>Bearbeiten</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Sonderpositionen ── */}
          <div className="admin-page-header" style={{ marginTop: 24 }}>
            <div>
              <div className="admin-page-title" style={{ fontSize: 18 }}>Sonderpositionen (Demontage / Entsorgung)</div>
              <div className="admin-page-subtitle">Pauschale oder Stundenansatz — getrennt von Montage/Material ausgewiesen</div>
            </div>
            <button className="admin-btn admin-btn-primary" onClick={() => openNew('special')}>+ Neue Sonderposition</button>
          </div>
          {!specialFeatureOn && (
            <div className="admin-form-hint" style={{ margin: '0 0 12px' }}>
              Hinweis: Das Feature „Sonderpositionen" ist für diesen Mandanten aktuell deaktiviert — diese Vorlagen
              erscheinen erst im Offerte-Formular, wenn du es unter Konfiguration aktivierst. Du kannst sie hier
              trotzdem schon vorbereiten.
            </div>
          )}
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr><th>Bezeichnung</th><th>Modus</th><th>Betrag</th><th>Notiz</th><th></th></tr>
              </thead>
              <tbody>
                {special.length === 0 ? (
                  <tr><td colSpan={5} className="admin-table-empty">Keine Sonderpositionen definiert.</td></tr>
                ) : special.map(t => (
                  <tr key={t.id} onClick={() => openEditSpecial(t)} style={{ cursor: 'pointer' }}>
                    <td><strong>{t.label}</strong></td>
                    <td style={{ color: 'var(--muted)' }}>{t.pricing_mode === 'stunden' ? 'Stundenansatz' : 'Pauschale'}</td>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>
                      {t.pricing_mode === 'stunden'
                        ? `CHF ${t.default_fee.toFixed(2)}/h${t.default_hours != null ? ` × ${t.default_hours}` : ''}`
                        : `CHF ${t.default_fee.toFixed(2)}`}
                    </td>
                    <td style={{ color: 'var(--muted)' }}>{t.notes || '—'}</td>
                    <td>
                      <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={e => { e.stopPropagation(); openEditSpecial(t) }}>Bearbeiten</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit/New Modal */}
      {editing !== null && (
        <div className="admin-modal-overlay" onClick={() => setEditing(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-title">
                {editing.id === 'new'
                  ? (isSpecialModal ? 'Neue Sonderposition' : 'Neue Montage-Vorlage')
                  : 'Vorlage bearbeiten'}
              </div>
              <button className="admin-modal-close" onClick={() => setEditing(null)}>×</button>
            </div>
            <form onSubmit={handleSave} className="admin-modal-body">
              {error && <div className="admin-form-error">{error}</div>}
              <div className="admin-form-group">
                <label className="admin-form-label">Bezeichnung *</label>
                <input
                  className="admin-form-input"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder={isSpecialModal ? 'z.B. Demontage Komplettanlage' : 'z.B. Montage Standard'}
                  required
                  autoFocus
                />
              </div>

              {isSpecialModal && (
                <div className="admin-form-group">
                  <label className="admin-form-label">Preismodell</label>
                  <select
                    className="admin-form-input"
                    value={form.pricing_mode}
                    onChange={e => setForm(f => ({ ...f, pricing_mode: e.target.value as SpecialMode }))}
                  >
                    <option value="pauschal">Pauschale (Fixbetrag)</option>
                    <option value="stunden">Stundenansatz (CHF/h)</option>
                  </select>
                </div>
              )}

              <div className="admin-form-group">
                <label className="admin-form-label">
                  {isSpecialModal && form.pricing_mode === 'stunden' ? 'Stundenansatz CHF/h *' : 'Betrag CHF *'}
                </label>
                <input
                  className="admin-form-input"
                  type="number"
                  step="0.05"
                  min="0"
                  value={form.default_fee}
                  onChange={e => setForm(f => ({ ...f, default_fee: e.target.value }))}
                  required
                  placeholder="z.B. 150"
                />
              </div>

              {isSpecialModal && form.pricing_mode === 'stunden' && (
                <div className="admin-form-group">
                  <label className="admin-form-label">Vorgeschlagene Stunden *</label>
                  <input
                    className="admin-form-input"
                    type="number"
                    step="0.5"
                    min="0"
                    value={form.default_hours}
                    onChange={e => setForm(f => ({ ...f, default_hours: e.target.value }))}
                    required
                    placeholder="z.B. 2"
                  />
                </div>
              )}

              <div className="admin-form-group">
                <label className="admin-form-label">Notiz (optional)</label>
                <input
                  className="admin-form-input"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Interne Notiz / Hinweis"
                />
              </div>
            </form>
            <div className="admin-modal-footer">
              {editing.id !== 'new' && (
                <button className="admin-btn admin-btn-danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>
                  Löschen
                </button>
              )}
              <button className="admin-btn admin-btn-secondary" onClick={() => setEditing(null)}>Abbrechen</button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={e => { (e.currentTarget.closest('div.admin-modal')?.querySelector('form') as HTMLFormElement)?.requestSubmit() }}
                disabled={saving}
              >
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="admin-toast-container">
          <div className="admin-toast success">{toast}</div>
        </div>
      )}
    </div>
  )
}
