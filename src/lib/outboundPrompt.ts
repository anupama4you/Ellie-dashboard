/**
 * Builds the per-call assistantOverrides Vapi uses for an outbound campaign
 * call — entirely separate from the assistant's own persistent (inbound)
 * config, so a campaign's instructions never affect how the assistant
 * answers a real inbound call. See createOutboundCall in lib/vapi.ts.
 */
export function buildOutboundSystemPrompt(businessName: string, instructions: string): string {
  return `You are Ellie, calling on behalf of ${businessName}. This is an outbound call you are placing — the person did not call you, so open accordingly rather than as if answering an inbound call. Follow these instructions for the entire call:\n\n${instructions}`
}

export function buildOutboundFirstMessage(businessName: string, contactName: string): string {
  return `Hi ${contactName}, this is Ellie calling from ${businessName}.`
}
