import { useEffect, useMemo, useRef, useState } from 'react'
import { apiBlobFetch, apiFetch } from '../../api/client'
import {
  upsertProject, getSchedulingConfig, SchedulingConfig,
  ProjectAppointment, AppointmentKind, APPOINTMENT_KIND_LABELS,
  listAppointments, createAppointment, updateAppointment, deleteAppointment,
} from '../../api/admin'
import { AdminScreen } from '../useAdminNav'
import { Project, ProjectKind, PROJECT_KIND_LABELS, projectCustomerName } from './ProjectsScreen'
import ProjectScheduleCalendar, { CalendarEntry } from './ProjectScheduleCalendar'
import { ProjektleiterFilter } from '../components/ProjektleiterFilter'
import { shiftISO, hhmmToMin, minToHHMM, toDateStr } from '../utils/calendarHelpers'

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

// Projekt-Stammdaten im Panel. Die TERMINE liegen seit Phase 2 nicht mehr hier,
// sondern in project_appointments (eigener Editor-State ApptFormState).
interface FormState {
  id: string
  name: string
  kind: ProjectKind
  customerId: string
  projektleiterId: string
  monteurIds: string[]
  bemerkung: string
}

// Editor für EINEN Termin (id = null → neuer Termin).
interface ApptFormState {
  id: string | null
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  kind: AppointmentKind
  label: string
  // Eigenes Team nur für diesen Termin; aus = Projekt-Team gilt.
  ownTeam: boolean
  monteurIds: string[]
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
    bemerkung: p.bemerkung ?? '',
  }
}

function apptToForm(a: ProjectAppointment): ApptFormState {
  return {
    id: a.id,
    startDate: a.start_date?.slice(0, 10) ?? '',
    endDate: a.end_date?.slice(0, 10) ?? '',
    startTime: a.start_time?.slice(0, 5) ?? '',
    endTime: a.end_time?.slice(0, 5) ?? '',
    kind: a.kind,
    label: a.label ?? '',
    ownTeam: !!(a.monteur_ids && a.monteur_ids.length),
    monteurIds: a.monteur_ids ?? [],
  }
}

function emptyApptForm(kind: AppointmentKind = 'montage'): ApptFormState {
  return {
    id: null, startDate: '', endDate: '', startTime: '', endTime: '',
    kind, label: '', ownTeam: false, monteurIds: [],
  }
}

function slotToApptForm(slot: PendingSlot, kind: AppointmentKind = 'montage'): ApptFormState {
  return {
    id: null,
    startDate: slot.startDate,
    endDate: slot.endDate,
    startTime: slot.startTime,
    endTime: slot.endTime,
    kind,
    label: '',
    ownTeam: slot.monteurIds.length > 0,
    monteurIds: [...slot.monteurIds],
    requireMonteur: true,
  }
}

// 'YYYY-MM-DD' → z.B. "Di, 30.06." für Termin-Zeilen im Panel.
function fmtSlotDate(iso: string): string {
  if (!iso) return ''
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-CH', {
    weekday: 'short', day: '2-digit', month: '2-digit',
  })
}

function fmtApptRow(a: ProjectAppointment): string {
  const from = fmtSlotDate(a.start_date)
  const to = a.end_date && a.end_date !== a.start_date ? ` – ${fmtSlotDate(a.end_date)}` : ''
  const t = a.start_time
    ? `${a.start_time.slice(0, 5)}${a.end_time ? `–${a.end_time.slice(0, 5)}` : ''}`
    : 'ganztägig'
  return `${from}${to} · ${t}`
}

function emptyInternalForm(kind: ProjectKind): FormState {
  return {
    id: '',
    name: PROJECT_KIND_LABELS[kind],
    kind,
    customerId: '',
    projektleiterId: '',
    monteurIds: [],
    bemerkung: '',
  }
}

interface Props {
  canton?: string
  onNav?: (screen: AdminScreen, detailId?: string) => void
}

