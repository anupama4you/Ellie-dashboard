/**
 * Minimal in-memory stand-in for the Supabase JS client, covering only the
 * query patterns the webhook route actually uses (select/insert/update with
 * eq/neq/gte/order/limit/single). Not a general-purpose Supabase mock — just
 * enough to smoke-test book/reschedule/cancel/transfer without hitting a
 * real database. Also replicates the one production constraint that matters
 * for these tests: the partial unique index on
 * appointments(business_id, coalesce(staff_id, sentinel), scheduled_at)
 * where status <> 'cancelled' (see
 * 20260818090002_appointments_staff_slot_unique.sql) — a duplicate insert
 * returns the same Postgres error code (23505) the real DB would. staff_id is
 * coalesced to a sentinel the same way the real index does, so two NULL-staff
 * rows at the same slot still collide (today's behavior for staff-less
 * businesses) while two different real staff IDs at the same slot don't.
 */

const NO_STAFF_SENTINEL = '00000000-0000-0000-0000-000000000000'

type Row = Record<string, unknown>
type Op = 'eq' | 'neq' | 'gte' | 'lte' | 'in'

class Table {
  rows: Row[] = []
}

class QueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private filters: [string, Op, unknown][] = []
  private insertRows: Row[] = []
  private updatePatch: Row = {}
  private wantsSingle = false
  private orderKey?: string
  private limitN?: number

  constructor(private tableName: string, private table: Table) {}

  // `.select()` chained after `.insert()`/`.update()` just requests the
  // returned row shape in real Supabase — it doesn't change the operation.
  select(_cols?: string) { if (this.mode !== 'insert' && this.mode !== 'update' && this.mode !== 'delete') this.mode = 'select'; return this }
  insert(rows: Row | Row[]) { this.mode = 'insert'; this.insertRows = Array.isArray(rows) ? rows : [rows]; return this }
  update(patch: Row) { this.mode = 'update'; this.updatePatch = patch; return this }
  delete() { this.mode = 'delete'; return this }
  eq(k: string, v: unknown) { this.filters.push([k, 'eq', v]); return this }
  neq(k: string, v: unknown) { this.filters.push([k, 'neq', v]); return this }
  gte(k: string, v: unknown) { this.filters.push([k, 'gte', v]); return this }
  lte(k: string, v: unknown) { this.filters.push([k, 'lte', v]); return this }
  in(k: string, v: unknown[]) { this.filters.push([k, 'in', v]); return this }
  order(k: string) { this.orderKey = k; return this }
  limit(n: number) { this.limitN = n; return this }
  single() { this.wantsSingle = true; return this }

  private matches(row: Row): boolean {
    return this.filters.every(([k, op, v]) => {
      const rv = row[k]
      if (op === 'eq') return rv === v
      if (op === 'neq') return rv !== v
      if (op === 'gte') return (rv as string) >= (v as string)
      if (op === 'lte') return (rv as string) <= (v as string)
      if (op === 'in') return (v as unknown[]).includes(rv)
      return true
    })
  }

  private execute(): { data: unknown; error: unknown } {
    if (this.mode === 'insert') {
      const results: Row[] = []
      for (const raw of this.insertRows) {
        const row: Row = { id: raw.id ?? crypto.randomUUID(), ...raw }
        if (this.tableName === 'appointments' && row.status !== 'cancelled') {
          const staffKey = (row.staff_id as string | null | undefined) ?? NO_STAFF_SENTINEL
          const dup = this.table.rows.some(r =>
            r.business_id === row.business_id
            && ((r.staff_id as string | null | undefined) ?? NO_STAFF_SENTINEL) === staffKey
            && r.scheduled_at === row.scheduled_at
            && r.status !== 'cancelled',
          )
          if (dup) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        }
        this.table.rows.push(row)
        results.push(row)
      }
      if (this.wantsSingle) return { data: results[0] ?? null, error: null }
      return { data: results, error: null }
    }

    if (this.mode === 'update') {
      const matched = this.table.rows.filter(r => this.matches(r))
      matched.forEach(r => Object.assign(r, this.updatePatch))
      return { data: this.wantsSingle ? (matched[0] ?? null) : matched, error: null }
    }

    if (this.mode === 'delete') {
      this.table.rows = this.table.rows.filter(r => !this.matches(r))
      return { data: null, error: null }
    }

    let rows = this.table.rows.filter(r => this.matches(r))
    if (this.orderKey) {
      const key = this.orderKey
      rows = [...rows].sort((a, b) => ((a[key] as string) > (b[key] as string) ? 1 : -1))
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN)
    if (this.wantsSingle) {
      if (rows.length === 1) return { data: rows[0], error: null }
      return { data: null, error: { code: rows.length === 0 ? 'PGRST116' : 'multiple', message: 'no/multiple rows' } }
    }
    return { data: rows, error: null }
  }

  then<T1, T2>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }
}

export class FakeSupabase {
  private tables = new Map<string, Table>()

  private table(name: string): Table {
    if (!this.tables.has(name)) this.tables.set(name, new Table())
    return this.tables.get(name)!
  }

  /** Seed rows directly for test setup — bypasses the unique-constraint check on purpose. */
  seed(tableName: string, rows: Row[]) {
    this.table(tableName).rows.push(...rows)
  }

  rows(tableName: string): Row[] {
    return this.table(tableName).rows
  }

  /** Mimics the one Postgres RPC function this webhook calls — the atomic per-call scheduling-failure counter. */
  async rpc(fnName: string, params: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> {
    if (fnName === 'increment_call_scheduling_failures') {
      const callId = params.p_call_id as string
      const table = this.table('call_scheduling_failures')
      let row = table.rows.find(r => r.call_id === callId)
      if (!row) {
        row = { call_id: callId, attempts: 0 }
        table.rows.push(row)
      }
      row.attempts = (row.attempts as number) + 1
      return { data: row.attempts, error: null }
    }
    return { data: null, error: { message: `FakeSupabase: unknown RPC function "${fnName}"` } }
  }

  from(tableName: string) {
    return new QueryBuilder(tableName, this.table(tableName))
  }
}
