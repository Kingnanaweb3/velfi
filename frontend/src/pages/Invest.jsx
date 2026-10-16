import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Wallet, Sparkles, Shield, ChevronRight, ArrowRight } from 'lucide-react'
import solCoin from '../assets/sol_coin.svg'

// No made-up yields or TVL: these are what Velfi plans to support on Solana.
// Only swaps (through Jupiter) exist today, and only on mainnet.
const PICKS = [
  { id: 'swap', name: 'Swap with Jupiter', tag: 'Trading', desc: 'Swap SOL, USDC and more at the best route across Solana. Just ask Velfi.', mlabel: 'Status', metric: 'Mainnet', color: '#15151f', letter: 'J' },
  { id: 'stake', name: 'Stake SOL', tag: 'Staking', desc: 'Earn network rewards on SOL and keep it liquid.', mlabel: 'Status', metric: 'Coming soon', color: '#7B4FFF', letter: 'S' },
  { id: 'earn', name: 'Earn on USDC', tag: 'Lending', desc: 'Put idle dollars to work with established Solana lending markets.', mlabel: 'Status', metric: 'Coming soon', color: '#2775CA', letter: 'E' },
  { id: 'save', name: 'Save automatically', tag: 'Autopilot', desc: 'Move a share of every payment you receive into savings.', mlabel: 'Status', metric: 'Coming soon', color: '#0FB5A6', letter: 'A' },
]

export default function Invest() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [toast, setToast] = useState('')
  function soon() { setToast('Coming soon. We\'ll let you know when it\'s live.'); clearTimeout(window.__ivt); window.__ivt = setTimeout(() => setToast(''), 2200) }
  const list = PICKS.filter(p => !q || (p.name + ' ' + p.tag + ' ' + p.desc).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="iv page">
      <style>{IV_CSS}</style>
      <div className="iv-wrap">
        <div className="iv-top">
          <div>
            <h1 className="iv-title">Invest</h1>
            <p className="iv-sub">What you'll be able to do with your money on Solana.</p>
          </div>
          <button className="iv-portfolio" onClick={soon}><Wallet size={16} /> Portfolio</button>
        </div>

        <div className="iv-search">
          <Search size={18} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects, categories, or tokens" />
        </div>

        <div className="iv-promo">
          <div className="iv-promo-ic"><Sparkles size={20} /></div>
          <div className="iv-promo-txt">
            <p className="iv-promo-h">Grow your money, one sentence at a time.</p>
            <p className="iv-promo-b">Velfi explains every option and never moves money without your signature.</p>
            <button className="iv-promo-link" onClick={soon}>Learn more <ArrowRight size={14} /></button>
          </div>
          <img className="iv-promo-coin" src={solCoin} alt="" />
        </div>

        <div className="iv-sec">
          <div>
            <p className="iv-sec-h">Top picks</p>
            <p className="iv-sec-b">Swaps are live on mainnet; the rest are on the way.</p>
          </div>
          <button className="iv-sec-all" onClick={soon}>View all <ChevronRight size={15} /></button>
        </div>

        <div className="iv-list">
          {list.map(p => (
            <div className="iv-card" key={p.id}>
              <div className="iv-card-head">
                <span className="iv-logo" style={{ background: p.color }}>{p.letter}</span>
                <div className="iv-info">
                  <p className="iv-name">{p.name}</p>
                  <span className="iv-tag">{p.tag}</span>
                  <p className="iv-desc">{p.desc}</p>
                </div>
              </div>
              <div className="iv-foot">
                <div className="iv-metric">
                  <span className="iv-mlabel">{p.mlabel}</span>
                  <span className="iv-mval">{p.metric}</span>
                </div>
                <button className="iv-invest" onClick={p.id === 'swap' ? () => { sessionStorage.setItem('velfi_pending_msg', 'I want to swap tokens'); navigate('/chat') } : soon}>{p.id === 'swap' ? 'Ask Velfi' : 'Notify me'}</button>
              </div>
            </div>
          ))}
        </div>

        <div className="iv-secure">
          <div className="iv-secure-ic"><Shield size={20} /></div>
          <div className="iv-secure-txt">
            <p className="iv-secure-h">Secure. Transparent. On-chain.</p>
            <p className="iv-secure-b">You approve and sign every action. Velfi doesn't give financial advice.</p>
          </div>
          <button className="iv-secure-link" onClick={soon}>Why Solana? <ArrowRight size={14} /></button>
        </div>
      </div>
      {toast && <div className="iv-toast">{toast}</div>}
    </div>
  )
}

