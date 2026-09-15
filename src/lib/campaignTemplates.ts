/**
 * Starter scripts for the "New campaign" composer — picking one overwrites
 * both the opening line and behavior fields, same as typing them by hand;
 * nothing here is saved anywhere, it's purely a client-side starting point.
 *
 * `[Business]` is a literal placeholder for the client to replace with
 * their own name — createOutboundCall() (src/lib/outboundCampaign.ts)
 * REPLACES the assistant's entire system prompt for the call, so unlike a
 * normal inbound call, none of the business's identity/name from its usual
 * prompt carries over automatically.
 *
 * The review-request template's Google review link is likewise a literal
 * placeholder — there's no businesses.google_review_link column (nothing
 * asked for one yet), so it has to be pasted in by hand, same as booking
 * links are handled today (see PROJECT_CONTEXT.md's sendSms-based
 * businesses). Ideally shortened first (see src/lib/shortLinks.ts) to keep
 * the resulting SMS to one billed segment.
 */
export type CampaignTemplate = {
  key: string
  label: string
  description: string
  firstMessage: string
  systemPrompt: string
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    key: 'reviewRequest',
    label: 'Feedback & review request',
    description: 'Ask how a recent visit went — text a Google review link if it was positive, otherwise just thank them.',
    firstMessage: 'Hi {{customerName}}, this is Ellie calling on behalf of [Business] — have you got a quick minute to share how your recent visit went?',
    systemPrompt: `Ask how their recent visit or experience was. Keep it to one open question — don't interrogate them with a checklist.

If their answer is positive (great, excellent, happy, etc.):
Thank them warmly, then call sendSms with a short message containing this Google review link, and tell them on the call that you've sent it: [PASTE YOUR SHORTENED GOOGLE REVIEW LINK HERE]

If their answer is mixed, negative, or they raise a concern:
Do NOT ask for a review and do NOT send the link. Thank them for the honest feedback, apologise briefly if something went wrong, and let them know the team will follow up. Do not try to resolve the issue yourself on this call.

Keep the whole call short — this is a quick check-in, not a long conversation. Never claim a text was sent unless the tool call actually succeeded.`,
  },
  {
    key: 'winBack',
    label: 'We miss you / re-engagement',
    description: "For customers who haven't been in for a while — check in and offer to book them back in.",
    firstMessage: "Hi {{customerName}}, this is Ellie calling from [Business] — it's been a little while since your last visit, so I thought I'd check in.",
    systemPrompt: `Mention it's been a while since {{customerName}}'s last visit and ask if they'd like to book back in.

If they're interested, help them choose what they'd like and offer to book them in or text the booking link.

If they're not interested right now, thank them for their time and end the call politely — don't push, don't ask why, don't offer more than once.`,
  },
  {
    key: 'promotion',
    label: 'Promotion / new service',
    description: 'Let past customers know about a current offer or something new — light-touch, not salesy.',
    firstMessage: 'Hi {{customerName}}, this is Ellie calling from [Business] with a quick update.',
    systemPrompt: `Let {{customerName}} know about [describe the promotion or new service here] — keep it brief and conversational, not a sales pitch.

If they're interested, offer to book them in or text the booking link.

If they're not interested, thank them for their time and end the call politely — don't push or repeat the offer.`,
  },
  {
    key: 'reminder',
    label: 'Appointment reminder',
    description: 'Confirm an upcoming booking is still on, with an easy way to reschedule if not.',
    firstMessage: 'Hi {{customerName}}, this is Ellie calling from [Business] with a quick reminder about your upcoming appointment.',
    systemPrompt: `Confirm {{customerName}} is still able to make their upcoming appointment.

If yes, thank them and let them know you'll see them then — keep it brief.

If they need to reschedule or cancel, let them know the team will be in touch to sort out a new time, or text the booking link if one is available.

Do not invent or guess the appointment date/time if it wasn't supplied — refer to it only in general terms unless you actually have it.`,
  },
]
