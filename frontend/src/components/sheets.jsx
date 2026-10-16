// Sheets opened from more than one screen: Receive, Tokens, Activity, Alerts.
import { useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Repeat, Copy, Check, Share2, Bell, ArrowLeftRight } from 'lucide-react'
import { Sheet, Row, Empty, Seg, Pill, Skeleton, useCopy, fmtAmt, fmtUsd } from '../ui/kit.jsx'
import { usePoll, ago, dayLabel, counterparty, shortAddr } from '../lib/api.js'
import { explorerTx, explorerAddress, CLUSTER, EXPLORER_NAME } from '../lib/chain.js'
import solCoin from '../assets/sol_coin.svg'
import usdcCoin from '../assets/usdc_coin.png'

export const coinFor = (sym) => (sym === 'SOL' ? solCoin : sym === 'USDC' ? usdcCoin : null)
export const isMainnet = CLUSTER === 'mainnet-beta'

// ── Receive ──────────────────────────────────────────────────────────────
export function ReceiveSheet({ open, onClose, username, address }) {
  const { copied, copy } = useCopy()
  const handle = `${username || 'you'}.vel`
  const qr = address ? `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=0&data=${encodeURIComponent(address)}` : null
  async function share() {
    const text = `Pay me on Velfi: ${handle}${address ? `\nOr send USDC or SOL on Solana to ${address}` : ''}`
    try { if (navigator.share) await navigator.share({ title: 'Pay me on Velfi', text }); else copy(text, 'share') } catch {}
  }
  return (
    <Sheet open={open} onClose={onClose} title="Receive">
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10, paddingTop: 4 }}>
        <div style={{ width: 196, height: 196, borderRadius: 28, background: '#fff', padding: 16, boxShadow: 'var(--shadow-card)' }}>
          {qr ? <img src={qr} alt="QR code of your wallet address" width="164" height="164" /> : <Skeleton h={164} r={12} />}
        </div>
        <p style={{ fontSize: 28, fontWeight: 500, letterSpacing: '-.03em' }}>{handle}</p>
        <p className="eyebrow" style={{ textAlign: 'center' }}>Friends on Velfi can pay this name</p>
      </div>
      <div className="panel" style={{ boxShadow: 'none', background: 'var(--card-2)', padding: '6px 16px' }}>
        <Row title="Your .vel name" sub={handle} onClick={() => copy(handle, 'h')} chevron={copied === 'h' ? <Check size={18} /> : <Copy size={17} />} />
        <Row title="Wallet address" sub={address ? shortAddr(address) + ' · for other apps and exchanges' : 'Loading…'} onClick={() => address && copy(address, 'a')} chevron={copied === 'a' ? <Check size={18} /> : <Copy size={17} />} />
      </div>
      <p className="flow-note warn">Only send USDC or SOL on the Solana network{isMainnet ? '' : ' (this is a test network)'}. Money sent on another network can't be recovered.</p>
      <button className="btn primary block" onClick={share}><Share2 size={18} /> {copied === 'share' ? 'Copied' : 'Share'}</button>
    </Sheet>
  )
}

// ── Tokens ───────────────────────────────────────────────────────────────
export function TokensSheet({ open, onClose, tokens = [], total = 0, address }) {
  const list = [...tokens].sort((a, b) => (b.usd || 0) - (a.usd || 0))
  return (
    <Sheet open={open} onClose={onClose} title="Your money">
      <div style={{ textAlign: 'center' }}>
        <p className="amount-big">{fmtUsd(total)}</p>
        <p className="eyebrow" style={{ marginTop: 6 }}>{list.length} {list.length === 1 ? 'token' : 'tokens'} in your wallet</p>
      </div>
      <ul className="feed">
        {list.length === 0 && <li><Empty title="Nothing here yet">Add USDC or SOL from Receive and it shows up here.</Empty></li>}
        {list.map(t => (
          <li key={t.mint}>
            <Row icon={coinFor(t.symbol) ? <img src={coinFor(t.symbol)} alt="" /> : (t.symbol || '?')[0]} title={t.name || t.symbol}
              sub={`${fmtAmt(t.human)} ${t.symbol}`} end={t.usd != null ? fmtUsd(t.usd) : '—'} endSub={t.recognized ? null : 'No price'} />
          </li>
        ))}
      </ul>
      {address && <a className="btn ghost block" href={explorerAddress(address)} target="_blank" rel="noreferrer">See your wallet on {EXPLORER_NAME}</a>}
    </Sheet>
  )
}

