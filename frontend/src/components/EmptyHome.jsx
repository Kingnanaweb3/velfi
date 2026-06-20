import { useState } from 'react'
import { Bell, Eye, Plus, Wallet, Users, Send, Waves, ChevronRight, ArrowUp } from 'lucide-react'
import otterHero from '../assets/otter-hero.png'
import otterAvatar from '../assets/otter-avatar.png'
import ReceiveSheet from './ReceiveSheet.jsx'

function TallyLogo() {
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
      <rect x="11.4" y="9" width="3.2" height="18" rx="0.6" />
      <rect x="18.4" y="9" width="3.2" height="22" rx="0.6" />
      <rect x="25.4" y="9" width="3.2" height="18" rx="0.6" />
      <rect x="9" y="18.4" width="22" height="3.2" rx="0.6" />
    </svg>
  )
}

const STARTERS = [
  { k: 'split',  label: 'Split a bill',     prompt: 'Split ', Icon: Users },
  { k: 'send',   label: 'Send to a friend', prompt: 'Send ',  Icon: Send },
  { k: 'stream', label: 'Start a stream',   prompt: 'Stream ', Icon: Waves },
]

export default function EmptyHome({ user, navigate }) {
  const [recvOpen, setRecvOpen] = useState(false)
  function go(prompt) {
    if (prompt) sessionStorage.setItem('velfi_pending_msg', prompt)
    navigate('/chat')
  }
  return (
    <div className="vempty page">
      <style>{EMPTY_CSS}</style>
      <div className="ve-wrap">
        <div className="ve-head">
          <div className="ve-brand"><TallyLogo /><span className="ve-word">Velfi</span></div>
          <div className="ve-head-r">
            <button className="ve-iconbtn" aria-label="Notifications"><Bell size={20} strokeWidth={1.7} /><span className="ve-dot" /></button>
            <button className="ve-avatar" onClick={() => navigate('/account')} aria-label="Account"><img src={otterAvatar} alt="" /></button>
          </div>
        </div>

        <div className="ve-balance">
          <div className="ve-bal-l">
            <div className="ve-bal-top"><span>Total Balance</span><Eye size={14} strokeWidth={1.7} /></div>
            <div className="ve-bal-amt">$0.00</div>
            <div className="ve-bal-fiat">&#8776; &#8358;0</div>
          </div>
          <div className="ve-bal-r">
            <span className="ve-wallet"><Wallet size={22} strokeWidth={1.7} /></span>
            <button className="ve-addmoney" onClick={() => setRecvOpen(true)}>
              Add money <span className="ve-add-ic"><Plus size={14} strokeWidth={2.8} /></span>
            </button>
          </div>
        </div>

        <div className="ve-hero">
          <div className="ve-hero-txt">
            <p className="ve-hi">Hi there! &#128075;</p>
            <h2 className="ve-ready">Your wallet&rsquo;s <span>ready.</span></h2>
            <p className="ve-sub">Let&rsquo;s get you started with smarter money moves.</p>
          </div>
          <img className="ve-otter" src={otterHero} alt="" />
        </div>

        <div className="ve-cmd" onClick={() => go('')}>
          <span className="ve-cmd-ph">Tell your money what to do&hellip;</span>
          <button className="ve-send" aria-label="Open chat"><ArrowUp size={20} color="#fff" strokeWidth={2.4} /></button>
        </div>

        <div className="ve-starters">
          {STARTERS.map(({ k, label, prompt, Icon }) => (
            <button key={k} className="ve-start" onClick={() => go(prompt)}>
              <span className="ve-start-ic"><Icon size={18} strokeWidth={1.9} /></span>
              <span className="ve-start-row"><span className="ve-start-l">{label}</span><ChevronRight size={15} strokeWidth={2} className="ve-start-arr" /></span>
            </button>
          ))}
        </div>
      </div>
      <ReceiveSheet open={recvOpen} onClose={() => setRecvOpen(false)} username={user?.username} />
    </div>
  )
}

