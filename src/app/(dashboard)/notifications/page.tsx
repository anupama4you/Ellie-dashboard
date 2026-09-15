import { redirect } from 'next/navigation'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { isNotificationEnabled, NOTIFICATION_REGISTRY, type NotificationChannel } from '@/lib/notifications'
import { updateNotificationPreferencesAction } from './actions'
import { Bell, Mail, MessageSquare, AlertTriangle } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  nobusiness: 'No business profile found.',
  disabled: 'Notifications are not enabled for this location.',
  save: 'Failed to save your notification preferences. Please try again.',
}

function hasChannel(channels: NotificationChannel[], channel: NotificationChannel) {
  return channels.includes(channel)
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const { saved, error } = await searchParams
  const { user, business: biz } = await getCurrentBusiness()
  if (!isFeatureEnabled(biz, 'notifications')) redirect('/')
  if (!biz) redirect('/')

  const emailOnly = NOTIFICATION_REGISTRY.filter(n => !hasChannel(n.channels, 'sms'))
  const emailAndSms = NOTIFICATION_REGISTRY.filter(n => hasChannel(n.channels, 'sms'))

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <Bell size={20} style={{ color: 'var(--ink)' }} />
          <h1 className="font-extrabold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Notifications</h1>
        </div>

        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
          Turn off anything you&apos;d rather not be notified about — each toggle below covers every channel that event sends on.
        </p>

        {error && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}>
            {ERROR_MESSAGES[error] ?? 'Something went wrong. Please try again.'}
          </div>
        )}
        {saved && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--signal-soft)', color: 'var(--signal)' }}>
            Preferences saved.
          </div>
        )}

        <form action={updateNotificationPreferencesAction} className="flex flex-col gap-5">
          <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center gap-2 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <Mail size={14} style={{ color: 'var(--violet)' }} />
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Email</h2>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                — sent to <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>{user?.email ?? 'your account email'}</span>
              </span>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {emailOnly.map(({ key, label, description }) => (
                <label key={key} className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" name={key} defaultChecked={isNotificationEnabled(biz, key)} className="mt-0.5" />
                  <span>
                    <span className="font-semibold block" style={{ color: 'var(--ink)' }}>{label}</span>
                    <span className="text-xs block mt-0.5" style={{ color: 'var(--ink-3)' }}>{description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
            <div className="flex items-center gap-2 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--line)' }}>
              <MessageSquare size={14} style={{ color: 'var(--violet)' }} />
              <h2 className="text-sm font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Email + SMS</h2>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                — texted to{' '}
                {biz.phone
                  ? <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>{biz.phone}</span>
                  : <span style={{ color: 'var(--coral)' }}>no business phone on file</span>}
                , as well as emailed
              </span>
            </div>
            <div className="p-5 flex flex-col gap-3">
              {!biz.phone && (
                <div className="flex items-start gap-2 rounded-xl px-3.5 py-3 text-xs" style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}>
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>No business phone is on file, so these will only arrive by email until one is set. Contact your Ellie account manager to add one.</span>
                </div>
              )}
              {emailAndSms.map(({ key, label, description }) => (
                <label key={key} className="flex items-start gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" name={key} defaultChecked={isNotificationEnabled(biz, key)} className="mt-0.5" />
                  <span>
                    <span className="font-semibold block" style={{ color: 'var(--ink)' }}>{label}</span>
                    <span className="text-xs block mt-0.5" style={{ color: 'var(--ink-3)' }}>{description}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <button type="submit" className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--violet)' }}>
            Save preferences
          </button>
        </form>
      </div>
    </div>
  )
}
