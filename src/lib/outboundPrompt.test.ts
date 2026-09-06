import { describe, expect, it } from 'vitest'
import { buildOutboundSystemPrompt, buildOutboundFirstMessage } from './outboundPrompt'

describe('buildOutboundSystemPrompt', () => {
  it('grounds Ellie in the business name, marks the call as outbound, and includes the instructions verbatim', () => {
    const prompt = buildOutboundSystemPrompt('Test Co', 'Ask if they want to rebook a haircut this week.')
    expect(prompt).toContain('Test Co')
    expect(prompt).toContain('outbound call')
    expect(prompt).toContain('Ask if they want to rebook a haircut this week.')
  })
})

describe('buildOutboundFirstMessage', () => {
  it('greets the contact by name and names the business', () => {
    expect(buildOutboundFirstMessage('Test Co', 'Sarah')).toBe('Hi Sarah, this is Ellie calling from Test Co.')
  })
})
