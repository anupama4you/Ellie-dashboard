import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isNotificationEnabled, sendNotificationEmail } from './notifications'

vi.mock('@/lib/resend', () => ({ sendEmail: vi.fn() }))
import { sendEmail } from '@/lib/resend'

describe('isNotificationEnabled', () => {
  it('defaults to enabled when the key is absent', () => {
    expect(isNotificationEnabled({ notification_preferences: {} }, 'campaignStopped')).toBe(true)
  })

  it('defaults to enabled when notification_preferences is null', () => {
    expect(isNotificationEnabled({ notification_preferences: null }, 'missedCall')).toBe(true)
  })

  it('defaults to enabled when business itself is null', () => {
    expect(isNotificationEnabled(null, 'missedCall')).toBe(true)
  })

  it('is disabled only on an explicit false', () => {
    expect(isNotificationEnabled({ notification_preferences: { campaignStopped: false } }, 'campaignStopped')).toBe(false)
  })
})

describe('sendNotificationEmail', () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockClear()
  })

  it('sends when the notification type is enabled', async () => {
    const getEmail = vi.fn().mockResolvedValue('client@example.com')
    await sendNotificationEmail({ notification_preferences: {} }, 'missedCall', getEmail, 'Subject', '<p>Body</p>')
    expect(sendEmail).toHaveBeenCalledWith('client@example.com', 'Subject', '<p>Body</p>')
  })

  it('does not send when the notification type is disabled', async () => {
    const getEmail = vi.fn().mockResolvedValue('client@example.com')
    await sendNotificationEmail({ notification_preferences: { missedCall: false } }, 'missedCall', getEmail, 'Subject', '<p>Body</p>')
    expect(sendEmail).not.toHaveBeenCalled()
    expect(getEmail).not.toHaveBeenCalled()
  })

  it('does not throw if getEmail resolves to null', async () => {
    const getEmail = vi.fn().mockResolvedValue(null)
    await expect(sendNotificationEmail({ notification_preferences: {} }, 'missedCall', getEmail, 'Subject', '<p>Body</p>')).resolves.toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('does not throw if sendEmail itself rejects', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('Resend down'))
    const getEmail = vi.fn().mockResolvedValue('client@example.com')
    await expect(sendNotificationEmail({ notification_preferences: {} }, 'missedCall', getEmail, 'Subject', '<p>Body</p>')).resolves.toBeUndefined()
  })
})
