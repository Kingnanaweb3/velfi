import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { User, Shield, Wallet, Clock, Store, Hourglass, SlidersHorizontal, Copy, Check, ChevronRight, Sun, Moon, LogOut, Settings2 } from 'lucide-react'
import otterAgent from '../assets/otter-agent.png'

const GUARDRAILS = [
  { k: 'budget', Icon: Wallet, title: 'Budgets', desc: 'Set monthly budgets for spending categories.', val: '3 active' },
  { k: 'limits', Icon: Clock, title: 'Spending limits', desc: 'Limit transactions per day, week or month.', val: '2 active' },
  { k: 'merchant', Icon: Store, title: 'Merchant controls', desc: 'Allow or block specific merchants or domains.', val: '12 blocked' },
  { k: 'cooling', Icon: Hourglass, title: 'Cooling-off period', desc: 'Add a delay to large or sensitive transactions.', val: '10 min' },
  { k: 'all', Icon: SlidersHorizontal, title: 'View all guardrails', desc: 'See all guardrail settings and history.', val: '' },
]

export default function Account() {
  const auth = useAuth()
  const username = auth.user?.username || 'you'
  const handle = `${username}.vel`
  const link = `https://velfi.xyz/${handle}`
  const [copied, setCopied] = useState('')
  const [toast, setToast] = useState('')
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') || 'dark')

  function soon() { setToast('Coming soon — guardrail controls land before mainnet'); clearTimeout(window.__set); window.__set = setTimeout(() => setToast(''), 2200) }
  async function copy(text, key) { try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(''), 1500) } catch {} }
  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('velfi_theme', next) } catch {}
    setTheme(next)
  }
  function logout() {
    if (typeof auth.logout === 'function') auth.logout()
    else { try { localStorage.removeItem('velfi_token') } catch {}; window.location.assign('/login') }
  }

  return (
    <div className="se page">
      <style>{SE_CSS}</style>
      <div className="se-wrap">
        <div className="se-top">
          <div>
            <h1 className="se-title">Settings</h1>
            <p className="se-sub">Manage your account and guardrails.</p>
          </div>
          <button className="se-profile" onClick={soon}>
            <img src={otterAgent} alt="" />
            <span>{handle}</span>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="se-card">
          <div className="se-card-head">
            <span className="se-card-ic"><User size={20} /></span>
            <p className="se-card-h">Your identity</p>
          </div>
          <p className="se-label">Username</p>
          <div className="se-id-row">
            <span className="se-username">{handle}</span>
            <button className="se-icbtn" onClick={() => copy(handle, 'handle')}>{copied === 'handle' ? <Check size={16} color="var(--v-success)" /> : <Copy size={15} />}</button>
            <button className="se-edit" onClick={soon}>Edit username</button>
          </div>
          <p className="se-label se-mt">Receiving link</p>
          <button className="se-link" onClick={() => copy(link, 'link')}>
            <span className="se-link-txt">{link}</span>
            {copied === 'link' ? <Check size={17} color="var(--v-success)" /> : <Copy size={16} />}
          </button>
          <p className="se-hint">Share this link to get paid on Velfi.</p>
        </div>

        <div className="se-card">
          <div className="se-card-head">
            <span className="se-card-ic"><Shield size={20} /></span>
            <div><p className="se-card-h">Guardrails</p><p className="se-card-sub">Set boundaries to help you stay in control.</p></div>
          </div>
          <div className="se-rows">
            {GUARDRAILS.map(r => (
              <button className="se-row" key={r.k} onClick={soon}>
                <span className="se-row-ic"><r.Icon size={20} /></span>
                <div className="se-row-txt"><p className="se-row-h">{r.title}</p><p className="se-row-b">{r.desc}</p></div>
                {r.val && <span className="se-row-val">{r.val}</span>}
                <ChevronRight size={18} className="se-row-chev" />
              </button>
            ))}
          </div>
        </div>

        <div className="se-card">
          <div className="se-card-head">
            <span className="se-card-ic"><Settings2 size={20} /></span>
            <p className="se-card-h">Preferences</p>
          </div>
          <div className="se-rows">
            <button className="se-row" onClick={toggleTheme}>
              <span className="se-row-ic">{theme === 'light' ? <Sun size={20} /> : <Moon size={20} />}</span>
              <div className="se-row-txt"><p className="se-row-h">Appearance</p><p className="se-row-b">Switch between light and dark.</p></div>
              <span className="se-row-val">{theme === 'light' ? 'Light' : 'Dark'}</span>
            </button>
            <button className="se-row se-logout" onClick={logout}>
              <span className="se-row-ic se-logout-ic"><LogOut size={19} /></span>
              <div className="se-row-txt"><p className="se-row-h">Log out</p><p className="se-row-b">Sign out of your account.</p></div>
            </button>
          </div>
        </div>
      </div>
      {toast && <div className="se-toast">{toast}</div>}
    </div>
  )
}

