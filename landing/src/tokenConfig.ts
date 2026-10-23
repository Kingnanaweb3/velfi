import { useEffect, useState } from 'react'

// One shared poller for the live $VELFI address, used by the hero pill and the
// token section. It is data the page fetches (not code it is built with), so it
// appears within 5 seconds of `./scripts/swap-ca.sh`, even in tabs already open.
// The server only returns an address after checking it on-chain.
export type TokenConfig =
  | { status: 'pending' }
  | { status: 'unverified'; reason?: string }
  | { status: 'live'; address: string; symbol?: string; test?: boolean }

const EVM = /^0x[0-9a-fA-F]{40}$/
let current: TokenConfig = { status: 'pending' }
let currentKey = JSON.stringify(current)
const listeners = new Set<(c: TokenConfig) => void>()
let timer: ReturnType<typeof setInterval> | null = null

async function load() {
  try {
    const r = await fetch(`/api/token-config?t=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) return
    const d = await r.json()
    const next: TokenConfig =
      d.status === 'live' && EVM.test(d.address || '') ? { status: 'live', address: d.address, symbol: d.symbol, test: !!d.test }
      : d.status === 'unverified' ? { status: 'unverified', reason: d.reason }
      : { status: 'pending' }
    const key = JSON.stringify(next)
    if (key === currentKey) return
    current = next; currentKey = key
    listeners.forEach(f => f(current))
  } catch { /* keep the last answer; try again in 5s */ }
}
const onVisible = () => { if (document.visibilityState === 'visible') load() }

export function useTokenConfig(): TokenConfig {
  const [cfg, setCfg] = useState<TokenConfig>(current)
  useEffect(() => {
    listeners.add(setCfg)
    setCfg(current)
    if (!timer) {
      load()
      // Keep polling after it goes live, so a correction still reaches open tabs.
      timer = setInterval(load, 5000)
      document.addEventListener('visibilitychange', onVisible)
    }
    return () => {
      listeners.delete(setCfg)
      if (!listeners.size && timer) { clearInterval(timer); timer = null; document.removeEventListener('visibilitychange', onVisible) }
    }
  }, [])
  return cfg
}

// Copy the exact address (case preserved) and report success for a moment.
export function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* ignore */ }
  }
  return { copied, copy }
}
