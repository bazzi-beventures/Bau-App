import { useState } from 'react'
import ConfigurationScreen from '../configuration/ConfigurationScreen'
import ServiceStatusScreen from './ServiceStatusScreen'
import PushTestScreen from './PushTestScreen'
import LlmCostsScreen from '../llm/LlmCostsScreen'

// Admin-Tools bündelt Konfiguration, Service-Status und Push-Test unter einem
// Sidebar-Eintrag und schaltet zwischen ihnen per Tab um. Alle drei Tools sind
// superadmin-only — der Zugriff wird vom Sidebar-Eintrag bzw. dem Guard in
// AdminApp.renderScreen erzwungen, hier erscheinen daher immer alle Tabs. Jeder
// Tool-Screen bringt seinen eigenen admin-page-Rahmen (Titel + Aktionen) mit;
// die Tab-Leiste sitzt darüber und übernimmt nur die Navigation.
type Tool = 'configuration' | 'service-status' | 'push-test' | 'llm-costs'

interface Props {
  userRole: string
}

const TABS: { id: Tool; label: string }[] = [
  { id: 'configuration',  label: 'Konfiguration' },
  { id: 'service-status', label: 'Service-Status' },
  { id: 'push-test',      label: 'Push-Test' },
  { id: 'llm-costs',      label: 'LLM-Kosten' },
]

export default function AdminToolsScreen({ userRole }: Props) {
  const [active, setActive] = useState<Tool>('configuration')

  function renderTool() {
    switch (active) {
      case 'configuration':  return <ConfigurationScreen userRole={userRole} />
      case 'service-status': return <ServiceStatusScreen />
      case 'push-test':      return <PushTestScreen />
      case 'llm-costs':      return <LlmCostsScreen />
    }
  }

  return (
    <>
      <div className="admin-tools-tabs">
        <div className="kpi-admin-tabs">
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
