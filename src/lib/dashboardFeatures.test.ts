import { describe, expect, it } from 'vitest'
import { isFeatureEnabled, resolveDashboardFeatures } from './dashboardFeatures'

describe('isFeatureEnabled', () => {
  it('defaults to enabled when the key is absent', () => {
    expect(isFeatureEnabled({ dashboard_features: {} }, 'appointments')).toBe(true)
  })

  it('defaults to enabled when dashboard_features is null', () => {
    expect(isFeatureEnabled({ dashboard_features: null }, 'staff')).toBe(true)
  })

  it('defaults to enabled when business itself is null', () => {
    expect(isFeatureEnabled(null, 'staff')).toBe(true)
  })

  it('is disabled only on an explicit false', () => {
    expect(isFeatureEnabled({ dashboard_features: { appointments: false } }, 'appointments')).toBe(false)
  })

  it('treats an explicit true the same as absent', () => {
    expect(isFeatureEnabled({ dashboard_features: { staff: true } }, 'staff')).toBe(true)
  })
})

describe('resolveDashboardFeatures', () => {
  it('resolves every registry key, defaulting to true', () => {
    expect(resolveDashboardFeatures({ dashboard_features: { staff: false } })).toEqual({
      appointments: true,
      staff: false,
      sms: true,
    })
  })

  it('resolves all-true for a business with no dashboard_features set', () => {
    expect(resolveDashboardFeatures({})).toEqual({
      appointments: true,
      staff: true,
      sms: true,
    })
  })
})