const IV_CSS = `
.iv{ background:var(--v-bg); min-height:100dvh; font-family:'DM Sans',system-ui,sans-serif; color:var(--v-ink); }
.iv-wrap{ padding:54px 18px 110px; }
.iv-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:18px; }
.iv-title{ font-size:30px; font-weight:700; letter-spacing:-0.6px; color:var(--v-ink); }
.iv-sub{ font-size:14px; font-weight:400; color:var(--v-sub); margin-top:5px; line-height:1.5; max-width:240px; }
.iv-portfolio{ flex-shrink:0; display:inline-flex; align-items:center; gap:7px; padding:10px 15px; border-radius:14px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); color:var(--v-ink); font-size:14px; font-weight:600; font-family:'DM Sans',sans-serif; }
.iv-search{ display:flex; align-items:center; gap:10px; padding:13px 16px; border-radius:16px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); margin-bottom:16px; color:var(--v-sub); }
.iv-search input{ flex:1; min-width:0; background:none; border:none; outline:none; font-family:'DM Sans',sans-serif; font-size:14px; color:var(--v-ink); }
.iv-search input::placeholder{ color:var(--v-sub); }
.iv-promo{ position:relative; overflow:hidden; display:flex; gap:14px; padding:18px; border-radius:20px; margin-bottom:24px; background:linear-gradient(135deg,rgba(123,79,255,0.16),rgba(123,79,255,0.04)); border:1px solid rgba(123,79,255,0.18); }
.iv-promo-ic{ width:44px; height:44px; flex-shrink:0; border-radius:13px; background:rgba(123,79,255,0.18); color:var(--v-accent); display:flex; align-items:center; justify-content:center; }
.iv-promo-txt{ flex:1; min-width:0; z-index:1; }
.iv-promo-h{ font-size:16px; font-weight:700; color:var(--v-ink); }
.iv-promo-b{ font-size:13px; font-weight:400; color:var(--v-sub); margin-top:3px; line-height:1.45; max-width:230px; }
.iv-promo-link{ display:inline-flex; align-items:center; gap:5px; margin-top:11px; background:none; color:var(--v-accent); font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif; }
.iv-promo-coin{ position:absolute; right:-14px; bottom:-14px; width:104px; height:104px; opacity:0.85; filter:drop-shadow(0 8px 24px rgba(123,79,255,0.5)); }
.iv-sec{ display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:14px; }
.iv-sec-h{ font-size:18px; font-weight:700; color:var(--v-ink); }
.iv-sec-b{ font-size:13px; font-weight:400; color:var(--v-sub); margin-top:2px; }
.iv-sec-all{ display:inline-flex; align-items:center; gap:3px; background:none; color:var(--v-accent); font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif; flex-shrink:0; }
.iv-list{ display:flex; flex-direction:column; gap:12px; margin-bottom:22px; }
.iv-card{ background:var(--v-card-solid); border:1px solid var(--v-card-bd); border-radius:20px; padding:16px; }
.iv-card-head{ display:flex; gap:13px; }
.iv-logo{ width:50px; height:50px; flex-shrink:0; border-radius:15px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:20px; }
.iv-info{ flex:1; min-width:0; }
.iv-name{ display:flex; align-items:center; gap:5px; font-size:16px; font-weight:700; color:var(--v-ink); }
.iv-verified{ color:var(--v-accent); flex-shrink:0; }
.iv-tag{ display:inline-block; margin-top:5px; padding:2px 9px; border-radius:999px; background:var(--v-chip); color:var(--v-sub); font-size:11px; font-weight:600; }
.iv-desc{ font-size:13px; font-weight:400; color:var(--v-sub); margin-top:7px; line-height:1.45; }
.iv-foot{ display:flex; align-items:center; gap:12px; margin-top:14px; padding-top:14px; border-top:1px solid var(--v-card-bd); }
.iv-metric{ display:grid; grid-template-columns:auto; gap:1px; flex-shrink:0; }
.iv-mlabel{ font-size:11px; font-weight:400; color:var(--v-sub); }
.iv-mval{ font-size:15px; font-weight:700; color:var(--v-accent); margin-bottom:5px; }
.iv-tvll{ margin-top:2px; }
.iv-tvl{ font-size:14px; font-weight:700; color:var(--v-ink); }
.iv-spark{ flex:1; min-width:0; opacity:0.9; }
.iv-invest{ flex-shrink:0; padding:9px 16px; border-radius:12px; background:none; border:1px solid var(--v-accent); color:var(--v-accent); font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif; }
.iv-secure{ display:flex; align-items:center; gap:13px; padding:16px; border-radius:20px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); }
.iv-secure-ic{ width:44px; height:44px; flex-shrink:0; border-radius:13px; background:rgba(123,79,255,0.14); color:var(--v-accent); display:flex; align-items:center; justify-content:center; }
.iv-secure-txt{ flex:1; min-width:0; }
.iv-secure-h{ font-size:15px; font-weight:700; color:var(--v-ink); }
.iv-secure-b{ font-size:12px; font-weight:400; color:var(--v-sub); margin-top:3px; line-height:1.45; }
.iv-secure-link{ display:inline-flex; align-items:center; gap:4px; background:none; color:var(--v-accent); font-size:13px; font-weight:600; font-family:'DM Sans',sans-serif; flex-shrink:0; }
.iv-toast{ position:fixed; left:50%; bottom:96px; transform:translateX(-50%); z-index:400; padding:12px 18px; border-radius:14px; background:var(--v-ink); color:var(--v-bg); font-size:13px; font-weight:600; box-shadow:0 12px 30px -10px rgba(0,0,0,0.5); animation:ivt .2s; max-width:90%; text-align:center; }
@keyframes ivt{ from{opacity:0; transform:translate(-50%,8px)} to{opacity:1; transform:translate(-50%,0)} }
`
