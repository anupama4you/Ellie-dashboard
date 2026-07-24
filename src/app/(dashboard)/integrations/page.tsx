import { createClient } from '@/lib/supabase/server'
import { getCurrentBusiness } from '@/lib/business'
import GoogleCalendarCard from '@/components/GoogleCalendarCard'
import IntegrationTile from '@/components/IntegrationTile'

// UI only — none of these have a backend yet. Google Calendar (rendered
// separately above, via GoogleCalendarCard) is the only one actually wired up.
const FRESHA_LOGO = 'data:image/png;base64,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'

const COMING_SOON = [
  { name: 'Fresha',     description: 'Sync your salon bookings and client list with Fresha.', imageSrc: FRESHA_LOGO, color: '#5B4FE9', bg: 'rgba(91,79,233,0.1)' },
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