// ── Activity ─────────────────────────────────────────────────────────────
export function txIcon(t) {
  if (t.type === 'swap') return { icon: <ArrowLeftRight size={18} />, tone: 'accent' }
  if (t.type === 'schedule' || t.type === 'stream') return { icon: <Repeat size={18} />, tone: 'accent' }
  return t.direction === 'in' ? { icon: <ArrowDownLeft size={18} />, tone: 'good' } : { icon: <ArrowUpRight size={18} />, tone: '' }
}
export function txVerb(t) {
  if (t.type === 'swap') return 'Swap'
  if (t.type === 'schedule') return 'Scheduled'
  if (t.type === 'stream') return 'Stream'
  return t.direction === 'in' ? 'Received' : 'Sent'
}
export function TxRow({ t }) {
  const { icon, tone } = txIcon(t)
  const inbound = t.direction === 'in'
  return (
    <Row icon={icon} tone={tone} title={counterparty(t)} sub={`${txVerb(t)} · ${ago(t.created_at)}`}
      end={t.amount != null ? `${inbound ? '+' : '−'}${fmtAmt(t.amount)} ${t.token || ''}` : '—'} endTone={inbound ? 'in' : ''}
      href={t.digest ? explorerTx(t.digest) : undefined} />
  )
}

export function ActivityList({ rows, filter = 'all' }) {
  const list = (rows || []).filter(t => filter === 'all' || (filter === 'in' ? t.direction === 'in' : t.direction !== 'in'))
  const groups = useMemo(() => {
    const out = []
    for (const t of list) {
      const d = dayLabel(t.created_at)
      if (!out.length || out[out.length - 1].day !== d) out.push({ day: d, rows: [] })
      out[out.length - 1].rows.push(t)
    }
    return out
  }, [list])
  if (rows === null) return <div style={{ display: 'grid', gap: 10 }}><Skeleton h={56} /><Skeleton h={56} /><Skeleton h={56} /></div>
  if (!list.length) return <Empty title={filter === 'in' ? 'Nothing received yet' : filter === 'out' ? 'Nothing sent yet' : 'No payments yet'}>When money moves, it shows up here with a public receipt you can check.</Empty>
  return groups.map(g => (
    <div key={g.day} style={{ marginTop: 6 }}>
      <p className="eyebrow" style={{ padding: '8px 0 2px' }}>{g.day}</p>
      <ul className="feed">{g.rows.map(t => <li key={t.id || t.digest || t.created_at}><TxRow t={t} /></li>)}</ul>
    </div>
  ))
}

export function ActivitySheet({ open, onClose }) {
  const { data } = usePoll(open ? '/agent/activity?limit=50' : null, 0)
  const [filter, setFilter] = useState('all')
  return (
    <Sheet open={open} onClose={onClose} title="Activity">
      <Seg label="Show" value={filter} onChange={setFilter} options={[{ id: 'all', label: 'All' }, { id: 'out', label: 'Sent' }, { id: 'in', label: 'Received' }]} />
      <div><ActivityList rows={data ? data.transactions || [] : null} filter={filter} /></div>
    </Sheet>
  )
}

// ── Alerts ───────────────────────────────────────────────────────────────
const SEEN = 'velfi_alerts_seen'
export function lastSeenAlerts() { try { return Number(localStorage.getItem(SEEN) || 0) } catch { return 0 } }
export function markAlertsSeen() { try { localStorage.setItem(SEEN, String(Date.now())) } catch {} }

export function AlertsSheet({ open, onClose, items }) {
  return (
    <Sheet open={open} onClose={onClose} title="Alerts">
      {items === null ? <Skeleton h={120} /> : !items?.length
        ? <Empty title="You're all caught up">Payments, schedules and invites will let you know here.</Empty>
        : <ul className="feed">{items.map(n => (
            <li key={n.id}>
              <Row icon={<Bell size={17} />} tone={/fail|refund/.test(n.type || '') ? 'warn' : n.type === 'payment_received' ? 'good' : ''}
                title={n.title || 'Update'} sub={`${n.body ? n.body + ' · ' : ''}${ago(n.created_at)}`} href={n.action_url || undefined} />
            </li>))}
          </ul>}
      {!isMainnet && <Pill tone="amber">Test network: these are not real funds</Pill>}
    </Sheet>
  )
}
