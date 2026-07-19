import { useEffect, useMemo, useRef, useState } from 'react'
import { apiBlobFetch, apiFetch } from '../../api/client'
import { upsertProject, updateProjectSchedule, getSchedulingConfig, SchedulingConfig } from '../../api/admin'
import { AdminScreen } from '../useAdminNav'
import { Project, ProjectKind, PROJECT_KIND_LABELS, projectCustomerName } from './ProjectsScreen'
import ProjectScheduleCalendar from './ProjectScheduleCalendar'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { shiftISO, hhmmToMin, minToHHMM } from '../utils/calendarHelpers'

interface StaffLite {
  id: string
  name: string
  projektleiter: boolean
}

interface CustomerLite {
  id: string
  name: string | null
  billing_name: string | null
}

interface FormState {
  id: string
  name: string
  kind: ProjectKind
  customerId: string
  projektleiterId: string
  monteurIds: string[]
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  bemerkung: string
  // Beim Aufziehen eines neuen Termins gesetzt: mind. ein Monteur ist Pflicht.
  requireMonteur?: boolean
}

// Ein per Drag im Kalender aufgezogener, noch nicht zugeordneter Termin. Wird
// beim Wählen eines Projekts oder Anlegen eines internen Einsatzes übernommen.
interface PendingSlot {
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  monteurIds: string[]
}

function projectToForm(p: Project): FormState {
  return {
    id: p.id,
    name: p.name,
    kind: (p.kind || 'project') as ProjectKind,
    customerId: p.customer_id ?? '',
    projektleiterId: p.projektleiter_id ?? '',
    monteurIds: p.monteur_ids ?? [],
    startDate: p.start_date?.slice(0, 10) ?? '',
    endDate: p.end_date?.slice(0, 10) ?? '',
    startTime: p.start_time?.slice(0, 5) ?? '',
    endTime: p.end_time?.slice(0, 5) ?? '',
    bemerkung: p.bemerkung ?? '',
  }
}

// 'YYYY-MM-DD' → z.B. "Di, 30.06." für die Termin-Vorschau im Panel.
function fmtSlotDate(iso: string): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  })
}

function emptyInternalForm(kind: ProjectKind): FormState {
  return {
    id: '',
    name: PROJECT_KIND_LABELS[kind],
    kind,
    customerId: '',
    projektleiterId: '',
    monteurIds: [],
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    bemerkung: '',
  }
}

interface Props {
  canton?: string
  onNav?: (screen: AdminScreen, detailId?: string) => void
}

