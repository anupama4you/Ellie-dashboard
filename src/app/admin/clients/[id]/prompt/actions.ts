'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncAssistantPrompt } from '@/lib/vapi'
import { assertAdmin } from '@/lib/adminAuth'
import { compileSystemPrompt, mapSectionRow, type SectionKind, type PromptSection } from '@/lib/promptSections'
import type { StructuredDraft } from '@/lib/briefing'

async function loadCompiledPrompt(admin: ReturnType<typeof createAdminClient>, businessId: string) {
  const [{ data: biz }, { data: sectionRows }, { data: services }, { data: staff }] = await Promise.all([
    admin.from('businesses').select('hours').eq('id', businessId).single(),
    admin.from('prompt_sections').select('*').eq('business_id', businessId).order('sort_order'),
    admin.from('business_services').select('*').eq('business_id', businessId).order('sort_order'),
    admin.from('business_staff').select('*').eq('business_id', businessId).order('sort_order'),
  ])
  const sections = (sectionRows ?? []).map(mapSectionRow)
  return compileSystemPrompt(sections, {
    hours: biz?.hours,
    services: (services ?? []).map(s => ({ name: s.name, durationMinutes: s.duration_minutes, priceCents: s.price_cents })),
    staff: (staff ?? []).map(s => ({ name: s.name, active: s.active, hours: s.hours })),
  })
}

/** Admin authoring a section's live content directly — no draft cycle, no client submission involved. Recompiles and pushes immediately. */
export async function saveSectionDirect(businessId: string, sectionId: string, content: string): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()

  const { error } = await admin.from('prompt_sections').update({ content }).eq('id', sectionId).eq('business_id', businessId)
  if (error) throw new Error(error.message)

  const { data: biz } = await admin.from('businesses').select('vapi_assistant_id, greeting_script, name').eq('id', businessId).single()
  if (!biz?.vapi_assistant_id) throw new Error('No Vapi assistant connected to this business')

  const systemPrompt = await loadCompiledPrompt(admin, businessId)
  await syncAssistantPrompt(biz.vapi_assistant_id, { firstMessage: biz.greeting_script || `Thanks for calling ${biz.name}, this is Ellie. How can I help you today?`, systemPrompt })

  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

