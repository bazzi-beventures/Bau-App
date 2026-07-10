import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DocumentBackupJob,
  getLatestDocumentBackup,
  getDocumentBackup,
  startDocumentBackup,
} from '../../api/admin'
import { ApiError } from '../../api/client'

const POLL_MS = 3000

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const mb = n / (1024 * 1024)
  if (mb >= 1) return `${mb.toFixed(1)} MB`
  return `${Math.max(1, Math.round(n / 1024))} KB`
}

function formatRemaining(expiresAt: string | null): string {
  if (!expiresAt) return ''
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'abgelaufen'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return `noch ${h} h ${m} min gültig`
  return `noch ${m} min gültig`
}

const isActive = (j: DocumentBackupJob | null): boolean =>
  j?.status === 'pending' || j?.status === 'running'

export default function DocumentBackupScreen() {
  const [job, setJob] = useState<DocumentBackupJob | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Für die Restlaufzeit-Anzeige jede Minute neu rendern.
  const [, setTick] = useState(0)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPoll = () => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null }
  }

  // Polling-Schleife: solange der Job pending/running ist, alle POLL_MS nachfragen.
  const poll = useCallback((id: number) => {
    clearPoll()
    pollRef.current = setTimeout(async () => {
      try {
        const next = await getDocumentBackup(id)
        setJob(next)
        if (isActive(next)) poll(id)
      } catch {
        // transienter Fehler → später erneut versuchen
        poll(id)
      }
    }, POLL_MS)
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const latest = await getLatestDocumentBackup()
        setJob(latest)
        if (isActive(latest) && latest) poll(latest.id)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fehler beim Laden')
      } finally {
        setLoading(false)
      }
    })()
    return clearPoll
  }, [poll])

  // Minütlicher Tick für die Countdown-Anzeige des Download-Links.
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(iv)
  }, [])

  async function handleStart() {
    setError(null)
    setStarting(true)
    try {
      const created = await startDocumentBackup()
      setJob(created)
      poll(created.id)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Es läuft bereits ein Export → aktuellen Stand nachladen.
        const latest = await getLatestDocumentBackup()
        setJob(latest)
        if (isActive(latest) && latest) poll(latest.id)
        setError('Es läuft bereits ein Export. Bitte warten, bis er fertig ist.')
      } else {
        setError(e instanceof Error ? e.message : 'Export konnte nicht gestartet werden')
      }
    } finally {
      setStarting(false)
    }
  }

  const running = isActive(job)
  // `parts` ist maßgeblich; für einen (noch) nicht aktualisierten Backend-Stand auf
  // das einzelne download_url zurückfallen.
  const downloads =
    job?.parts && job.parts.length > 0
      ? job.parts
      : job?.download_url
        ? [{
            filename: job.filename,
            document_count: job.document_count,
            total_bytes: job.total_bytes,
            download_url: job.download_url,
          }]
        : []
  const ready = job?.status === 'ready' && !job.expired && downloads.length > 0
  const readyExpired = job?.status === 'ready' && (job.expired || downloads.length === 0)

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Datensicherung</div>
          <div className="admin-page-subtitle">
            Alle Dokumente (Rechnungen, Offerten, Rapporte) als ein ZIP herunterladen.
            Der Export läuft im Hintergrund; wenn er fertig ist, kommt eine Push-Meldung
            und der Download-Link erscheint hier (12 Stunden gültig).
          </div>
        </div>
        <button
          className="admin-btn admin-btn-primary"
          onClick={handleStart}
          disabled={starting || running}
        >
          {starting ? 'Startet…' : running ? 'Export läuft…' : 'Backup erstellen'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading && <div className="admin-loading"><div className="kpi-admin-spinner" />Lädt…</div>}

      {!loading && !job && (
        <div style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13, maxWidth: 560 }}>
          Noch kein Export erstellt. Mit „Backup erstellen" wird eine ZIP-Sicherung aller
          Dokumente gestartet.
        </div>
      )}

      {!loading && job && (
        <div style={{ maxWidth: 560, border: '1px solid var(--border)', borderRadius: 10, padding: 20, background: 'var(--surface)' }}>
          {running && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text)' }}>
              <div className="kpi-admin-spinner" />
              <div>
                <div style={{ fontWeight: 600 }}>Export läuft…</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Die Dokumente werden gepackt. Das kann je nach Menge einige Minuten dauern —
                  du bekommst eine Push-Nachricht, sobald es fertig ist.
                </div>
              </div>
            </div>
          )}

          {ready && job && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
                Backup bereit
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                {job.document_count} Dokument(e) · {formatBytes(job.total_bytes)} · {formatRemaining(job.expires_at)}
                {downloads.length > 1 && ` · ${downloads.length} Teile`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {downloads.map((p, i) => (
                  <a
                    key={i}
                    className="admin-btn admin-btn-primary"
                    href={p.download_url}
                    download={p.filename ?? `backup_teil_${i + 1}.zip`}
                    style={{ textDecoration: 'none' }}
                  >
                    {downloads.length > 1
                      ? `Teil ${i + 1} von ${downloads.length} herunterladen (${formatBytes(p.total_bytes)})`
                      : 'ZIP herunterladen'}
                  </a>
                ))}
              </div>
              {downloads.length > 1 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                  Die Sicherung ist auf mehrere ZIP-Dateien aufgeteilt (Upload-Limit).
                  Bitte alle Teile herunterladen.
                </div>
              )}
            </div>
          )}

          {readyExpired && (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
                Link abgelaufen
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Der Download-Link war 12 Stunden gültig und ist abgelaufen. Bitte ein neues
                Backup erstellen.
              </div>
            </div>
          )}

          {job.status === 'failed' && (
            <div>
              <div style={{ fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>
                Export fehlgeschlagen
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {job.error || 'Unbekannter Fehler.'}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
