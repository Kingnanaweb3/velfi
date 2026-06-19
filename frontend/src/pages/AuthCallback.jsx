import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useZkLogin } from '../hooks/useZkLogin.js'
import { useAuth } from '../context/AuthContext.jsx'

const BACKEND = '/api'
const COPY = ['Signing you in\u2026', 'Creating your secure wallet\u2026', 'Almost ready\u2026']

export default function AuthCallback() {
  const navigate = useNavigate()
  const { handleCallback } = useZkLogin()
  const { user, token, login } = useAuth()

  const [phase, setPhase] = useState('loading') // 'loading' | 'username' | 'error'
  const [step, setStep] = useState(0)
  const [returning, setReturning] = useState(false)
  const [error, setError] = useState(null)
  const processed = useRef(false)
  const addrRef = useRef(null)

  // username state
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState(null) // 'checking' | 'available' | 'taken'
  const [suggestions, setSuggestions] = useState([])
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true
    ;(async () => {
      try {
        const hash = window.location.hash.substring(1)
        const idToken = new URLSearchParams(hash).get('id_token')
        if (!idToken) { setError('No sign-in token found. Please try again.'); setPhase('error'); return }

        setStep(0)
        await new Promise(r => setTimeout(r, 600))
        setStep(1)
        const { isNew, suiAddress } = await handleCallback(idToken) // real zkLogin work
        addrRef.current = suiAddress
        if (!isNew) setReturning(true)
        setStep(2)
        await new Promise(r => setTimeout(r, 650))

        if (isNew) setPhase('username')
        else navigate('/', { replace: true })
      } catch (err) {
        setError(err.message || 'Something went wrong.')
        setPhase('error')
      }
    })()
  }, [])

  // debounced availability
  useEffect(() => {
    if (username.length < 3) { setStatus(null); setSuggestions([]); return }
    setStatus('checking')
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND}/users/${username}`, { headers: { 'ngrok-skip-browser-warning': 'true' } })
        if (res.ok) { setStatus('taken'); setSuggestions([`${username}pay`, `hey${username}`, `${username}1`]) }
        else { setStatus('available'); setSuggestions([]) }
      } catch { setStatus('available') }
    }, 500)
    return () => clearTimeout(t)
  }, [username])

  async function handleClaim(name = username) {
    const claimName = (name || username).toLowerCase()
    if (!claimName || claimName.length < 3) return
    setClaiming(true); setError(null)
    try {
      const res = await fetch(`${BACKEND}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({
          suiAddress: user?.suiAddress || user?.sui_address || addrRef.current,
          username: claimName
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not claim that name.')
      login(token, { ...user, username: claimName })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div className="vc-fixed">
      <style>{VC_CSS}</style>

      {phase === 'error' ? (
        <div className="vc-center">
          <p className="vc-err-msg">{error}</p>
          <button className="vc-ghost" onClick={() => navigate('/login')}>Back to sign in</button>
        </div>
      ) : phase === 'loading' ? (
        <div className="vc-center">
          <div className="vc-mark-wrap">
            <span className="vc-halo" />
            <svg className="vc-mark" width="92" height="92" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <line className="vc-st" style={{ '--d': '0.10s' }} x1="13" y1="9"  x2="13" y2="27" pathLength="1" />
              <line className="vc-st" style={{ '--d': '0.32s' }} x1="20" y1="9"  x2="20" y2="31" pathLength="1" />
              <line className="vc-st" style={{ '--d': '0.54s' }} x1="27" y1="9"  x2="27" y2="27" pathLength="1" />
              <line className="vc-st" style={{ '--d': '0.80s' }} x1="9"  y1="20" x2="31" y2="20" pathLength="1" />
            </svg>
          </div>
          <h2 className="vc-load-title">{returning ? 'Welcome back' : <>Creating your <span className="vc-grad">Velfi</span> account</>}</h2>
          <p className="vc-copy" key={step}>{COPY[step]}</p>
          <div className="vc-dots">
            <i className={step >= 0 ? 'on' : ''} /><i className={step >= 1 ? 'on' : ''} /><i className={step >= 2 ? 'on' : ''} />
          </div>
        </div>
      ) : (
        <div className="vc-claim">
          <div className="vc-mark-sm">
            <svg width="34" height="34" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
              <rect x="11.4" y="9" width="3.2" height="18" rx="0.6" />
              <rect x="18.4" y="9" width="3.2" height="22" rx="0.6" />
              <rect x="25.4" y="9" width="3.2" height="18" rx="0.6" />
              <rect x="9" y="18.4" width="22" height="3.2" rx="0.6" />
            </svg>
          </div>

          <h1 className="vc-title">Claim your name</h1>
          <p className="vc-sub">People send you money to this handle. It can&apos;t be changed later.</p>

          <div className={'vc-input ' + (status || '')}>
            <input
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
              placeholder="yourname"
              maxLength={20}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && status === 'available') handleClaim() }}
            />
            <span className="vc-suffix">.vel</span>
          </div>

          <div className="vc-status">
            {status === 'checking' && <span className="vc-muted">Checking\u2026</span>}
            {status === 'available' && username.length >= 3 && (
              <span className="vc-ok">{username}.vel is available</span>
            )}
            {status === 'taken' && <span className="vc-no">{username}.vel is taken</span>}
          </div>

          {status === 'taken' && suggestions.length > 0 && (
            <div className="vc-sugs">
              {suggestions.map(s => (
                <button key={s} className="vc-sug" onClick={() => { setUsername(s); setStatus('available') }}>
                  {s}.vel
                </button>
              ))}
            </div>
          )}

          {error && <p className="vc-err-line">{error}</p>}

          <button
            className="vc-cta"
            onClick={() => handleClaim()}
            disabled={claiming || username.length < 3 || status === 'taken' || status === 'checking'}
          >
            {claiming ? <span className="vc-spin" /> : 'Claim & continue'}
          </button>
        </div>
      )}
    </div>
  )
}

