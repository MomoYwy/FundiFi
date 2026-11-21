import type { View } from './Sidebar'
import { AIInsights } from './AIInsights'
import { Compliance } from './Compliance'
import { SupportCenter } from './SupportCenter'

export function UnavailableView({ view }: { view: View }) {
  if (view === 'insights') return <AIInsights />
  if (view === 'compliance') return <Compliance />
  if (view === 'support') return <SupportCenter />
  return null
}
