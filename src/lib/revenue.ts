/**
 * Estimated revenue contribution of a business's "booking requested" calls —
 * calls where Ellie sent an external booking link (e.g. Timely) rather than
 * creating an `appointments` row, so there's no real price to sum and no
 * confirmation the customer actually completed the booking. Unlike a real
 * appointment's revenue (summed exactly, elsewhere), this is a probabilistic
 * estimate: `linkedCallCount * conversionRatePct% * avgCustomerValueCents`.
 *
 * Both settings are admin-only, per-business, and nullable — either being
 * unset returns 0 rather than fabricating a number before an admin has
 * calibrated it for that business.
 */
export function estimatedLinkedRevenueCents(
  linkedCallCount: number,
  conversionRatePct: number | null,
  avgCustomerValueCents: number | null,
): number {
  if (conversionRatePct == null || avgCustomerValueCents == null) return 0
  return Math.round(linkedCallCount * (conversionRatePct / 100) * avgCustomerValueCents)
}
