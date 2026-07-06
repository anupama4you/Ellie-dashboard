'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { buildAssistantConfig } from '@/lib/assistantPrompt'
import type { Hours, TransferRule, ServiceDraft, FaqDraft } from '@/app/(dashboard)/briefing/actions'
import { adminSaveSystemPrompt } from '@/app/admin/clients/[id]/prompt/actions'

type Props = {
  businessId: string
  businessName: string
  initialFirstMessage: string
  initialSystemPrompt: string
  briefing: {
    greeting: string
    customInstructions: string
    hours: Hours
    transferRules: TransferRule[]
    services: ServiceDraft[]
    faqs: FaqDraft[]
  }
}

export default function SystemPromptEditor({ businessId, businessName, initialFirstMessage, initialSystemPrompt, briefing }: Props) {
  const [firstMessage, setFirstMessage] = useState(initialFirstMessage)
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt)
  const [isPending, startTransition]    = useTransition()
  const [status, setStatus]             = useState<'idle' | 'saved' | 'error'>('idle')

  function regenerateFromBriefing() {
    const generated = buildAssistantConfig({
      businessName,
      greeting: briefing.greeting,
      customInstructions: briefing.customInstructions,
      hours: briefing.hours,
      services: briefing.services.map(s => ({ name: s.name, durationMinutes: s.durationMinutes, priceCents: s.priceCents })),
      faqs: briefing.faqs,
      transferRules: briefing.transferRules,
    })
    setFirstMessage(generated.firstMessage)
    setSystemPrompt(generated.systemPrompt)
  }

  function save() {
    startTransition(async () => {
      try {
        await adminSaveSystemPrompt(businessId, { firstMessage, systemPrompt })
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2500)
      } catch {
        setStatus('error')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-extrabold" style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text)' }}>
            System prompt
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--t3)' }}>
            What&apos;s actually live on Vapi right now. Edits here push straight to the real assistant.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status === 'saved' && <span className="text-sm font-semibold" style={{ color: 'var(--signal)' }}>Saved &amp; pushed to Vapi</span>}
          {status === 'error' && <span className="text-sm font-semibold" style={{ color: 'var(--coral)' }}>Failed to save</span>}
          <button
            onClick={regenerateFromBriefing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            <RefreshCw size={12} /> Regenerate from Briefing
          </button>
          <button
            onClick={save}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: 'var(--violet)' }}
          >
            {isPending ? 'Saving…' : 'Save & push to Vapi'}
          </button>
        </div>
      </div>

      <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Greeting (first message)</h2>
        </div>
        <div className="p-5">
          <textarea
            value={firstMessage}
            onChange={e => setFirstMessage(e.target.value)}
            rows={2}
            className="w-full rounded-xl p-3 text-sm"
            style={{ border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }}
          />
        </div>
      </section>

      <section className="rounded-2xl" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="font-bold text-[1.05rem]" style={{ fontFamily: 'var(--font-display)', color: 'var(--text)' }}>System prompt</h2>
        </div>
        <div className="p-5">
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            rows={26}
            className="w-full rounded-xl p-3 text-sm font-mono"
            style={{ border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical' }}
          />
        </div>
      </section>
    </div>
  )
}
