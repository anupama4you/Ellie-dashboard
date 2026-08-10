/**
 * Vapi's call recording storage is access-controlled — the raw URL that used
 * to sit in `calls.recording_url` isn't directly fetchable anymore (see
 * `src/app/api/recordings/[vapiCallId]/route.ts`, which exchanges it for a
 * fresh short-lived signed URL server-side). Every UI surface should build
 * playback/download links through this proxy path instead of using
 * `recording_url` directly.
 *
 * Lives outside `lib/calls.ts` (which imports the server-only Supabase
 * client) so client components can build the proxy URL without pulling that
 * import chain into the browser bundle.
 */
export function recordingProxyUrl(vapiCallId: string | null | undefined): string | undefined {
  return vapiCallId ? `/api/recordings/${vapiCallId}` : undefined
}