const EMPTY_CSS = `
.vempty{ background:var(--v-bg); color:var(--v-ink); font-family:var(--font-body); }
.ve-wrap{ padding:calc(env(safe-area-inset-top, 0px) + 14px) 18px 24px; }
.ve-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.ve-brand{ display:flex; align-items:center; gap:9px; color:var(--v-ink); }
.ve-word{ font-family:var(--font-display); font-weight:500; font-size:23px; letter-spacing:0.2px; }
.ve-head-r{ display:flex; align-items:center; gap:10px; }
.ve-iconbtn{ position:relative; width:42px; height:42px; display:flex; align-items:center; justify-content:center; color:var(--v-ink); background:none; }
.ve-dot{ position:absolute; top:10px; right:11px; width:7px; height:7px; border-radius:50%; background:var(--v-accent); }
.ve-avatar{ width:44px; height:44px; border-radius:50%; overflow:hidden; border:1px solid var(--v-card-bd); background:var(--v-chip); }
.ve-avatar img{ width:100%; height:100%; object-fit:cover; }

.ve-balance{ display:flex; align-items:stretch; justify-content:space-between; gap:12px; border-radius:24px; padding:22px 20px; min-height:150px; margin-bottom:4px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); box-shadow:var(--shadow); }
.ve-bal-l{ display:flex; flex-direction:column; justify-content:center; }
.ve-bal-r{ display:flex; flex-direction:column; align-items:flex-end; justify-content:space-between; }
.ve-wallet{ width:46px; height:46px; border-radius:14px; background:var(--v-chip); color:var(--v-accent); display:flex; align-items:center; justify-content:center; }
.ve-bal-top{ display:flex; align-items:center; gap:7px; color:var(--v-sub); font-size:12px; }
.ve-bal-amt{ font-family:var(--font-display); font-weight:600; font-size:34px; letter-spacing:-0.5px; color:var(--v-ink); line-height:1.05; margin-top:5px; }
.ve-bal-fiat{ font-size:12px; color:var(--v-sub); margin-top:2px; }
.ve-addmoney{ display:flex; align-items:center; gap:8px; flex-shrink:0; padding:11px 16px; border-radius:999px; background:var(--v-ink); color:var(--v-bg); font-family:var(--font-body); font-size:14px; font-weight:600; }
.ve-add-ic{ width:20px; height:20px; border-radius:50%; background:rgba(150,150,170,0.25); display:flex; align-items:center; justify-content:center; }

.ve-hero{ margin:6px 0 -10px; }
.ve-otter{ display:block; width:calc(100% + 36px); margin:8px -18px 0; height:auto; }
.ve-hero-txt{ padding:0 2px; }
.ve-hi{ font-size:13px; color:var(--v-sub); }
.ve-ready{ font-family:var(--font-display); font-weight:700; font-size:23px; line-height:1.12; letter-spacing:-0.5px; color:var(--v-ink); margin:3px 0 7px; }
.ve-ready span{ color:var(--v-accent); }
.ve-sub{ font-size:12px; color:var(--v-sub); line-height:1.38; }

.ve-cmd{ display:flex; align-items:center; gap:10px; border-radius:22px; padding:9px 9px 9px 18px; margin-bottom:16px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); box-shadow:var(--shadow); }
.ve-cmd-ph{ flex:1; min-width:0; font-size:14px; color:var(--v-sub); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.ve-send{ width:46px; height:46px; border-radius:50%; flex-shrink:0; background:var(--v-accent); display:flex; align-items:center; justify-content:center; }

.ve-starters{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
.ve-start{ display:flex; flex-direction:column; gap:14px; padding:13px; border-radius:18px; background:var(--v-card-solid); border:1px solid var(--v-card-bd); box-shadow:var(--shadow); text-align:left; }
.ve-start-ic{ width:36px; height:36px; border-radius:11px; background:var(--v-chip); color:var(--v-accent); display:flex; align-items:center; justify-content:center; }
.ve-start-row{ display:flex; align-items:center; justify-content:space-between; gap:6px; }
.ve-start-l{ font-size:13px; font-weight:600; color:var(--v-ink); line-height:1.2; }
.ve-start-arr{ color:var(--v-sub); flex-shrink:0; }
`
