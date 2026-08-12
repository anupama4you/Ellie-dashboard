// One-off data migration: copies every row from the old Supabase project to
// the new one (schema must already be pushed via `supabase db push`), and
// recreates auth users on the new project (fresh accounts, no password
// carried over — clients reset their password once via the existing "Send
// Password Reset Email" admin action after cutover).
//
// Reads all connection info from env vars — never hardcode keys here.
// Usage:
//   OLD_SUPABASE_URL=... OLD_SERVICE_KEY=... NEW_SUPABASE_URL=... NEW_SERVICE_KEY=... \
//     node scripts/migrate-to-new-project.mjs
//
// Safe to re-run: user creation skips existing emails, table rows use
// upsert-by-id, so a second run just confirms nothing changed.

import { createClient } from '@supabase/supabase-js'

const OLD_URL = process.env.OLD_SUPABASE_URL
const OLD_KEY = process.env.OLD_SERVICE_KEY
const NEW_URL = process.env.NEW_SUPABASE_URL
const NEW_KEY = process.env.NEW_SERVICE_KEY

for (const [name, val] of Object.entries({ OLD_URL, OLD_KEY, NEW_URL, NEW_KEY })) {
  if (!val) { console.error(`Missing env var for ${name}`); process.exit(1) }
}

const clientOpts = { auth: { autoRefreshToken: false, persistSession: false } }
const oldDb = createClient(OLD_URL, OLD_KEY, clientOpts)
const newDb = createClient(NEW_URL, NEW_KEY, clientOpts)

async function fetchAllUsers(client) {
  const all = []
  let page = 1
  const perPage = 200
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    all.push(...data.users)
    if (data.users.length < perPage) break
    page++
  }
  return all
}

async function fetchAllRows(client, table) {
  const all = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await client.from(table).select('*').range(from, from + pageSize - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

// The live "old" database can drift from what the migration files describe
// (e.g. a column a later migration dropped might still be sitting on the old
// project if that particular migration was never actually run there). Ask
// the new project's PostgREST for its real column list per table and only
// carry over columns that actually exist there, instead of assuming the old
// row shape matches.
async function getTableColumns(client, url, key, table) {
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' },
  })
  const spec = await res.json()
  const props = spec.definitions?.[table]?.properties
  if (!props) throw new Error(`Could not find schema for table "${table}" on ${url}`)
  return new Set(Object.keys(props))
}

function pickColumns(row, columns) {
  const out = {}
  for (const key of Object.keys(row)) {
    if (columns.has(key)) out[key] = row[key]
  }
  return out
}

async function upsertInChunks(client, table, rows, columns, chunkSize = 500) {
  const filtered = rows.map(r => pickColumns(r, columns))
  for (let i = 0; i < filtered.length; i += chunkSize) {
    const chunk = filtered.slice(i, i + chunkSize)
    const { error } = await client.from(table).upsert(chunk, { onConflict: 'id' })
    if (error) throw new Error(`${table} (rows ${i}-${i + chunk.length}): ${error.message}`)
  }
}

async function main() {
  console.log('=== Step 1: auth users ===')
  const oldUsers = await fetchAllUsers(oldDb)
  const newUsers = await fetchAllUsers(newDb)
  const newByEmail = new Map(newUsers.map(u => [u.email, u]))
  console.log(`old project: ${oldUsers.length} users · new project already has: ${newUsers.length}`)

  const idMap = new Map() // old auth.users.id -> new auth.users.id
  for (const u of oldUsers) {
    let match = newByEmail.get(u.email)
    if (!match) {
      const { data, error } = await newDb.auth.admin.createUser({
        email: u.email,
        email_confirm: true,
        user_metadata: u.user_metadata ?? {},
      })
      if (error) {
        console.error(`  FAILED to create ${u.email}: ${error.message}`)
        continue
      }
      match = data.user
      console.log(`  created ${u.email}`)
    } else {
      console.log(`  exists  ${u.email}`)
    }
    idMap.set(u.id, match.id)
  }

  console.log('\n=== Step 2: businesses ===')
  const businesses = await fetchAllRows(oldDb, 'businesses')
  let unmapped = 0
  const remappedBusinesses = businesses.map(b => {
    const newUserId = idMap.get(b.user_id)
    if (!newUserId) unmapped++
    return { ...b, user_id: newUserId ?? b.user_id }
  })
  if (unmapped) console.warn(`  WARNING: ${unmapped} business(es) have no matching migrated user — check the failures above`)
  const businessColumns = await getTableColumns(newDb, NEW_URL, NEW_KEY, 'businesses')
  await upsertInChunks(newDb, 'businesses', remappedBusinesses, businessColumns)
  console.log(`  migrated ${remappedBusinesses.length} businesses`)

  console.log('\n=== Step 3: dependent tables ===')
  const tables = ['appointments', 'business_services', 'business_faqs', 'calls', 'calendar_connections', 'customers']
  for (const table of tables) {
    const rows = await fetchAllRows(oldDb, table)
    const columns = await getTableColumns(newDb, NEW_URL, NEW_KEY, table)
    await upsertInChunks(newDb, table, rows, columns)
    console.log(`  ${table}: ${rows.length} rows`)
  }

  console.log('\n=== Verification (row counts, old vs new) ===')
  for (const table of ['businesses', ...tables]) {
    const { count: oldCount } = await oldDb.from(table).select('id', { count: 'exact', head: true })
    const { count: newCount } = await newDb.from(table).select('id', { count: 'exact', head: true })
    console.log(`  ${table.padEnd(20)} old=${oldCount ?? '?'}  new=${newCount ?? '?'}  ${oldCount === newCount ? 'OK' : 'MISMATCH'}`)
  }

  console.log('\nDone.')
}

main().catch(err => { console.error('Migration failed:', err); process.exit(1) })
