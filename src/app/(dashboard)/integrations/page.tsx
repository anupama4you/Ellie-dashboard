import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import GoogleCalendarCard from '@/components/GoogleCalendarCard'
import IntegrationTile from '@/components/IntegrationTile'

// UI only — none of these have a backend yet. Google Calendar (rendered
// separately above, via GoogleCalendarCard) is the only one actually wired up.
const COMING_SOON = [
  { name: 'Square',     description: 'Sync sales and take payments in person.',            icon: 'square' as const,     color: '#0A0A0A', bg: '#E9E9E9' },
  { name: 'Stripe',     description: 'Accept card payments for deposits and invoices.',      icon: 'stripe' as const,     color: '#635BFF', bg: 'rgba(99,91,255,0.12)' },
  { name: 'Xero',       description: 'Keep your books in sync, automatically.',              icon: 'xero' as const,       color: '#0F9CC7', bg: 'rgba(19,181,234,0.14)' },
  { name: 'QuickBooks', description: 'Sync invoices and payments automatically.',             icon: 'quickbooks' as const, color: '#2CA01C', bg: 'rgba(44,160,28,0.12)' },
  { name: 'Mailchimp',  description: 'Turn callers into your mailing list, automatically.',   icon: 'mailchimp' as const,  color: '#8A6D00', bg: 'rgba(255,224,27,0.28)' },
  { name: 'Slack',      description: 'Get a ping in Slack the moment Ellie books something.', icon: 'slack' as const,      color: '#611F69', bg: 'rgba(97,31,105,0.1)' },
  { name: 'Zapier',     description: 'Connect Ellie to thousands of other apps.',              icon: 'zapier' as const,     color: '#FF4A00', bg: 'rgba(255,74,0,0.1)' },
  { name: 'HubSpot',    description: 'Keep customer records in sync with your CRM.',            icon: 'hubspot' as const,    color: '#D14E28', bg: 'rgba(255,122,89,0.14)' },
]

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ calendar?: string }>
}) {
  const { calendar } = await searchParams
  const { business: biz } = await getCurrentBusiness()
  const supabase = await createClient()

  const { data: calendarConnection } = biz
    ? await supabase.from('calendar_connections').select('google_email, status').eq('business_id', biz.id).single()
    : { data: null }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-[1100px] mx-auto flex flex-col gap-5">
        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--ink)' }}>
            Integrations
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--ink-3)' }}>Connect the tools your business already runs on</p>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {biz?.id && (
            <GoogleCalendarCard businessId={biz.id} connection={calendarConnection} statusParam={calendar} />
          )}
          {COMING_SOON.map(item => (
            <IntegrationTile key={item.name} {...item} />
          ))}
        </div>
      </div>
    </div>
  )
}
