import { useEffect, useState } from 'react'

// The live $VELFI contract address. It is data the page fetches, not code it is
// built with, so it appears within 5 seconds of `./swap-ca.sh <address>`, even in
// tabs that are already open. The server only hands out an address after checking
// on-chain that it is a real token called VELFI; anything else shows UNVERIFIED.
type Config =
  | { status: 'pending' }
  | { status: 'unverified'; reason?: string }
  | { status: 'live'; address: string; symbol?: string; test?: boolean }

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export default function TokenCA() {
  const [cfg, setCfg] = useState<Config>({ status: 'pending' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch(`/api/token-config?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (!alive) return
        if (d.status === 'live' && B58.test(d.address || '')) setCfg({ status: 'live', address: d.address, symbol: d.symbol, test: !!d.test })
        else if (d.status === 'unverified') setCfg({ status: 'unverified', reason: d.reason })
        else setCfg({ status: 'pending' })
      } catch { /* keep what we have; try again in 5s */ }
    }
    load()
    // Keep polling after it goes live, so a correction still reaches open tabs.
    const id = setInterval(load, 5000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  const copy = async () => {
    if (cfg.status !== 'live') return
    try { await navigator.clipboard.writeText(cfg.address); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* ignore */ }
  }

  return (
    <div className="tk-ca">
      <span className="tk-ca-label">Contract address{cfg.status === 'live' && cfg.test ? <span className="tk-ca-test">Test · not $VELFI</span> : null}</span>
      {cfg.status === 'live' ? (
        <>
          <div className={cfg.test ? 'tk-ca-box tk-ca-box-live tk-ca-box-test' : 'tk-ca-box tk-ca-box-live'}>
            <span className="tk-ca-value tk-ca-addr">{cfg.address}</span>
            <button type="button" className="tk-ca-copy" onClick={copy} aria-label="Copy contract address">{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="tk-ca-links">
            <a href={`https://solscan.io/token/${cfg.address}`} target="_blank" rel="noreferrer">View on Solscan</a>
            {!cfg.test && <a href={`https://jup.ag/swap/SOL-${cfg.address}`} target="_blank" rel="noreferrer">Buy on Jupiter</a>}
          </div>
        </>
      ) : (
        <div className="tk-ca-box">
          <span className="tk-ca-value">{cfg.status === 'unverified' ? 'Unverified address' : 'Coming soon'}</span>
          <span className={cfg.status === 'unverified' ? 'tk-ca-soon tk-ca-bad' : 'tk-ca-soon'}>{cfg.status === 'unverified' ? 'Unverified' : 'Pending'}</span>
        </div>
      )}
      <p className="tk-ca-note">
        {cfg.status === 'live' && cfg.test
          ? 'This is a test of the address box using USDC. It is not $VELFI and $VELFI is not live yet. Watch '
          : cfg.status === 'unverified'
          ? 'The address set here did not check out on-chain as $VELFI, so it is hidden. Do not buy anything until it shows here and on '
          : 'Only trust the address posted here and on '}
        <a href="https://x.com/velfi_xyz" target="_blank" rel="noreferrer">@velfi_xyz</a>{cfg.status === 'live' && cfg.test ? ' for the real launch.' : '.'}{cfg.status === 'live' ? '' : ' Any $VELFI before then is fake.'}
      </p>
    </div>
  )
}
