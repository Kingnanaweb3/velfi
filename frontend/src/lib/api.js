// One way to talk to the Velfi backend, plus small polling hooks for the data
// every screen shares. Polling pauses while the tab is hidden.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export const API = '/api'

export async function api(token, path, { method = 'GET', body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'ngrok-skip-browser-warning': 'true',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (r.status === 401 && d.reauth) { try { window.dispatchEvent(new Event('velfi:reauth')) } catch {} }
  if (!r.ok) throw Object.assign(new Error(d.error || 'Something went wrong. Try again.'), { status: r.status, data: d })
  return d
}

// Fetch `path` now, every `every` ms while visible, and the moment the tab comes back.
export function usePoll(path, every = 8000) {
  const { token } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const alive = useRef(true)
  const load = useCallback(async () => {
    if (!token || !path) return
    try { const d = await api(token, path); if (alive.current) { setData(d); setError(null) } }
    catch (e) { if (alive.current) setError(e) }
  }, [token, path])
  useEffect(() => {
    alive.current = true
    load()
    const t = every ? setInterval(() => { if (document.visibilityState === 'visible') load() }, every) : null
    const onShow = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onShow)
    return () => { alive.current = false; if (t) clearInterval(t); document.removeEventListener('visibilitychange', onShow) }
  }, [load, every])
  return { data, error, reload: load, loading: data === null && !error }
}

export const useBalances = () => usePoll('/account/balances', 10000)
export const useFlows = () => usePoll('/agent/flows', 8000)
export const useActivity = (limit = 6) => usePoll(`/agent/activity?limit=${limit}`, 15000)
export const useNotifications = () => usePoll('/account/notifications', 30000)

// Relative time in plain words.
export function ago(t) {
  if (!t) return ''
  const d = Date.now() - new Date(t).getTime()
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  if (d < 7 * 86_400_000) return `${Math.floor(d / 86_400_000)}d ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function dayLabel(t) {
  if (!t) return ''
  const d = new Date(t), n = new Date()
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, n)) return 'Today'
  const y = new Date(n); y.setDate(n.getDate() - 1)
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export const shortAddr = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '')

// Who a transaction was with, from the backend's activity rows.
export function counterparty(t) {
  return t.counterparty || String(t.label || '').replace(/^(Streamed to|Scheduled payment to|Sent to|Received from|Sent|Received|Swapped)\s*/i, '').trim() || (t.direction === 'in' ? 'Someone' : 'Payment')
}

// Hand text to the chat screen. `draft` fills the box for the person to finish;
// `say` sends it straight away.
export const draft = (text) => { try { sessionStorage.setItem('velfi_draft', text) } catch {} }
export const say = (text) => { try { sessionStorage.setItem('velfi_pending_msg', text) } catch {} }
