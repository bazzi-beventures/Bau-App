import { useState } from 'react'
import { useTabStrip } from '../hooks/useTabStrip'
import ConfigurationScreen from '../configuration/ConfigurationScreen'
import ServiceStatusScreen from './ServiceStatusScreen'
import PushTestScreen from './PushTestScreen'
import LlmCostsScreen from '../llm/LlmCostsScreen'
import UsageScreen from '../usage/UsageScreen'
import MaterialCleanupScreen from './MaterialCleanupScreen'
import UnitsPanel from './UnitsPanel'
import ErrorLogsScreen from './ErrorLogsScreen'

// Admin-Tools bündelt Konfiguration, Service-Status und Push-Test unter einem
// Sidebar-Eintrag und schaltet zwischen ihnen per Tab um. Alle drei Tools sind
// superadmin-only — der Zugriff wird vom Sidebar-Eintrag bzw. dem Guard in
// AdminApp.renderScreen erzwungen, hier erscheinen daher immer alle Tabs. Jeder
// Tool-Screen bringt seinen eigenen admin-page-Rahmen (Titel + Aktionen) mit;
// die Tab-Leiste sitzt darüber und übernimmt nur die Navigation.
type Tool = 'configuration' | 'service-status' | 'push-test' | 'llm-costs' | 'usage' | 'units' | 'material-cleanup' | 'error-logs'

interface Props {
  userRole: string
  /** Module dieses Mandanten — durchgereicht an das Nutzungs-Dashboard, das
   *  daraus das Modul-Inventar baut (Spec docs/specs/nutzungs-dashboard.md §7c). */
  enabledModules: string[]
}

const TABS: { id: Tool; label: string }[] = [
  { id: 'configuration',  label: 'Konfiguration' },
  { id: 'service-status', label: 'Service-Status' },
  { id: 'push-test',      label: 'Push-Test' },
  { id: 'llm-costs',      label: 'LLM-Kosten' },
  { id: 'usage',          label: 'Nutzung' },
  { id: 'units',          label: 'Einheiten' },
  { id: 'material-cleanup', label: 'Materialdatenbereinigung' },
  { id: 'error-logs',     label: 'Error-Logs' },
]

export default function AdminToolsScreen({ userRole, enabledModules }: Props) {
  const [active, setActive] = useState<Tool>('configuration')
  const tabsRef = useTabStrip(active)

  function renderTool() {
    switch (active) {
      case 'configuration':  return <ConfigurationScreen userRole={userRole} />
      case 'service-status': return <ServiceStatusScreen />
      case 'push-test':      return <PushTestScreen />
      case 'llm-costs':      return <LlmCostsScreen />
      case 'usage':          return <UsageScreen enabledModules={enabledModules} />
      case 'units':          return <UnitsPanel />
      case 'material-cleanup': return <MaterialCleanupScreen />
      case 'error-logs':     return <ErrorLogsScreen />
    }
  }

  return (
    <>
      <div className="admin-tools-tabs">
        <div className="kpi-admin-tabs" ref={tabsRef}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`kpi-admin-tab${active === t.id ? ' active' : ''}`}
              onClick={() => setActive(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {renderTool()}
    </>
  )
}
