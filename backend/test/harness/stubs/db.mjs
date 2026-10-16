// In-memory Supabase: enough of the query builder for these routes.
export const tables = {}
let seq = 1
const T = (n) => (tables[n] ||= [])
function q(name) {
  let rows = () => T(name), filters = [], op = 'select', payload = null, single = false, maybe = false, opts = {}
  const apply = () => T(name).filter(r => filters.every(f => f(r)))
  const run = () => {
    if (op === 'insert') {
      const items = (Array.isArray(payload) ? payload : [payload]).map(p => ({ id: String(seq++), created_at: new Date().toISOString(), ...p }))
      T(name).push(...items)
      return single ? items[0] : items
    }
    if (op === 'upsert') {
      const key = opts.onConflict
      const ex = T(name).find(r => r[key] === payload[key])
      if (ex) Object.assign(ex, payload); else T(name).push({ id: String(seq++), ...payload })
      return null
    }
    if (op === 'update') { const hit = apply(); hit.forEach(r => Object.assign(r, payload)); return single ? hit[0] : hit }
    const hit = apply()
    return single ? (hit[0] ?? null) : hit
  }
  const b = {
    select() { return b }, order() { return b }, limit() { return b },
    eq(k, v) { filters.push(r => r[k] === v); return b },
    lte(k, v) { filters.push(r => r[k] <= v); return b },
    contains(k, v) { filters.push(r => JSON.stringify(r[k] || []).includes(JSON.stringify(v[0]).slice(1, -1))); return b },
    insert(p) { op = 'insert'; payload = p; return b },
    update(p) { op = 'update'; payload = p; return b },
    upsert(p, o) { op = 'upsert'; payload = p; opts = o || {}; return b },
    single() { single = true; return b },
    maybeSingle() { single = true; maybe = true; return b },
    then(res, rej) {
      try {
        const data = run()
        const error = single && !maybe && op === 'select' && !data ? { message: 'not found' } : null
        return Promise.resolve({ data, error }).then(res, rej)
      } catch (e) { return Promise.reject(e).then(res, rej) }
    },
  }
  return b
}
const db = { from: q }
export default db