const VC_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');

.vc-fixed{
  position:fixed; inset:0; z-index:50; display:flex; align-items:center; justify-content:center;
  padding:24px; font-family:'DM Sans',system-ui,sans-serif;
  --vc-ink:#1a1226; --vc-sub:#6a5a8a; --vc-accent:#7B4FFF;
  --vc-card:#FBFAFE; --vc-cardbd:rgba(42,26,58,0.10);
  --vc-input:#ffffff; --vc-cta:#2a1a3a; --vc-ctaTxt:#ffffff;
  --vc-bg:radial-gradient(120% 90% at 50% 0%, #e9e2fb 0%, #EFEDF7 55%, #EFEDF7 100%);
  background:var(--vc-bg); color:var(--vc-ink);
}
[data-theme="dark"] .vc-fixed{
  --vc-ink:#F0F0F5; --vc-sub:#b4a8d0; --vc-accent:#7C6DFF;
  --vc-card:#15131c; --vc-cardbd:rgba(255,255,255,0.08);
  --vc-input:#1a1622; --vc-cta:linear-gradient(135deg,#7C6DFF,#6a4ff0); --vc-ctaTxt:#fff;
  --vc-bg:radial-gradient(120% 90% at 50% 0%, #1b1330 0%, #0E0F14 55%, #0E0F14 100%);
}

.vc-center{ display:flex; flex-direction:column; align-items:center; text-align:center; }

/* tally mark draw */
.vc-mark-wrap{ position:relative; width:120px; height:120px; display:flex; align-items:center; justify-content:center; margin-bottom:26px; }
.vc-halo{
  position:absolute; inset:0; border-radius:50%;
  background:radial-gradient(circle, color-mix(in srgb, var(--vc-accent) 26%, transparent) 0%, transparent 65%);
  animation:vc-breathe 2.6s ease-in-out infinite;
}
.vc-mark{ position:relative; color:var(--vc-accent);
  filter:drop-shadow(0 0 10px color-mix(in srgb, var(--vc-accent) 45%, transparent));
  animation:vc-bob 2.6s ease-in-out infinite; }
.vc-st{ stroke:currentColor; stroke-width:3.4; stroke-linecap:butt;
  stroke-dasharray:1; stroke-dashoffset:1; animation:vc-draw .5s ease forwards var(--d); }
@keyframes vc-draw{ to{ stroke-dashoffset:0 } }
@keyframes vc-breathe{ 0%,100%{ transform:scale(.92); opacity:.7 } 50%{ transform:scale(1.06); opacity:1 } }
@keyframes vc-bob{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-4px) } }

