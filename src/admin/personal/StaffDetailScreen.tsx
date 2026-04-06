import { useState, useEffect } from 'react'
import { StaffMember, StaffRole, upsertStaff, generateStaffPin, getStaffRoles } from '../../api/admin'

interface Props {
  member: StaffMember | null
  onClose: () => void
  onSaved: () => void
}

export default function StaffDetailScreen({ member, onClose, onSaved }: Props) {
  const isNew = !member
  const [name, setName] = useState(member?.name ?? '')
  const [kuerzel, setKuerzel] = useState(member?.kuerzel ?? '')
  const [funktion, setFunktion] = useState(member?.funktion ?? '')
  const [hourlyRate, setHourlyRate] = useState(member?.hourly_rate?.toString() ?? '')
  const [monthlySalary, setMonthlySalary] = useState(member?.monthly_salary?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pin, setPin] = useState<string | null>(null)
  const [pinExpiry, setPinExpiry] = useState('')
  const [generatingPin, setGeneratingPin] = useState(false)
  const [pinError, setPinError] = useState('')
  const [roles, setRoles] = useState<StaffRole[]>([])

  useEffect(() => {
    getStaffRoles().then(setRoles).catch(() => {})
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError('')
    setSaving(true)
    try {
      await upsertStaff({
        id: member?.id,
        name: name.trim(),
        kuerzel: kuerzel || undefined,
        funktion: funktion || undefined,
        hourly_rate: hourlyRate ? parseFloat(hourlyRate) : undefined,
        monthly_salary: monthlySalary ? parseFloat(monthlySalary) : undefined,
      })
      onSaved()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  async function handleGeneratePin() {
    if (!member?.id) return
    setPin(null)
    setPinError('')
    setGeneratingPin(true)
    try {
      const res = await generateStaffPin(member.id)
      setPin(res.pin)
      setPinExpiry(res.expires_at)
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : 'PIN-Generierung fehlgeschlagen')
    } finally {
      setGeneratingPin(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{isNew ? 'Neuer Mitarbeiter' : member.name}</div>
          <div className="admin-page-subtitle">{isNew ? 'Mitarbeiter anlegen' : 'Mitarbeiter bearbeiten'}</div>
        </div>
        <button className="admin-btn admin-btn-secondary" onClick={onClose}>← Zurück</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
        {/* Formular */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="admin-table-wrap" style={{ padding: 24 }}>
            <div className="admin-section-title">Stammdaten</div>
            {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="admin-form-group">
                <label className="admin-form-label">Name *</label>
                <input className="admin-form-input" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Kürzel</label>
                  <input className="admin-form-input" value={kuerzel} onChange={e => setKuerzel(e.target.value)} placeholder="z.B. MA" maxLength={5} />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Funktion</label>
                  <select className="admin-form-input" value={funktion} onChange={e => setFunktion(e.target.value)}>
                    <option value="">— Bitte wählen —</option>
                    {roles.map(r => (
                      <option key={r.name} value={r.name}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="admin-form-group">
                  <label className="admin-form-label">Stundenlohn (CHF)</label>
                  <input className="admin-form-input" inputMode="decimal" value={hourlyRate} onChange={e => setHourlyRate(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="35.00" />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label">Monatslohn (CHF)</label>
                  <input className="admin-form-input" inputMode="decimal" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="5500.00" />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="admin-btn admin-btn-secondary" onClick={onClose}>Abbrechen</button>
              <button type="submit" className="admin-btn admin-btn-primary" disabled={saving || !name.trim()}>
                {saving ? 'Speichern…' : 'Speichern'}
              </button>
            </div>
          </div>
        </form>

        {/* Seiteninfo & PIN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {!isNew && member?.email && (
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title">Benutzerkonto</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>E-Mail</div>
                <div style={{ fontSize: 13.5 }}>{member.email}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Rolle</div>
                <div>
                  <span className={`admin-badge ${member.role === 'admin' ? 'admin-badge-admin' : 'admin-badge-active'}`}>
                    {member.role || 'worker'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {!isNew && (
            <div className="admin-table-wrap" style={{ padding: 20 }}>
              <div className="admin-section-title">PWA-Zugang</div>
              <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 8, marginBottom: 14 }}>
                Generiere einen Einmal-PIN für den Mitarbeiter, um die PWA-Registrierung zu starten.
              </p>
              {pinError && <div className="admin-form-error" style={{ marginBottom: 10 }}>{pinError}</div>}
              {pin ? (
                <div style={{ background: '#0f1117', borderRadius: 9, padding: '14px 16px', textAlign: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Einmal-PIN</div>
                  <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '0.15em', color: 'var(--accent-blue, #3b82f6)' }}>{pin}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    Ablauf: {pinExpiry ? new Date(pinExpiry).toLocaleString('de-CH') : '—'}
                  </div>
                </div>
              ) : null}
              <button
                className="admin-btn admin-btn-secondary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleGeneratePin}
                disabled={generatingPin || !member?.authorized_user_id}
              >
                {generatingPin ? 'Generiere…' : pin ? 'Neuen PIN generieren' : 'PIN generieren'}
              </button>
              {!member?.authorized_user_id && (
                <div className="admin-form-hint" style={{ marginTop: 8 }}>
                  Kein Benutzerkonto verknüpft — erst Benutzer in «Benutzerverwaltung» anlegen.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
