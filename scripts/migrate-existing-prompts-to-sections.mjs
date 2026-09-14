#!/usr/bin/env node
// One-off migration: splits each live business's current Vapi system
// prompt into prompt_sections rows by markdown heading, defaulting every
// section to client_editable=false. Run once per business; safe to re-run
// (it's idempotent per business via a guard on existing sections).
//
// Usage: node scripts/migrate-existing-prompts-to-sections.mjs <business-id> <vapi-assistant-id>

import { createClient } from '@supabase/supabase-js'

const HEADING_RE = /^(#{1,3})\s+(.+)$/

function splitPromptIntoSections(promptText) {
  const lines = promptText.split('\n')
  const sections = []
  let current = null
  let preamble = []
  const flushPreamble = () => {
    const text = preamble.join('\n').trim()
    if (text) sections.push({ title: 'Introduction', headingLevel: 1, content: text })
    preamble = []
  }
  for (const line of lines) {
    const m = line.match(HEADING_RE)
    if (m) {
      if (current) sections.push({ ...current, content: current.content.trim() })
      else flushPreamble()
      current = { title: m[2].trim(), headingLevel: m[1].length, content: '' }
    } else if (current) {
      current.content += (current.content ? '\n' : '') + line
    } else {
      preamble.push(line)
    }
  }
  if (current) sections.push({ ...current, content: current.content.trim() })
  else flushPreamble()
  return sections
}

function joinSections(sections) {
  return sections.map(s => `${'#'.repeat(s.headingLevel)} ${s.title}\n\n${s.content}`).join('\n\n')
}

function normalizeWhitespace(text) {
  return text.split('\n').map(l => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function main() {
  const [businessId, assistantId] = process.argv.slice(2)
  if (!businessId || !assistantId) {
    console.error('Usage: node scripts/migrate-existing-prompts-to-sections.mjs <business-id> <vapi-assistant-id>')
    process.exit(1)
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Cross-check: verify the provided assistantId actually belongs to this business
  const { data: business, error: businessError } = await supabase.from('businesses').select('vapi_assistant_id').eq('id', businessId).single()
  if (businessError) throw new Error(`Failed to look up business ${businessId}: ${businessError.message}`)
  if (!business) throw new Error(`Business ${businessId} not found`)
  if (business.vapi_assistant_id !== assistantId) {
    throw new Error(`Assistant ID mismatch for business ${businessId}: expected ${business.vapi_assistant_id}, got ${assistantId}. This is likely a CLI argument error — double-check the business ID and assistant ID pairing.`)
  }

  const { data: existing, error } = await supabase.from('prompt_sections').select('id').eq('business_id', businessId).limit(1)
  if (error) throw new Error(`Failed to check for existing prompt_sections for ${businessId}: ${error.message}`)
  if (existing && existing.length > 0) {
    console.log(`Business ${businessId} already has prompt_sections — skipping (idempotent guard).`)
    return
  }

  const res = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
  })
  if (!res.ok) throw new Error(`Vapi fetch failed: ${res.status} ${await res.text()}`)
  const assistant = await res.json()
  const liveSystemPrompt = assistant.model?.messages?.find(m => m.role === 'system')?.content
  if (!liveSystemPrompt) throw new Error('No system message found on this assistant')

  const split = splitPromptIntoSections(liveSystemPrompt)
  if (split.length === 0) throw new Error('No markdown headings found — nothing to split. Migrate this one by hand.')

  const rejoined = joinSections(split)
  if (normalizeWhitespace(rejoined) !== normalizeWhitespace(liveSystemPrompt)) {
    console.error('Round-trip check FAILED — split+rejoin does not match the original (modulo whitespace). Aborting without writing anything.')
    console.error('--- original ---\n', liveSystemPrompt)
    console.error('--- rejoined ---\n', rejoined)
    process.exit(1)
  }
  console.log(`Round-trip check passed for business ${businessId} — ${split.length} sections.`)

  const rows = split.map((s, i) => ({
    business_id: businessId,
    key: `migrated_${i}_${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`,
    title: s.title,
    heading_level: s.headingLevel,
    kind: 'text',
    content: s.content,
    client_editable: false,
    sort_order: i,
  }))

  const { error: insertError } = await supabase.from('prompt_sections').insert(rows)
  if (insertError) throw new Error(insertError.message)

  console.log(`Inserted ${rows.length} sections for business ${businessId}. All client_editable=false — flip individual sections on from the admin Agent Details tab.`)
}

main().catch(err => { console.error(err); process.exit(1) })
