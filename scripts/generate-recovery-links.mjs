// Bootstraps password-reset links for every migrated user without needing to
// already be logged in — same generateLink() + token_hash/type query-param
// pattern as sendPasswordReset() in admin/clients/[id]/page.tsx, just run
// standalone. Prints links to the terminal instead of emailing them.
//
// Usage:
//   SUPABASE_URL=... SERVICE_KEY=... SITE_URL=http://localhost:3000 \
//     node scripts/generate-recovery-links.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SERVICE_KEY
const SITE_URL = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '')

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_KEY')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

async function main() {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error

  for (const user of data.users) {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: user.email,
      options: { redirectTo: `${SITE_URL}/auth/callback?next=/auth/set-password` },
    })
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error(`FAILED for ${user.email}: ${linkErr?.message}`)
      continue
    }
    const url = `${SITE_URL}/auth/callback?next=/auth/set-password&token_hash=${linkData.properties.hashed_token}&type=recovery`
    console.log(`${user.email}\n  ${url}\n`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