export default function ProjectScheduleScreen({ canton = 'ZH', onNav }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [customers, setCustomers] = useState<CustomerLite[]>([])
  const [schedulingConfig, setSchedulingConfig] = useState<SchedulingConfig | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [pendingSlot, setPendingSlot] = useState<PendingSlot | null>(null)
  const [visibleWeekIso, setVisibleWeekIso] = useState<string>('')
  const [visibleStaffIds, setVisibleStaffIds] = useState<string[] | null>(null)
  const [exporting, setExporting] = useState(false)
  const [projektleiterFilter, setProjektleiterFilter] = useState<string | null>(null)

  // Picker-State
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerWrapRef = useRef<HTMLDivElement>(null)

  async function loadAll() {
    setLoading(true)
    try {
      const [proj, st, cust, sched] = await Promise.all([
        apiFetch('/pwa/admin/projects') as Promise<Project[]>,
        apiFetch('/pwa/admin/staff') as Promise<StaffLite[]>,
        apiFetch('/pwa/admin/customers') as Promise<CustomerLite[]>,
        // Anzeige-Config ist optional — Fehler darf den Kalender nicht blockieren.
        getSchedulingConfig().catch(() => null),
      ])
      setProjects(proj.filter(p => !p.is_closed && p.status !== 'abgeschlossen'))
      setStaff(st)
      setCustomers(cust)
      if (sched) {
        setSchedulingConfig({
          fields: { ...sched.defaults.fields, ...(sched.config.fields || {}) },
          colors: { ...sched.defaults.colors, ...(sched.config.colors || {}) },
          grey_after: sched.config.grey_after ?? sched.defaults.grey_after ?? '',
        })
      }
    } catch {
      showToast('Daten konnten nicht geladen werden.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Click-outside für Picker-Dropdown
  useEffect(() => {
    if (!pickerOpen) return
    function onDocClick(e: MouseEvent) {
      if (!pickerWrapRef.current?.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pickerOpen])

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  function selectProject(p: Project) {
    const base = projectToForm(p)
    // Aus einem aufgezogenen Termin: Zeiten überschreiben und den (in der
    // Mitarbeiteransicht) vorausgewählten Monteur ergänzen; Monteur wird Pflicht.
    if (pendingSlot) {
      setForm({
        ...base,
        startDate: pendingSlot.startDate,
        endDate: pendingSlot.endDate,
        startTime: pendingSlot.startTime,
        endTime: pendingSlot.endTime,
        monteurIds: Array.from(new Set([...base.monteurIds, ...pendingSlot.monteurIds])),
        requireMonteur: true,
      })
      setPendingSlot(null)
    } else {
      setForm(base)
    }
    setError(null)
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
  }

  function clearSelection() {
    setForm(null)
    setError(null)
  }

  function closePanel() {
    setPanelOpen(false)
    setForm(null)
    setPendingSlot(null)
    setError(null)
    setPickerOpen(false)
  }

  // Neuer Termin per Aufziehen im Wochenkalender: Panel im Auswahlmodus öffnen
  // (Projekt-Picker + interner Einsatz), Zeiten gemerkt, Monteur ggf. vorbelegt.
  function handleCreateSlot(dateISO: string, startTime: string, endTime: string, monteurId: string | null) {
    setForm(null)
    setPendingSlot({
      startDate: dateISO,
      endDate: dateISO,
      startTime,
      endTime,
      monteurIds: monteurId ? [monteurId] : [],
    })
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
    setError(null)
  }

  function handleCreateNew() {
    if (onNav) onNav('projects', 'new')
  }

  // Drag-Verschiebung aus dem Kalender. deltaDays = Tagesversatz; startTime
  // steuert die Uhrzeit: undefined = beibehalten (Monat), 'HH:MM' = neue
  // Startzeit (Dauer wird mitgezogen), null = Uhrzeit löschen (→ ganztägig).
  async function handleReschedule(id: string, deltaDays: number, startTime?: string | null) {
    const proj = projects.find(p => p.id === id)
    if (!proj || !proj.start_date || !proj.end_date) return

    const newStartDate = shiftISO(proj.start_date, deltaDays)
    const newEndDate = shiftISO(proj.end_date, deltaDays)

    let newStartTime = proj.start_time ? proj.start_time.slice(0, 5) : null
    let newEndTime = proj.end_time ? proj.end_time.slice(0, 5) : null
    if (startTime === null) {
      newStartTime = null
      newEndTime = null
    } else if (startTime !== undefined) {
      const durMin = newStartTime && newEndTime ? hhmmToMin(newEndTime) - hhmmToMin(newStartTime) : null
      newStartTime = startTime
      newEndTime = durMin && durMin > 0 ? minToHHMM(hhmmToMin(startTime) + durMin) : null
    }

    // Nichts geändert → keinen Schreibzugriff/Audit-Eintrag auslösen.
    if (
      newStartDate === proj.start_date.slice(0, 10) &&
      newEndDate === proj.end_date.slice(0, 10) &&
      newStartTime === (proj.start_time?.slice(0, 5) ?? null) &&
      newEndTime === (proj.end_time?.slice(0, 5) ?? null)
    ) return

    const optimistic: Project = {
      ...proj,
      start_date: newStartDate, end_date: newEndDate,
      start_time: newStartTime, end_time: newEndTime,
    }
    setProjects(prev => prev.map(p => p.id === id ? optimistic : p))
    if (form?.id === id) {
      setForm(f => f && ({
        ...f,
        startDate: newStartDate, endDate: newEndDate,
        startTime: newStartTime ?? '', endTime: newEndTime ?? '',
      }))
    }
    try {
      await updateProjectSchedule(id, newStartDate, newEndDate, newStartTime, newEndTime)
    } catch {
      setProjects(prev => prev.map(p => p.id === id ? proj : p))
      if (form?.id === id) {
        setForm(f => f && ({
          ...f,
          startDate: proj.start_date!.slice(0, 10), endDate: proj.end_date!.slice(0, 10),
          startTime: proj.start_time?.slice(0, 5) ?? '', endTime: proj.end_time?.slice(0, 5) ?? '',
        }))
      }
      showToast('Verschieben fehlgeschlagen.', 'error')
    }
  }

  async function handleSave() {
    if (!form) return
    setError(null)
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setError('Enddatum muss nach Startdatum liegen.'); return
    }
    if (form.startTime && form.endTime && form.startDate === form.endDate && form.endTime < form.startTime) {
      setError('Endzeit muss nach Startzeit liegen.'); return
    }
    if (!form.name.trim()) {
      setError('Titel ist erforderlich.'); return
    }
    if (form.requireMonteur && form.monteurIds.length === 0) {
      setError('Mindestens ein Mitarbeiter ist erforderlich.'); return
    }
    setSaving(true)
    const isInternal = form.kind !== 'project'
    try {
      // upsertProject erwartet Partial<Project> (api/admin.ts), aber die
      // FastAPI-Route akzeptiert mehr Felder (UpsertProjectRequest).
      // Cast ist nötig, weil das api/admin-Interface bewusst schlank ist.
      const saved = await upsertProject({
        id: form.id || undefined,
        name: form.name,
        customer_id: isInternal ? null : (form.customerId || null),
        start_date: form.startDate || null,
        end_date: form.endDate || null,
        start_time: form.startTime || null,
        end_time: form.endTime || null,
        ...({
          kind: form.kind,
          projektleiter_id: form.projektleiterId || null,
          monteur_ids: form.monteurIds,
          bemerkung: form.bemerkung || null,
        } as Record<string, unknown>),
      }) as unknown as { project?: { id?: string } } & { id?: string }
      showToast(form.id ? 'Eintrag aktualisiert.' : 'Eintrag erstellt.', 'success')
      const targetId = form.id || saved.project?.id || saved.id
      await loadAll()
      if (targetId) {
        const fresh = (await (apiFetch('/pwa/admin/projects') as Promise<Project[]>)).find(p => p.id === targetId)
        if (fresh) setForm(projectToForm(fresh))
      }
    } catch {
      setError('Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  function handleNewInternal(kind: ProjectKind) {
    const base = emptyInternalForm(kind)
    // Aus einem aufgezogenen Termin: Zeiten + vorausgewählten Monteur übernehmen.
    setForm(pendingSlot
      ? {
          ...base,
          startDate: pendingSlot.startDate,
          endDate: pendingSlot.endDate,
          startTime: pendingSlot.startTime,
          endTime: pendingSlot.endTime,
          monteurIds: [...pendingSlot.monteurIds],
          requireMonteur: true,
        }
      : base)
    setPendingSlot(null)
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
    setError(null)
  }

  async function handleClearSchedule() {
    if (!form) return
    setSaving(true)
    try {
      await updateProjectSchedule(form.id, null, null, null, null)
      showToast('Termine entfernt.', 'success')
      setForm(f => f && ({ ...f, startDate: '', endDate: '', startTime: '', endTime: '' }))
      await loadAll()
    } catch {
      showToast('Entfernen fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function setAllMonteurs(value: boolean) {
    setForm(f => f && ({
      ...f,
      monteurIds: value ? monteurOptions.map(s => s.id) : [],
    }))
  }

  const projektleiterOptions = useMemo(() => staff.filter(s => s.projektleiter), [staff])
  const monteurOptions = staff
  const staffLite = useMemo(() => staff.map(s => ({ id: s.id, name: s.name })), [staff])
  const projektleiterFilterOptions = useMemo(
    () => projektleiterOptions
      .map(s => ({ id: s.id, name: s.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [projektleiterOptions],
  )
  const calendarProjects = useMemo(
    () => projektleiterFilter
      ? projects.filter(p => p.projektleiter_id === projektleiterFilter)
      : projects,
    [projects, projektleiterFilter],
  )

  // Picker-Suche: Filter über Name + Kundenname
  const filteredProjects = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    const list = q
      ? projects.filter(p =>
          p.name.toLowerCase().includes(q) ||
          projectCustomerName(p).toLowerCase().includes(q)
        )
      : projects
    return list.slice().sort((a, b) => a.name.localeCompare(b.name))
  }, [projects, pickerSearch])

  async function exportSchedulePdf() {
    if (!visibleWeekIso || exporting) return
    setExporting(true)
    try {
      // staff_ids nur senden, wenn der Monteure-Filter aktiv ist — sonst nimmt
      // das Backend automatisch alle Monteure mit Einsatz in dieser Woche.
      const staffParam = visibleStaffIds === null
        ? ''
        : `&staff_ids=${encodeURIComponent(visibleStaffIds.join(','))}`
      const { blob, filename } = await apiBlobFetch(
        `/pwa/admin/projects/schedule.pdf?week_start=${visibleWeekIso}${staffParam}`
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      showToast('PDF-Export fehlgeschlagen.', 'error')
    } finally {
      setExporting(false)
    }
  }

  function toggleMonteur(id: string) {
    if (!form) return
    setForm(f => f && ({
      ...f,
      monteurIds: f.monteurIds.includes(id)
        ? f.monteurIds.filter(x => x !== id)
        : [...f.monteurIds, id],
    }))
  }

  const slotMonteurNames = pendingSlot
    ? pendingSlot.monteurIds.map(id => staff.find(s => s.id === id)?.name).filter(Boolean).join(', ')
    : ''

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Einsatzplanung</div>
          <div className="admin-page-subtitle">
            {calendarProjects.filter(p => p.start_date).length} geplante Einsätze · {calendarProjects.filter(p => !p.start_date).length} ohne Termin
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProjektleiterFilter
            options={projektleiterFilterOptions}
            value={projektleiterFilter}
            onChange={setProjektleiterFilter}
          />
          <button
            className="admin-btn admin-btn-primary"
            onClick={exportSchedulePdf}
            disabled={!visibleWeekIso || exporting || loading}
            title="Aktuell sichtbare Kalenderwoche als PDF exportieren"
          >
            {exporting ? 'Exportiere…' : 'Wochenplan-PDF'}
          </button>
          {!panelOpen && (
            <>
              <button
                className="admin-btn admin-btn-secondary"
                onClick={() => handleNewInternal('lagerarbeit')}
                title="Internen Einsatz (Lagerarbeit, Teamsitzung, …) anlegen"
              >
                + Interner Einsatz
              </button>
              <button
                className="admin-btn admin-btn-primary solid"
                onClick={() => setPanelOpen(true)}
              >
                + Einsatz planen
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`project-schedule-layout${panelOpen ? '' : ' panel-collapsed'}`}>
        <div className="project-schedule-calendar">
          <ProjectScheduleCalendar
            projects={calendarProjects}
            staff={staffLite}
            loading={loading}
            canton={canton}
            onSelect={selectProject}
            onReschedule={handleReschedule}
            onCreateSlot={handleCreateSlot}
            onVisibleWeekChange={setVisibleWeekIso}
            onVisibleStaffChange={setVisibleStaffIds}
            schedulingConfig={schedulingConfig}
          />
        </div>

        {panelOpen && (
        <aside className="project-schedule-panel">
          <div className="project-schedule-panel-header">
            <div className="project-schedule-panel-title">
              {pendingSlot ? 'Neuer Termin' : form ? 'Einsatz planen' : 'Projekt wählen'}
            </div>
            <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={closePanel}>
              Schließen
            </button>
          </div>

          <div className="project-schedule-panel-body">
            {/* Vorschau des aufgezogenen Termins (Zeiten + ggf. vorgewählter Monteur) */}
            {pendingSlot && (
              <div className="project-schedule-slot-banner">
                <div className="project-schedule-slot-banner-time">
                  {fmtSlotDate(pendingSlot.startDate)} · {pendingSlot.startTime}–{pendingSlot.endTime}
                </div>
                <div className="project-schedule-slot-banner-staff">
                  {slotMonteurNames
                    ? `Mitarbeiter: ${slotMonteurNames}`
                    : 'Mitarbeiter erforderlich – nach der Auswahl festlegen.'}
                </div>
              </div>
            )}

            {/* Projekt-Picker */}
            <div className="project-schedule-field" ref={pickerWrapRef} style={{ position: 'relative' }}>
              <span>Projekt</span>
              <input
                className="admin-input"
                value={form ? form.name : pickerSearch}
                onChange={e => {
                  if (form) clearSelection()
                  setPickerSearch(e.target.value)
                  setPickerOpen(true)
                }}
                onFocus={() => { if (!form) setPickerOpen(true) }}
                placeholder="Projekt suchen oder auswählen…"
                readOnly={!!form}
              />
              {pickerOpen && !form && (
                <div className="project-schedule-picker-list">
                  {filteredProjects.length === 0 ? (
                    <div className="project-schedule-picker-empty">
                      Kein Projekt gefunden.
                    </div>
                  ) : (
                    filteredProjects.map(p => {
                      const cust = projectCustomerName(p)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className="project-schedule-picker-item"
                          onMouseDown={e => e.preventDefault()}
                          onClick={() => selectProject(p)}
                        >
                          <div className="project-schedule-picker-name">{p.name}</div>
                          <div className="project-schedule-picker-meta">
                            {cust || '—'}{p.start_date ? ` · geplant` : ''}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleCreateNew}
              style={{ width: '100%' }}
            >
              + Neues Projekt anlegen
            </button>

            {pendingSlot && (
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => handleNewInternal('sonstiges')}
                style={{ width: '100%' }}
                title="Internen Einsatz (Lagerarbeit, Teamsitzung, …) mit diesen Zeiten anlegen"
              >
                + Interner Einsatz
              </button>
            )}

            {form && (
              <>
                <div className="project-schedule-divider" />

                <label className="project-schedule-field">
                  <span>Art des Einsatzes</span>
                  <select
                    className="admin-input"
                    value={form.kind}
                    onChange={e => setForm(f => {
                      if (!f) return f
                      const nextKind = e.target.value as ProjectKind
                      // Titel automatisch mitziehen, solange er noch dem Default-
                      // Label der bisherigen Art entspricht (Nutzer hat ihn nicht
                      // angepasst). Ein manuell getippter Titel bleibt erhalten.
                      const titleUntouched = !f.name.trim() || f.name === PROJECT_KIND_LABELS[f.kind]
                      const nextName = titleUntouched && nextKind !== 'project'
                        ? PROJECT_KIND_LABELS[nextKind]
                        : f.name
                      return { ...f, kind: nextKind, name: nextName }
                    })}
                    disabled={!!form.id && form.kind === 'project'}
                  >
                    {/* „Kundenprojekt" ist das normale, über den Picker gewählte
                        Projekt — nur zur Anzeige eines bestehenden Kundenprojekts,
                        nicht als umschaltbare Art für interne Einsätze. */}
                    {form.kind === 'project' && <option value="project">Kundenprojekt</option>}
                    <option value="teamsitzung">Teamsitzung / Schulung</option>
                    <option value="lagerarbeit">Lagerarbeit</option>
                    <option value="werkstatt">Werkstatt / Vorbereitung</option>
                    <option value="sonstiges">Sonstiges</option>
                  </select>
                </label>

                {form.kind !== 'project' && (
                  <label className="project-schedule-field">
                    <span>Titel</span>
                    <input
                      className="admin-input"
                      value={form.name}
                      onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                      placeholder={PROJECT_KIND_LABELS[form.kind]}
                    />
                  </label>
                )}

                {form.kind === 'project' && (
                  <label className="project-schedule-field">
                    <span>Kunde</span>
                    <select
                      className="admin-input"
                      value={form.customerId}
                      onChange={e => setForm(f => f && ({ ...f, customerId: e.target.value }))}
                    >
                      <option value="">— kein Kunde —</option>
                      {customers.map(c => (
                        <option key={c.id} value={c.id}>{c.billing_name || c.name || c.id}</option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="project-schedule-field">
                  <span>Projektleiter</span>
                  <select
                    className="admin-input"
                    value={form.projektleiterId}
                    onChange={e => setForm(f => f && ({ ...f, projektleiterId: e.target.value }))}
                  >
                    <option value="">— kein Projektleiter —</option>
                    {projektleiterOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>

                <div className="project-schedule-field">
                  <div className="project-schedule-field-head">
                    <span>
                      Monteure
                      {form.requireMonteur && <span className="project-schedule-req"> *</span>}
                    </span>
                    {monteurOptions.length > 0 && (
                      <button
                        type="button"
                        className="project-schedule-mini-btn"
                        onClick={() => setAllMonteurs(form.monteurIds.length < monteurOptions.length)}
                      >
                        {form.monteurIds.length < monteurOptions.length ? 'Alle wählen' : 'Alle abwählen'}
                      </button>
                    )}
                  </div>
                  <div className="project-schedule-monteur-chips">
                    {monteurOptions.length === 0 && (
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>Keine Mitarbeiter verfügbar.</div>
                    )}
                    {monteurOptions.map(s => {
                      const active = form.monteurIds.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          className={`project-schedule-chip${active ? ' active' : ''}`}
                          onClick={() => toggleMonteur(s.id)}
                        >
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="project-schedule-row">
                  <label className="project-schedule-field">
                    <span>Start</span>
                    <input
                      type="date"
                      className="admin-input"
                      value={form.startDate}
                      onChange={e => setForm(f => {
                        if (!f) return f
                        const v = e.target.value
                        // Enddatum vorbelegen bzw. nachziehen: leer oder vor dem Start → gleicher Tag.
                        const endDate = (v && (!f.endDate || f.endDate < v)) ? v : f.endDate
                        return { ...f, startDate: v, endDate }
                      })}
                    />
                  </label>
                  <label className="project-schedule-field">
                    <span>Ende</span>
                    <input
                      type="date"
                      className="admin-input"
                      value={form.endDate}
                      min={form.startDate || undefined}
                      onChange={e => setForm(f => f && ({ ...f, endDate: e.target.value }))}
                    />
                  </label>
                </div>

                <div className="project-schedule-row">
                  <label className="project-schedule-field">
                    <span>Startzeit</span>
                    <input
                      type="time"
                      className="admin-input"
                      value={form.startTime}
                      onChange={e => setForm(f => f && ({ ...f, startTime: e.target.value }))}
                    />
                  </label>
                  <label className="project-schedule-field">
                    <span>Endzeit</span>
                    <input
                      type="time"
                      className="admin-input"
                      value={form.endTime}
                      onChange={e => setForm(f => f && ({ ...f, endTime: e.target.value }))}
                    />
                  </label>
                </div>

                <label className="project-schedule-field">
                  <span>Bemerkung</span>
                  <textarea
                    className="admin-input"
                    rows={3}
                    value={form.bemerkung}
                    onChange={e => setForm(f => f && ({ ...f, bemerkung: e.target.value }))}
                  />
                </label>

                {error && <div className="project-schedule-error">{error}</div>}

                <div className="project-schedule-actions">
                  <button
                    className="admin-btn admin-btn-primary"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Speichern…' : 'Speichern'}
                  </button>
                  {(form.startDate || form.endDate) && (
                    <button
                      className="admin-btn admin-btn-secondary"
                      onClick={handleClearSchedule}
                      disabled={saving}
                      title="Projekt aus dem Kalender entfernen, Stammdaten bleiben"
                    >
                      Termine entfernen
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
        )}
      </div>

      {toast && (
        <div className="admin-toast-container">
          <div className={`admin-toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  )
}