export default function ProjectScheduleScreen({ canton = 'ZH', onNav }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [appointments, setAppointments] = useState<ProjectAppointment[]>([])
  const [staff, setStaff] = useState<StaffLite[]>([])
  const [customers, setCustomers] = useState<CustomerLite[]>([])
  const [schedulingConfig, setSchedulingConfig] = useState<SchedulingConfig | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [apptForm, setApptForm] = useState<ApptFormState | null>(null)
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
      // Termine in einem grosszügigen Fenster um heute laden — deckt jede
      // realistische Kalender-Navigation ab, ohne Range-State durchzureichen.
      const todayIso = toDateStr(new Date())
      const [proj, appts, st, cust, sched] = await Promise.all([
        apiFetch('/pwa/admin/projects') as Promise<Project[]>,
        listAppointments(shiftISO(todayIso, -400), shiftISO(todayIso, 600)).catch(() => [] as ProjectAppointment[]),
        apiFetch('/pwa/admin/staff') as Promise<StaffLite[]>,
        apiFetch('/pwa/admin/customers') as Promise<CustomerLite[]>,
        // Anzeige-Config ist optional — Fehler darf den Kalender nicht blockieren.
        getSchedulingConfig().catch(() => null),
      ])
      setProjects(proj.filter(p => !p.is_closed && p.status !== 'abgeschlossen'))
      setAppointments(appts)
      setStaff(st)
      setCustomers(cust)
      if (sched) {
        setSchedulingConfig({
          fields: { ...sched.defaults.fields, ...(sched.config.fields || {}) },
          colors: { ...sched.defaults.colors, ...(sched.config.colors || {}) },
          grey_after: sched.config.grey_after ?? sched.defaults.grey_after ?? '',
          grey_until: sched.config.grey_until ?? sched.defaults.grey_until ?? '',
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

  function selectProject(p: Project, appt?: ProjectAppointment) {
    setForm(projectToForm(p))
    // Aus einem aufgezogenen Termin: neuen Termin mit den Zeiten vorbelegen;
    // sonst den geklickten Termin in den Editor laden (oder keinen).
    if (pendingSlot) {
      setApptForm(slotToApptForm(pendingSlot, p.kind === 'project' ? 'montage' : 'sonstiges'))
      setPendingSlot(null)
    } else if (appt) {
      setApptForm(apptToForm(appt))
    } else {
      setApptForm(null)
    }
    setError(null)
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
  }

  // Klick auf einen Kalenderblock: Entry-ID = Termin-ID → Termin + Projekt auflösen.
  function handleCalendarSelect(entry: Project) {
    const appt = appointments.find(a => a.id === entry.id)
    const project = projects.find(p => p.id === (appt?.project_id ?? entry.id))
    if (!project) return
    selectProject(project, appt)
  }

  function clearSelection() {
    setForm(null)
    setApptForm(null)
    setError(null)
  }

  function closePanel() {
    setPanelOpen(false)
    setForm(null)
    setApptForm(null)
    setPendingSlot(null)
    setError(null)
    setPickerOpen(false)
  }

  // Neuer Termin per Aufziehen im Wochenkalender: Panel im Auswahlmodus öffnen
  // (Projekt-Picker + interner Einsatz), Zeiten gemerkt, Monteur ggf. vorbelegt.
  function handleCreateSlot(dateISO: string, startTime: string, endTime: string, monteurId: string | null) {
    setForm(null)
    setApptForm(null)
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

  // Drag-Verschiebung aus dem Kalender: id = TERMIN-ID. deltaDays = Tagesversatz;
  // startTime steuert die Uhrzeit: undefined = beibehalten (Monat), 'HH:MM' = neue
  // Startzeit (Dauer wird mitgezogen), null = Uhrzeit löschen (→ ganztägig).
  async function handleReschedule(id: string, deltaDays: number, startTime?: string | null) {
    const appt = appointments.find(a => a.id === id)
    if (!appt) return

    const newStartDate = shiftISO(appt.start_date, deltaDays)
    const newEndDate = appt.end_date ? shiftISO(appt.end_date, deltaDays) : null

    let newStartTime = appt.start_time ? appt.start_time.slice(0, 5) : null
    let newEndTime = appt.end_time ? appt.end_time.slice(0, 5) : null
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
      newStartDate === appt.start_date.slice(0, 10) &&
      (newEndDate ?? null) === (appt.end_date?.slice(0, 10) ?? null) &&
      newStartTime === (appt.start_time?.slice(0, 5) ?? null) &&
      newEndTime === (appt.end_time?.slice(0, 5) ?? null)
    ) return

    const optimistic: ProjectAppointment = {
      ...appt,
      start_date: newStartDate, end_date: newEndDate,
      start_time: newStartTime, end_time: newEndTime,
    }
    setAppointments(prev => prev.map(a => a.id === id ? optimistic : a))
    try {
      // Partial-PATCH: '' = Feld explizit löschen (ganztägig), fehlend = unverändert.
      const payload: Partial<ProjectAppointment> = { start_date: newStartDate }
      if (appt.end_date) payload.end_date = newEndDate ?? ''
      if (startTime !== undefined) {
        payload.start_time = newStartTime ?? ''
        payload.end_time = newEndTime ?? ''
      }
      await updateAppointment(id, payload)
    } catch {
      setAppointments(prev => prev.map(a => a.id === id ? appt : a))
      showToast('Verschieben fehlgeschlagen.', 'error')
    }
  }

  async function handleSave() {
    if (!form) return
    setError(null)
    if (!form.name.trim()) {
      setError('Titel ist erforderlich.'); return
    }
    if (apptForm) {
      if (apptForm.id && !apptForm.startDate) {
        setError('Startdatum des Termins fehlt — zum Entfernen das ✕ in der Terminliste nutzen.'); return
      }
      if (apptForm.startDate && apptForm.endDate && apptForm.endDate < apptForm.startDate) {
        setError('Enddatum muss nach Startdatum liegen.'); return
      }
      if (apptForm.startTime && apptForm.endTime && (!apptForm.endDate || apptForm.endDate === apptForm.startDate)
          && apptForm.endTime < apptForm.startTime) {
        setError('Endzeit muss nach Startzeit liegen.'); return
      }
      const effectiveTeam = apptForm.ownTeam ? apptForm.monteurIds : form.monteurIds
      if (apptForm.requireMonteur && effectiveTeam.length === 0) {
        setError('Mindestens ein Mitarbeiter ist erforderlich.'); return
      }
    }
    setSaving(true)
    const isInternal = form.kind !== 'project'
    try {
      // Projekt-Stammdaten OHNE Terminfelder — Termine laufen über die
      // appointment-Endpunkte (der Server spiegelt den Ersttermin selbst).
      const saved = await upsertProject({
        id: form.id || undefined,
        name: form.name,
        customer_id: isInternal ? null : (form.customerId || null),
        ...({
          kind: form.kind,
          projektleiter_id: form.projektleiterId || null,
          monteur_ids: form.monteurIds,
          bemerkung: form.bemerkung || null,
        } as Record<string, unknown>),
      }) as unknown as { project?: { id?: string } } & { id?: string }
      const targetId = form.id || saved.project?.id || saved.id
      if (apptForm && apptForm.startDate && targetId) {
        const payload: Partial<ProjectAppointment> = {
          start_date: apptForm.startDate,
          end_date: apptForm.endDate || '',
          start_time: apptForm.startTime || '',
          end_time: apptForm.endTime || '',
          kind: apptForm.kind,
          label: apptForm.label || '',
          // Eigenes Team aus → [] (löscht ein evtl. gesetztes Termin-Team).
          monteur_ids: apptForm.ownTeam ? apptForm.monteurIds : [],
        }
        if (apptForm.id) await updateAppointment(apptForm.id, payload)
        else await createAppointment(targetId, payload)
      }
      showToast(form.id ? 'Eintrag aktualisiert.' : 'Eintrag erstellt.', 'success')
      await loadAll()
      if (targetId) {
        const fresh = (await (apiFetch('/pwa/admin/projects') as Promise<Project[]>)).find(p => p.id === targetId)
        if (fresh) setForm(projectToForm(fresh))
      }
      setApptForm(null)
    } catch {
      setError('Speichern fehlgeschlagen.')
    } finally {
      setSaving(false)
    }
  }

  function handleNewInternal(kind: ProjectKind) {
    setForm(emptyInternalForm(kind))
    // Aus einem aufgezogenen Termin: Zeiten + vorausgewählten Monteur übernehmen.
    setApptForm(pendingSlot ? slotToApptForm(pendingSlot, 'sonstiges') : emptyApptForm('sonstiges'))
    setPendingSlot(null)
    setPickerSearch('')
    setPickerOpen(false)
    setPanelOpen(true)
    setError(null)
  }

  async function handleDeleteAppt(a: ProjectAppointment) {
    setSaving(true)
    try {
      await deleteAppointment(a.id)
      setAppointments(prev => prev.filter(x => x.id !== a.id))
      if (apptForm?.id === a.id) setApptForm(null)
      showToast('Termin entfernt.', 'success')
    } catch {
      showToast('Entfernen fehlgeschlagen.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleClearSchedule() {
    if (!form || !form.id) return
    setSaving(true)
    try {
      for (const a of appointments.filter(x => x.project_id === form.id)) {
        await deleteAppointment(a.id)
      }
      showToast('Termine entfernt.', 'success')
      setApptForm(null)
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

  const filteredByPl = useMemo(
    () => projektleiterFilter
      ? projects.filter(p => p.projektleiter_id === projektleiterFilter)
      : projects,
    [projects, projektleiterFilter],
  )

  // Kalender-Einträge: EIN Eintrag je Termin. id = Termin-ID (eindeutige Keys/
  // Lanes/Drag), Terminfelder überlagern das Projekt; Team = Termin-Team,
  // Fallback Projekt-Team. Badge nur bei Nicht-Standard-Typ (Aufmass/Service/…),
  // damit der Normalfall (Montage) ruhig bleibt.
  const calendarEntries = useMemo<CalendarEntry[]>(() => {
    const projById = new Map(filteredByPl.map(p => [p.id, p]))
    const entries: CalendarEntry[] = []
    for (const a of appointments) {
      const p = projById.get(a.project_id)
      if (!p) continue // geschlossen/archiviert/gefiltert → nicht im Kalender
      entries.push({
        ...p,
        id: a.id,
        start_date: a.start_date,
        end_date: a.end_date ?? a.start_date,
        start_time: a.start_time,
        end_time: a.end_time,
        monteur_ids: (a.monteur_ids && a.monteur_ids.length ? a.monteur_ids : p.monteur_ids) ?? [],
        termin_badge: p.kind === 'project' && a.kind !== 'montage'
          ? (a.kind === 'sonstiges' && a.label ? a.label : APPOINTMENT_KIND_LABELS[a.kind])
          : undefined,
      })
    }
    return entries
  }, [filteredByPl, appointments])

  const scheduledProjectIds = useMemo(
    () => new Set(appointments.map(a => a.project_id)),
    [appointments],
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

  // Termine des im Panel geöffneten Projekts, chronologisch.
  const panelAppointments = useMemo(
    () => form && form.id
      ? appointments
          .filter(a => a.project_id === form.id)
          .slice()
          .sort((a, b) => (a.start_date + (a.start_time ?? '99')).localeCompare(b.start_date + (b.start_time ?? '99')))
      : [],
    [appointments, form],
  )

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

  function toggleApptMonteur(id: string) {
    setApptForm(a => a && ({
      ...a,
      monteurIds: a.monteurIds.includes(id)
        ? a.monteurIds.filter(x => x !== id)
        : [...a.monteurIds, id],
    }))
  }

  const slotMonteurNames = pendingSlot
    ? pendingSlot.monteurIds.map(id => staff.find(s => s.id === id)?.name).filter(Boolean).join(', ')
    : ''

  // Der Termin-Editor (Typ/Team-Sektion) gilt nur für Kundenprojekte — interne
  // Einsätze behalten ihren einen Termin ohne Typ-/Team-Verwaltung.
  const showApptExtras = form?.kind === 'project'

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Einsatzplanung</div>
          <div className="admin-page-subtitle">
            {calendarEntries.length} geplante Einsätze · {filteredByPl.filter(p => !scheduledProjectIds.has(p.id)).length} ohne Termin
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
            projects={calendarEntries}
            staff={staffLite}
            loading={loading}
            canton={canton}
            onSelect={handleCalendarSelect}
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
                            {cust || '—'}{scheduledProjectIds.has(p.id) ? ` · geplant` : ''}
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
                    <span>Monteure (Projekt-Team)</span>
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

                {/* ── Termine ──────────────────────────────────────── */}
                <div className="project-schedule-divider" />

                {showApptExtras && (
                  <div className="project-schedule-field">
                    <div className="project-schedule-field-head">
                      <span>Termine</span>
                      <button
                        type="button"
                        className="project-schedule-mini-btn"
                        onClick={() => { setApptForm(emptyApptForm('montage')); setError(null) }}
                      >
                        + Termin
                      </button>
                    </div>
                    {panelAppointments.length === 0 && !apptForm && (
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>Noch keine Termine geplant.</div>
                    )}
                    {panelAppointments.map(a => (
                      <div
                        key={a.id}
                        className={`project-schedule-appt-row${apptForm?.id === a.id ? ' active' : ''}`}
                        onClick={() => { setApptForm(apptToForm(a)); setError(null) }}
                      >
                        <span className="project-schedule-appt-kind">
                          {a.kind === 'sonstiges' && a.label ? a.label : APPOINTMENT_KIND_LABELS[a.kind]}
                        </span>
                        <span className="project-schedule-appt-when">{fmtApptRow(a)}</span>
                        <button
                          type="button"
                          className="admin-btn-icon danger"
                          title="Termin entfernen"
                          onClick={e => { e.stopPropagation(); void handleDeleteAppt(a) }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {apptForm && (
                  <>
                    {showApptExtras && (
                      <div className="project-schedule-row">
                        <label className="project-schedule-field">
                          <span>Termin-Typ</span>
                          <select
                            className="admin-input"
                            value={apptForm.kind}
                            onChange={e => setApptForm(a => a && ({ ...a, kind: e.target.value as AppointmentKind }))}
                          >
                            <option value="aufmass">Aufmass</option>
                            <option value="montage">Montage</option>
                            <option value="service">Service</option>
                            <option value="sonstiges">Sonstiges</option>
                          </select>
                        </label>
                        {apptForm.kind === 'sonstiges' && (
                          <label className="project-schedule-field">
                            <span>Bezeichnung</span>
                            <input
                              className="admin-input"
                              value={apptForm.label}
                              onChange={e => setApptForm(a => a && ({ ...a, label: e.target.value }))}
                              placeholder="z.B. Besprechung"
                            />
                          </label>
                        )}
                      </div>
                    )}

                    <div className="project-schedule-row">
                      <label className="project-schedule-field">
                        <span>Start</span>
                        <input
                          type="date"
                          className="admin-input"
                          value={apptForm.startDate}
                          onChange={e => setApptForm(a => {
                            if (!a) return a
                            const v = e.target.value
                            // Enddatum vorbelegen bzw. nachziehen: leer oder vor dem Start → gleicher Tag.
                            const endDate = (v && (!a.endDate || a.endDate < v)) ? v : a.endDate
                            return { ...a, startDate: v, endDate }
                          })}
                        />
                      </label>
                      <label className="project-schedule-field">
                        <span>Ende</span>
                        <input
                          type="date"
                          className="admin-input"
                          value={apptForm.endDate}
                          min={apptForm.startDate || undefined}
                          onChange={e => setApptForm(a => a && ({ ...a, endDate: e.target.value }))}
                        />
                      </label>
                    </div>

                    <div className="project-schedule-row">
                      <label className="project-schedule-field">
                        <span>Startzeit</span>
                        <input
                          type="time"
                          className="admin-input"
                          value={apptForm.startTime}
                          onChange={e => setApptForm(a => a && ({ ...a, startTime: e.target.value }))}
                        />
                      </label>
                      <label className="project-schedule-field">
                        <span>Endzeit</span>
                        <input
                          type="time"
                          className="admin-input"
                          value={apptForm.endTime}
                          onChange={e => setApptForm(a => a && ({ ...a, endTime: e.target.value }))}
                        />
                      </label>
                    </div>

                    {showApptExtras && (
                      <div className="project-schedule-field">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={apptForm.ownTeam}
                            onChange={e => setApptForm(a => a && ({ ...a, ownTeam: e.target.checked }))}
                          />
                          Eigenes Team für diesen Termin
                          {apptForm.requireMonteur && <span className="project-schedule-req"> *</span>}
                        </label>
                        {apptForm.ownTeam && (
                          <div className="project-schedule-monteur-chips" style={{ marginTop: 6 }}>
                            {monteurOptions.map(s => {
                              const active = apptForm.monteurIds.includes(s.id)
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  className={`project-schedule-chip${active ? ' active' : ''}`}
                                  onClick={() => toggleApptMonteur(s.id)}
                                >
                                  {s.name}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

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
                  {panelAppointments.length > 0 && (
                    <button
                      className="admin-btn admin-btn-secondary"
                      onClick={handleClearSchedule}
                      disabled={saving}
                      title="Alle Termine des Projekts aus dem Kalender entfernen, Stammdaten bleiben"
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
