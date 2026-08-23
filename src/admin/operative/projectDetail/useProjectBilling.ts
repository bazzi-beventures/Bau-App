import { useState } from 'react'
import {
  archiveInvoice, generateInvoice, markInvoicePaid, markInvoiceSentByPost,
  sendInvoice, unmarkInvoicePaid,
} from '../../../api/admin/invoices'
import {
  listProjectInvoices, listProjectQuotes, listProjectReports,
} from '../../../api/admin/projects'
import {
  addQuoteVariant, getQuoteDetail, regenerateQuote, sendQuoteRejection, setQuoteStatus,
  type QuoteDetail,
} from '../../../api/admin/quotes'
import { deleteProjectReport, regenerateReportPdf } from '../../../api/admin/reports'
import type { ProjectInvoice, ProjectQuote, ProjectReport } from './types'
import { hasBillableReport } from './billingRules'
import { invoiceWarningHint, sammelrechnungHint } from '../../utils/invoiceHints'

// Belege eines Projekts (Charge H, H3): Offerten, Rechnungen, Rapporte — Listen
// und die Aktionen darauf. Der grösste Block des Projekt-Details und der einzige,
// der Geld bewegt.
//
// Was der Hook NICHT übernimmt: welche Maske gerade offen ist. Offerte
// bearbeiten, Rechnung senden, Rapport erfassen sind Dialoge des Screens; der
// Hook liefert nur die Daten dafür (`loadQuoteDetail`) und lädt danach neu.

export interface UseProjectBilling {
  quotes: ProjectQuote[]
  invoices: ProjectInvoice[]
  reports: ProjectReport[]
  generatingInvoice: boolean
  regeneratingQuoteId: number | null
  addingVariantId: number | null
  sendingRejectionId: number | null
  reloadQuotes: () => Promise<void>
  reloadInvoices: () => Promise<void>
  reloadReports: () => Promise<void>
  /** Vollständige Offerte fürs Bearbeiten-Formular; null, wenn das Laden scheitert. */
  loadQuoteDetail: (quoteId: number) => Promise<QuoteDetail | null>
  deleteReport: (reportId: number) => Promise<void>
  regenerateReportPdf: (reportId: number) => Promise<void>
  regenerate: (quoteId: number) => Promise<void>
  addVariant: (quoteId: number, kind: 'variante' | 'mehrfach') => Promise<void>
  updateQuoteStatus: (quoteId: number, status: string) => Promise<void>
  sendRejection: (quoteId: number) => Promise<void>
  generate: (remark: string, useAcceptedQuote: boolean) => Promise<boolean>
  markPaid: (invoiceId: number, paidDate: string) => Promise<boolean>
  unmarkPaid: (invoiceId: number) => Promise<void>
  archive: (invoiceId: number) => Promise<void>
  send: (invoiceId: number, recipientEmail: string) => Promise<boolean>
  markSentByPost: (invoiceId: number, sentDate: string) => Promise<boolean>
}