export async function addSection(businessId: string, input: { title: string; headingLevel: 1 | 2 | 3; kind: SectionKind; clientEditable: boolean }): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()

  const { data: existing } = await admin.from('prompt_sections').select('sort_order').eq('business_id', businessId).order('sort_order', { ascending: false }).limit(1)
  const nextSortOrder = (existing?.[0]?.sort_order ?? -1) + 1
  const key = `${input.kind}_${Date.now()}`

  const { error } = await admin.from('prompt_sections').insert({
    business_id: businessId,
    key,
    title: input.title,
    heading_level: input.headingLevel,
    kind: input.kind,
    content: input.kind === 'text' ? '' : null,
    client_editable: input.clientEditable,
    sort_order: nextSortOrder,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

export async function removeSection(businessId: string, sectionId: string): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('prompt_sections').delete().eq('id', sectionId).eq('business_id', businessId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

/** Persists a full reordered id list as the new sort_order sequence. */
export async function reorderSections(businessId: string, orderedIds: string[]): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()
  for (const [i, id] of orderedIds.entries()) {
    const { error } = await admin.from('prompt_sections').update({ sort_order: i }).eq('id', id).eq('business_id', businessId)
    if (error) throw new Error(error.message)
  }
  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

export async function setSectionEditable(businessId: string, sectionId: string, clientEditable: boolean): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('prompt_sections').update({ client_editable: clientEditable }).eq('id', sectionId).eq('business_id', businessId)
  if (error) throw new Error(error.message)
  revalidatePath(`/admin/clients/${businessId}/prompt`)
}

/**
 * Promotes every pending draft (text sections' draft_content, plus the
 * structured draft_briefing blob) to live, diff-syncing staff by id and
 * delete/reinserting services exactly as the old applyDraftAndPushPrompt
 * did (appointments.staff_id FKs into business_staff, so staff can't be
 * delete-all-reinserted). Then recompiles the whole document and pushes to
 * Vapi. DB writes happen before the Vapi push; on Vapi failure the pending
 * flag is deliberately left set rather than rolled back.
 */
export async function applyPendingChanges(businessId: string, expectedBriefingUpdatedAt: string | null): Promise<void> {
  await assertAdmin()
  const admin = createAdminClient()

  const { data: biz } = await admin
    .from('businesses')
    .select('vapi_assistant_id, draft_briefing, briefing_updated_at, name')
    .eq('id', businessId)
    .single()

  if (!biz?.vapi_assistant_id) throw new Error('No Vapi assistant connected to this business')
  if (biz.briefing_updated_at !== expectedBriefingUpdatedAt) {
    throw new Error('The client has submitted newer changes since this page loaded — refresh and review before applying.')
  }

  const draft = biz.draft_briefing as StructuredDraft | null

  if (draft) {
    const { error: bizError } = await admin.from('businesses').update({
      greeting_script: draft.greetingScript,
      hours: draft.hours,
      transfer_phone_number: draft.transferPhoneNumber || null,
    }).eq('id', businessId)
    if (bizError) throw new Error(bizError.message)

    const { data: liveStaffRows } = await admin.from('business_staff').select('id').eq('business_id', businessId)
    const liveStaffIds = new Set((liveStaffRows ?? []).map(r => r.id))
    const draftStaffIds = new Set((draft.staff ?? []).filter(s => s.id).map(s => s.id!))

    const removedStaffIds = [...liveStaffIds].filter(id => !draftStaffIds.has(id))
    if (removedStaffIds.length > 0) {
      const { error } = await admin.from('business_staff').delete().in('id', removedStaffIds)
      if (error) throw new Error(error.message)
    }
    for (const [i, s] of (draft.staff ?? []).entries()) {
      if (s.id && liveStaffIds.has(s.id)) {
        const { error } = await admin.from('business_staff').update({ name: s.name, active: s.active, hours: s.hours, sort_order: i }).eq('id', s.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await admin.from('business_staff').insert({ business_id: businessId, name: s.name, active: s.active, hours: s.hours, sort_order: i })
        if (error) throw new Error(error.message)
      }
    }

    const { error: delServicesError } = await admin.from('business_services').delete().eq('business_id', businessId)
    if (delServicesError) throw new Error(delServicesError.message)
    if (draft.services.length > 0) {
      const { error } = await admin.from('business_services').insert(
        draft.services.map((s, i) => ({ business_id: businessId, name: s.name, duration_minutes: s.durationMinutes, price_cents: s.priceCents, sort_order: i }))
      )
      if (error) throw new Error(error.message)
    }
  }

  const { data: pendingSections } = await admin.from('prompt_sections').select('id, draft_content').eq('business_id', businessId).not('draft_content', 'is', null)
  for (const s of pendingSections ?? []) {
    const { error } = await admin.from('prompt_sections').update({ content: s.draft_content, draft_content: null }).eq('id', s.id)
    if (error) throw new Error(error.message)
  }

  const systemPrompt = await loadCompiledPrompt(admin, businessId)
  const { data: freshBiz } = await admin.from('businesses').select('greeting_script, name').eq('id', businessId).single()
  await syncAssistantPrompt(biz.vapi_assistant_id, {
    firstMessage: freshBiz?.greeting_script || `Thanks for calling ${freshBiz?.name ?? biz.name}, this is Ellie. How can I help you today?`,
    systemPrompt,
  })

  await admin.from('businesses').update({ draft_briefing: null, briefing_needs_review: false }).eq('id', businessId)

  revalidatePath(`/admin/clients/${businessId}/prompt`)
  revalidatePath('/admin/clients')
}
