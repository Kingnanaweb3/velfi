import { useState, useEffect } from 'react'
import { ArrowUpRight, ArrowDownLeft, SlidersHorizontal } from 'lucide-react'

const fmtAmt = (n) => { const v = Number(n); return Number.isFinite(v) ? v.toLocaleString(undefined, { maximumFractionDigits: 4 }) : n }
function dateLabel(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const same = (a, b) => a.toDateString() === b.toDateString()
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (same(d, now)) return `Today, ${time}`
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (same(d, y)) return `Yesterday, ${time}`
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`
}

export default function ActivityModal({ open, onClose, token }) {
  const [tab, setTab] = useState('all')
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!open) return
    let alive = true
    setRows(null)
    fetch('/api/agent/activity?limit=50', { headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.json()).then(d => { if (alive) setRows(d.transactions || []) })
      .catch(() => { if (alive) setRows([]) })
    return () => { alive = false }
  }, [open, token])
  if (!open) return null
  const list = (rows || []).filter(t => tab === 'all' ? true : tab === 'sent' ? t.direction === 'out' : t.direction === 'in')
  return (
    <div className="am-wrap" onClick={onClose}>
      <style>{AM_CSS}</style>
      <div className="am-sheet" onClick={e => e.stopPropagation()}>
        <div className="am-grab" />
        <div className="am-head">
          <div><h2 className="am-title">Activity</h2><p className="am-sub">Your recent transactions and payments</p></div>
          <button className="am-filter"><SlidersHorizontal size={15} /> Filter</button>
        </div>
        <div className="am-tabs">
          {['all', 'sent', 'received'].map(t => (
            <button key={t} className={`am-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>
        <div className="am-list">
          {rows === null ? <div className="am-empty">Loading…</div>
            : list.length === 0 ? <div className="am-empty">No transactions yet</div>
            : list.map(t => {
              const out = t.direction === 'out'
              const action = t.type === 'stream' ? 'Streamed' : t.type === 'schedule' ? 'Scheduled' : (out ? 'Sent' : 'Received')
              const who = t.counterparty || (t.label || '').replace(/^(Sent to|Received from|Streamed to|Scheduled to|Sent|Received|Streamed|Scheduled)\s*/i, '').trim() || (out ? 'recipient' : 'sender')
              return (
                <div className="am-row" key={t.id}>
                  <span className={`am-ic ${out ? 'out' : 'in'}`}>{out ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}</span>
                  <div className="am-mid">
                    <p className="am-name">{who}</p>
                    <p className="am-meta">{action}{t.amount != null ? ` · ${fmtAmt(t.amount)} ${t.token || ''}` : ''}</p>
                    <p className="am-time">{dateLabel(t.created_at)}</p>
                  </div>
                  <div className="am-right">
                    <p className={`am-amt ${out ? 'out' : 'in'}`}>{out ? '-' : '+'}{t.amount != null ? fmtAmt(t.amount) : ''} <span>{t.token || ''}</span></p>
                    <span className="am-badge">Completed</span>
                  </div>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}

const AM_CSS = `
.am-wrap{ position:fixed; inset:0; z-index:300; background:rgba(20,12,30,0.45); -webkit-backdrop-filter:blur(4px); backdrop-filter:blur(4px); display:flex; align-items:flex-end; justify-content:center; animation:amf .2s; }
@keyframes amf{ from{opacity:0} to{opacity:1} }
.am-sheet{ width:100%; max-width:430px; max-height:88vh; display:flex; flex-direction:column; background:var(--v-bg); border-radius:28px 28px 0 0; padding:10px 18px calc(20px + env(safe-area-inset-bottom)); animation:amu .28s cubic-bezier(.2,.9,.3,1); box-shadow:0 -20px 60px -20px rgba(20,12,30,0.4); font-family:var(--font-body); }
@keyframes amu{ from{transform:translateY(100%)} to{transform:translateY(0)} }
.am-grab{ width:40px; height:4px; border-radius:2px; background:var(--v-card-bd); margin:0 auto 14px; }
.am-head{ display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:14px; }
.am-title{ font-size:24px; font-weight:700; color:var(--v-ink); letter-spacing:-0.4px; }
.am-sub{ font-size:13px; font-weight:400; color:var(--v-sub); margin-top:2px; }
.am-filter{ display:inline-flex; align-items:center; gap:6px; padding:8px 13px; border-radius:999px; border:1px solid var(--v-card-bd); background:var(--v-card-solid); color:var(--v-ink); font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif; flex-shrink:0; }
.am-tabs{ display:flex; gap:4px; background:var(--v-chip); border-radius:14px; padding:4px; margin-bottom:14px; }
.am-tab{ flex:1; padding:10px; border-radius:11px; background:none; color:var(--v-ink); font-size:14px; font-weight:600; font-family:'DM Sans',sans-serif; }
.am-tab.on{ background:var(--v-accent); color:#fff; box-shadow:0 4px 12px -4px rgba(123,79,255,0.5); }
.am-list{ flex:1; overflow-y:auto; scrollbar-width:none; display:flex; flex-direction:column; gap:10px; padding-bottom:8px; }
.am-list::-webkit-scrollbar{ display:none; }
.am-empty{ text-align:center; padding:40px 0; color:var(--v-sub); font-size:14px; }
.am-row{ display:flex; align-items:center; gap:13px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); border-radius:18px; padding:14px; }
.am-ic{ width:46px; height:46px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.am-ic.out{ background:rgba(123,79,255,0.12); color:var(--v-accent); }
.am-ic.in{ background:rgba(41,209,125,0.14); color:#1DB866; }
.am-mid{ flex:1; min-width:0; }
.am-name{ font-size:15px; font-weight:700; color:var(--v-ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.am-meta{ font-size:13px; font-weight:400; color:var(--v-sub); margin-top:2px; }
.am-time{ font-size:12px; font-weight:400; color:var(--v-sub); margin-top:3px; }
.am-right{ text-align:right; flex-shrink:0; }
.am-amt{ font-size:15px; font-weight:700; white-space:nowrap; }
.am-amt span{ font-size:12px; font-weight:600; }
.am-amt.out{ color:var(--v-ink); }
.am-amt.in{ color:var(--v-accent); }
.am-badge{ display:inline-block; margin-top:6px; padding:3px 9px; border-radius:999px; background:rgba(123,79,255,0.12); color:var(--v-accent); font-size:11px; font-weight:600; }
`