export function useProjectBilling(
  project: { id: string; name: string } | null | undefined,
  cb: {
    onToast: (msg: string) => void
    /** Nach dem Bezahlen: der Screen fragt, ob das Projekt abgeschlossen wird. */
    onInvoicePaid: () => void
  },
): UseProjectBilling {
  const [quotes, setQuotes] = useState<ProjectQuote[]>([])
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([])
  const [reports, setReports] = useState<ProjectReport[]>([])
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [regeneratingQuoteId, setRegeneratingQuoteId] = useState<number | null>(null)
  const [addingVariantId, setAddingVariantId] = useState<number | null>(null)
  const [sendingRejectionId, setSendingRejectionId] = useState<number | null>(null)

  async function reloadQuotes() {
    if (!project) return
    try {
      setQuotes(await listProjectQuotes<ProjectQuote>(project.id))
    } catch { /* ignore */ }
  }

  async function reloadInvoices() {
    if (!project) return
    try {
      setInvoices(await listProjectInvoices<ProjectInvoice>(project.id))
    } catch { /* ignore */ }
  }

  async function reloadReports() {
    if (!project) return
    try {
      setReports(await listProjectReports<ProjectReport>(project.id))
    } catch { /* ignore */ }
  }

  async function loadQuoteDetail(quoteId: number): Promise<QuoteDetail | null> {
    // Detail (alle Positionen) frisch laden — die Listen-Zeile trägt nur die
    // Kopfdaten, das Bearbeiten-Formular braucht die vollständige Offerte.
    try {
      return await getQuoteDetail(quoteId)
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler beim Laden der Offerte')
      return null
    }
  }

  // Rapport löschen — z.B. ein doppelt erfasster. Ohne das landen dessen Stunden
  // und Material zusätzlich auf der nächsten Rechnung (billable_report_ids filtert
  // nur bereits Verrechnetes, keine Dubletten). Abgerechnete Rapporte sperrt der
  // Server mit 409; die Meldung geht dann als Toast raus.
  async function deleteReport(reportId: number) {
    if (!project) return
    try {
      const res = await deleteProjectReport(project.id, reportId)
      await reloadReports()
      if (res?.warnings?.length) {
        cb.onToast(`Rapport gelöscht — Lager-Rückbuchung unvollständig: ${res.warnings.join(', ')}`)
      } else {
        cb.onToast(res?.stock_restored
          ? `Rapport gelöscht (${res.stock_restored} Materialposition${res.stock_restored === 1 ? '' : 'en'} ins Lager zurückgebucht)`
          : 'Rapport gelöscht')
      }
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Rapport konnte nicht gelöscht werden')
      throw err
    }
  }

  // Fehlendes Rapport-PDF nachziehen. Kommt vor, wenn der Storage-Upload beim
  // Unterschreiben/Erfassen scheiterte: der Rapport ist gespeichert, das Dokument
  // fehlt — und über Bearbeiten (das sonst neu rendert) ist er nach dem Verrechnen
  // nicht mehr erreichbar. Liegt schon ein PDF vor, antwortet der Server mit 409.
  async function regenerateReportPdfFor(reportId: number) {
    if (!project) return
    try {
      await regenerateReportPdf(project.id, reportId)
      await reloadReports()
      cb.onToast('PDF erzeugt')
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'PDF konnte nicht erzeugt werden')
    }
  }

  async function regenerate(quoteId: number) {
    setRegeneratingQuoteId(quoteId)
    try {
      await regenerateQuote(quoteId)
      cb.onToast('Neue Version erstellt')
      await reloadQuotes()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler beim Regenerieren')
    } finally {
      setRegeneratingQuoteId(null)
    }
  }

  async function addVariant(quoteId: number, kind: 'variante' | 'mehrfach') {
    setAddingVariantId(quoteId)
    try {
      await addQuoteVariant(quoteId, kind)
      cb.onToast('Weitere Offerte erstellt — jetzt anpassen')
      await reloadQuotes()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler bei „Weitere Offerte"')
    } finally {
      setAddingVariantId(null)
    }
  }

  async function updateQuoteStatus(quoteId: number, status: string) {
    try {
      await setQuoteStatus(quoteId, status)
      await reloadQuotes()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function sendRejection(quoteId: number) {
    setSendingRejectionId(quoteId)
    try {
      const res = await sendQuoteRejection(quoteId)
      cb.onToast(res.message || 'Absage-Mail gesendet')
      await reloadQuotes()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Absage-Mail fehlgeschlagen')
    } finally {
      setSendingRejectionId(null)
    }
  }

  async function generate(remark: string, useAcceptedQuote: boolean): Promise<boolean> {
    if (!project) return false
    // Fehlt ein verrechenbarer Rapport (unterschrieben ODER manuell erfasst,
    // siehe hasBillableReport), wird zwingend aus der Offerte gerechnet — das
    // Backend setzt dann automatisch created_without_report.
    const useQuote = useAcceptedQuote || !hasBillableReport(reports)
    setGeneratingInvoice(true)
    try {
      const res = await generateInvoice({
        project_name: project.name,
        project_id: project.id,
        use_quote: useQuote,
        work_description: '',
        remark,
      })
      cb.onToast(
        'Rechnung erstellt'
        + sammelrechnungHint(res?.quote_numbers)
        + invoiceWarningHint(res?.warnings),
      )
      await reloadInvoices()
      await reloadReports()
      return true
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler beim Erstellen')
      return false
    } finally {
      setGeneratingInvoice(false)
    }
  }

  // `paidDate` = Tag des Zahlungseingangs (ISO), nachtragbar statt automatisch
  // «heute». Danach fragt der Screen «Projekt abschliessen?» — die bezahlte
  // Rechnung ist meist der letzte Schritt eines Auftrags.
  async function markPaid(invoiceId: number, paidDate: string): Promise<boolean> {
    try {
      await markInvoicePaid(invoiceId, paidDate)
      await reloadInvoices()
      cb.onInvoicePaid()
      return true
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
      return false
    }
  }

  async function unmarkPaid(invoiceId: number) {
    try {
      await unmarkInvoicePaid(invoiceId)
      cb.onToast('Zahlung zurückgesetzt')
      await reloadInvoices()
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function archive(invoiceId: number) {
    try {
      await archiveInvoice(invoiceId)
      cb.onToast('Rechnung archiviert — Rapporte wieder verrechenbar')
      // Rapporte neu laden: der «Abgerechnet»-Status der gelösten Rapporte ändert sich.
      await Promise.all([reloadInvoices(), reloadReports()])
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
    }
  }

  async function send(invoiceId: number, recipientEmail: string): Promise<boolean> {
    try {
      await sendInvoice(invoiceId, recipientEmail)
      cb.onToast(`Rechnung an ${recipientEmail} gesendet`)
      await reloadInvoices()
      return true
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Versand fehlgeschlagen')
      return false
    }
  }

  // Postversand: derselbe Endpunkt wie in der Rechnungsübersicht. `sentDate` ist
  // das Aufgabedatum bei der Post — daraus leitet das Backend das Zahlungsziel ab,
  // deshalb nachtragbar statt «jetzt».
  async function markSentByPost(invoiceId: number, sentDate: string): Promise<boolean> {
    try {
      await markInvoiceSentByPost(invoiceId, sentDate)
      cb.onToast('Rechnung als per Post versendet markiert')
      await reloadInvoices()
      return true
    } catch (err) {
      cb.onToast(err instanceof Error ? err.message : 'Fehler')
      return false
    }
  }

  return {
    quotes, invoices, reports,
    generatingInvoice, regeneratingQuoteId, addingVariantId, sendingRejectionId,
    reloadQuotes, reloadInvoices, reloadReports, loadQuoteDetail, deleteReport,
    regenerateReportPdf: regenerateReportPdfFor,
    regenerate, addVariant, updateQuoteStatus, sendRejection, generate,
    markPaid, unmarkPaid, archive, send, markSentByPost,
  }
}
