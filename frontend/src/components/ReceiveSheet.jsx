import { useState, useEffect } from 'react'
import { Copy, Check, Share2, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'

export default function ReceiveSheet({ open, onClose, username }) {
  const { token } = useAuth()
  const [copied, setCopied] = useState(false)
  const [addr, setAddr] = useState('')
  const [copiedAddr, setCopiedAddr] = useState(false)
  useEffect(() => {
    if (!open || !token) return
    fetch('/api/account/balances', { headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' } })
      .then(r => r.json()).then(d => setAddr(d.address || '')).catch(() => {})
  }, [open, token])
  if (!open) return null
  const shortAddr = addr ? addr.slice(0, 6) + '…' + addr.slice(-4) : '—'
  const handle = `${username || 'you'}.vel`
  const link = `https://velfi.xyz/pay/${username || ''}`
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(link)}`
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch {}
  }
  async function copyAddr() {
    if (!addr) return
    try { await navigator.clipboard.writeText(addr); setCopiedAddr(true); setTimeout(() => setCopiedAddr(false), 1600) } catch {}
  }
  async function share() {
    try { if (navigator.share) await navigator.share({ title: 'Pay me on Velfi', text: `Send me money on Velfi: ${handle}`, url: link }); else copy() } catch {}
  }
  return (
    <div className="rs-wrap" onClick={onClose}>
      <style>{RS_CSS}</style>
      <div className="rs-sheet" onClick={e => e.stopPropagation()}>
        <div className="rs-grab" />
        <button className="rs-x" onClick={onClose}><X size={20} /></button>
        <h2 className="rs-title">Receive</h2>
        <p className="rs-sub">Share your Velfi handle or link to get paid</p>
        <div className="rs-qr"><img src={qr} alt="Payment QR" /></div>
        <div className="rs-handle">{handle}</div>
        <button className="rs-link" onClick={copy}>
          <span className="rs-link-txt">velfi.xyz/pay/{username || ''}</span>
          {copied ? <Check size={17} color="var(--v-success)" /> : <Copy size={16} />}
        </button>
        <button className="rs-share" onClick={share}><Share2 size={17} /> Share link</button>
        {addr && (
          <div className="rs-deposit">
            <p className="rs-deposit-lbl">Or fund your wallet directly</p>
            <button className="rs-addr" onClick={copyAddr}>
              <span className="rs-addr-txt">{shortAddr}</span>
              {copiedAddr ? <Check size={17} color="var(--v-success)" /> : <Copy size={16} />}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const RS_CSS = `
.rs-wrap{ position:fixed; inset:0; z-index:300; background:rgba(20,12,30,0.45); backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); display:flex; align-items:flex-end; justify-content:center; animation:rsf .2s; }
@keyframes rsf{ from{opacity:0} to{opacity:1} }
.rs-sheet{ position:relative; width:100%; max-width:430px; background:var(--v-bg); border-radius:28px 28px 0 0; padding:10px 22px calc(26px + env(safe-area-inset-bottom)); text-align:center; animation:rsu .28s cubic-bezier(.2,.9,.3,1); box-shadow:0 -20px 60px -20px rgba(20,12,30,0.4); font-family:'DM Sans',system-ui,sans-serif; }
@keyframes rsu{ from{transform:translateY(100%)} to{transform:translateY(0)} }
.rs-grab{ width:40px; height:4px; border-radius:2px; background:var(--v-card-bd); margin:0 auto 14px; }
.rs-x{ position:absolute; top:14px; right:18px; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--v-chip); color:var(--v-sub); }
.rs-title{ font-size:24px; font-weight:700; color:var(--v-ink); letter-spacing:-0.4px; }
.rs-sub{ font-size:13px; font-weight:400; color:var(--v-sub); margin:3px 0 18px; }
.rs-qr{ width:184px; height:184px; margin:0 auto 16px; padding:12px; border-radius:20px; background:#fff; border:1px solid var(--v-card-bd); display:flex; align-items:center; justify-content:center; }
.rs-qr img{ width:100%; height:100%; border-radius:8px; }
.rs-handle{ font-size:22px; font-weight:700; color:var(--v-accent); margin-bottom:14px; }
.rs-link{ display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:14px 16px; border-radius:14px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); color:var(--v-ink); font-size:14px; font-weight:600; margin-bottom:10px; }
.rs-link-txt{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rs-share{ display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:15px; border-radius:16px; background:var(--v-accent); color:#fff; font-size:16px; font-weight:700; }
.rs-deposit{ margin-top:14px; padding-top:14px; border-top:1px solid var(--v-card-bd); }
.rs-deposit-lbl{ font-size:12px; color:var(--v-sub); margin-bottom:8px; text-align:left; }
.rs-addr{ display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:13px 16px; border-radius:14px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); color:var(--v-ink); font-size:14px; font-weight:600; font-family:ui-monospace,SFMono-Regular,monospace; }
.rs-addr-txt{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`