.vc-load-title{ font-weight:600; font-size:23px; letter-spacing:-0.4px; color:var(--vc-ink); }
.vc-grad{ background:linear-gradient(135deg,#9B6DFF,#6a4ff0); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; }
.vc-copy{ margin-top:10px; font-size:14px; color:var(--vc-sub); animation:vc-fade .4s ease; }
@keyframes vc-fade{ from{ opacity:0; transform:translateY(3px) } to{ opacity:1; transform:translateY(0) } }
.vc-dots{ display:flex; gap:7px; margin-top:18px; }
.vc-dots i{ width:7px; height:7px; border-radius:50%; background:var(--vc-cardbd); transition:background .3s, transform .3s; }
.vc-dots i.on{ background:var(--vc-accent); transform:scale(1.15); }

/* claim */
.vc-claim{ width:100%; max-width:380px; display:flex; flex-direction:column; align-items:center; text-align:center; }
.vc-mark-sm{ color:var(--vc-ink); margin-bottom:18px; }
.vc-title{ font-weight:700; font-size:27px; letter-spacing:-0.5px; color:var(--vc-ink); }
.vc-sub{ margin-top:8px; font-size:13.5px; line-height:1.5; color:var(--vc-sub); max-width:300px; }
.vc-input{
  margin-top:26px; width:100%; display:flex; align-items:center; gap:6px;
  background:var(--vc-input); border:1.5px solid var(--vc-cardbd);
  border-radius:16px; padding:15px 18px; transition:border-color .2s;
}
.vc-input.available{ border-color:#22C55E; }
.vc-input.taken{ border-color:#E84060; }
.vc-input input{
  flex:1; min-width:0; background:none; border:none; outline:none;
  font-family:'DM Sans',sans-serif; font-size:17px; font-weight:600; color:var(--vc-ink);
}
.vc-input input::placeholder{ color:var(--vc-sub); font-weight:500; opacity:.7; }
.vc-suffix{ font-size:16px; font-weight:700; color:var(--vc-accent); }
.vc-status{ min-height:20px; margin-top:10px; font-size:12.5px; }
.vc-ok{ color:#1DB866; font-weight:600; }
.vc-no{ color:#E84060; font-weight:600; }
.vc-muted{ color:var(--vc-sub); }
.vc-sugs{ display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin-top:8px; }
.vc-sug{
  background:var(--vc-card); border:1px solid var(--vc-cardbd); color:var(--vc-ink);
  border-radius:999px; padding:8px 14px; font-size:13px; font-weight:600;
  font-family:'DM Sans',sans-serif; cursor:pointer; transition:border-color .2s;
}
.vc-sug:hover{ border-color:var(--vc-accent); }
.vc-err-line{ margin-top:12px; font-size:12.5px; color:#E84060; }
.vc-cta{
  margin-top:24px; width:100%; padding:16px; border-radius:16px;
  background:var(--vc-cta); color:var(--vc-ctaTxt);
  font-family:'DM Sans',sans-serif; font-weight:600; font-size:15px;
  display:flex; align-items:center; justify-content:center; gap:10px;
  cursor:pointer; transition:transform .15s, opacity .2s;
}
.vc-cta:hover{ transform:translateY(-1px); }
.vc-cta:disabled{ opacity:.45; cursor:default; transform:none; }

.vc-spin{ width:18px; height:18px; border-radius:50%;
  border:2px solid rgba(255,255,255,.4); border-top-color:#fff; animation:vc-spin .8s linear infinite; }
@keyframes vc-spin{ to{ transform:rotate(360deg) } }

.vc-err-msg{ font-size:14px; color:#E84060; margin-bottom:18px; max-width:320px; }
.vc-ghost{
  background:var(--vc-card); border:1px solid var(--vc-cardbd); color:var(--vc-ink);
  border-radius:14px; padding:12px 22px; font-size:14px; font-weight:600;
  font-family:'DM Sans',sans-serif; cursor:pointer;
}

@media (max-width:520px){
  .vc-load-title{ font-size:20px; }
  .vc-title{ font-size:24px; }
}
`