const SE_CSS = `
.se{ background:var(--v-bg); min-height:100dvh; font-family:'DM Sans',system-ui,sans-serif; color:var(--v-ink); }
.se-wrap{ padding:54px 18px 110px; }
.se-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:22px; }
.se-title{ font-size:34px; font-weight:700; letter-spacing:-0.8px; color:var(--v-ink); }
.se-sub{ font-size:14px; font-weight:400; color:var(--v-sub); margin-top:4px; }
.se-profile{ display:inline-flex; align-items:center; gap:8px; background:none; color:var(--v-ink); font-size:14px; font-weight:600; flex-shrink:0; }
.se-profile img{ width:38px; height:38px; border-radius:50%; object-fit:cover; border:1px solid var(--v-card-bd); }
.se-profile span{ color:var(--v-ink); }
.se-profile svg{ color:var(--v-sub); }
.se-card{ background:var(--v-card-solid); border:1px solid var(--v-card-bd); border-radius:22px; padding:18px; margin-bottom:16px; }
.se-card-head{ display:flex; align-items:center; gap:12px; margin-bottom:16px; }
.se-card-ic{ width:44px; height:44px; flex-shrink:0; border-radius:50%; background:rgba(123,79,255,0.14); color:var(--v-accent); display:flex; align-items:center; justify-content:center; }
.se-card-h{ font-size:18px; font-weight:700; color:var(--v-ink); }
.se-card-sub{ font-size:13px; font-weight:400; color:var(--v-sub); margin-top:2px; }
.se-label{ font-size:13px; font-weight:400; color:var(--v-sub); margin-bottom:6px; }
.se-mt{ margin-top:18px; }
.se-id-row{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.se-username{ font-size:21px; font-weight:700; color:var(--v-ink); }
.se-icbtn{ width:32px; height:32px; border-radius:9px; background:var(--v-chip); color:var(--v-sub); display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.se-edit{ margin-left:auto; padding:10px 16px; border-radius:13px; background:rgba(123,79,255,0.12); color:var(--v-accent); font-size:14px; font-weight:600; font-family:'DM Sans',sans-serif; }
.se-link{ display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; padding:14px 16px; border-radius:14px; background:var(--v-chip); border:1px solid var(--v-card-bd); color:var(--v-ink); font-size:14px; font-weight:500; }
.se-link-txt{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.se-link svg{ flex-shrink:0; color:var(--v-sub); }
.se-hint{ font-size:13px; font-weight:400; color:var(--v-sub); margin-top:10px; }
.se-rows{ display:flex; flex-direction:column; }
.se-row{ display:flex; align-items:center; gap:13px; padding:14px 0; background:none; text-align:left; border-top:1px solid var(--v-card-bd); }
.se-row:first-child{ border-top:none; }
.se-row-ic{ width:42px; height:42px; flex-shrink:0; border-radius:12px; background:rgba(123,79,255,0.1); color:var(--v-accent); display:flex; align-items:center; justify-content:center; }
.se-row-txt{ flex:1; min-width:0; }
.se-row-h{ font-size:15px; font-weight:700; color:var(--v-ink); }
.se-row-b{ font-size:12px; font-weight:400; color:var(--v-sub); margin-top:2px; line-height:1.4; }
.se-row-val{ font-size:14px; font-weight:600; color:var(--v-accent); flex-shrink:0; }
.se-row-chev{ color:var(--v-sub); flex-shrink:0; }
.se-logout-ic{ background:rgba(240,90,90,0.12); color:#E2545C; }
.se-logout .se-row-h{ color:#E2545C; }
.se-toast{ position:fixed; left:50%; bottom:96px; transform:translateX(-50%); z-index:400; padding:12px 18px; border-radius:14px; background:var(--v-ink); color:var(--v-bg); font-size:13px; font-weight:600; box-shadow:0 12px 30px -10px rgba(0,0,0,0.5); max-width:90%; text-align:center; }
`
