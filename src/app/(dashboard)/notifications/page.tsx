import { redirect } from 'next/navigation'
import { getCurrentBusiness } from '@/lib/business'
import { isFeatureEnabled } from '@/lib/dashboardFeatures'
import { isNotificationEnabled, NOTIFICATION_REGISTRY } from '@/lib/notifications'
import { updateNotificationPreferencesAction } from './actions'
import { Bell } from 'lucide-react'

const ERROR_MESSAGES: Record<string, string> = {
  nobusiness: 'No business profile found.',
  disabled: 'Notifications are not enabled for this location.',
  save: 'Failed to save your notification preferences. Please try again.',
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

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="max-w-2xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-2.5">
          <Bell size={20} style={{ color: 'var(--ink)' }} />
          <h1 className="font-extrabold text-xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>Notifications</h1>
        </div>

        <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
          Email alerts sent to <span className="font-semibold" style={{ color: 'var(--ink)' }}>{user?.email ?? 'your account email'}</span>.
          Turn off anything you&apos;d rather not be emailed about.
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

        <section className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--shadow)' }}>
          <form action={updateNotificationPreferencesAction} className="p-5 flex flex-col gap-3">
            {NOTIFICATION_REGISTRY.map(({ key, label, description }) => (
              <label key={key} className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input type="checkbox" name={key} defaultChecked={isNotificationEnabled(biz, key)} className="mt-0.5" />
                <span>
                  <span className="font-semibold block" style={{ color: 'var(--ink)' }}>{label}</span>
                  <span className="text-xs block mt-0.5" style={{ color: 'var(--ink-3)' }}>{description}</span>
                </span>
              </label>
            ))}
            <button type="submit" className="w-fit rounded-xl px-4 py-2.5 text-sm font-bold text-white mt-1 transition-opacity hover:opacity-90"
              style={{ background: 'var(--violet)' }}>
              Save preferences
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
