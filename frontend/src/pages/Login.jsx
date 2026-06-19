import { useState } from 'react'
import { useZkLogin } from '../hooks/useZkLogin.js'
import otterImg from '../assets/otter.png'

function TallyLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
      <rect x="11.4" y="9"    width="3.2"  height="18" rx="0.6" />
      <rect x="18.4" y="9"    width="3.2"  height="22" rx="0.6" />
      <rect x="25.4" y="9"    width="3.2"  height="18" rx="0.6" />
      <rect x="9"    y="18.4" width="22"   height="3.2" rx="0.6" />
    </svg>
  )
}

function GoogleG() {
  return (
    <span className="va-gchip">
      <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    </span>
  )
}

const STEPS = [
  { n: 'in', t: 'Sign in with Google', s: 'No seed phrase, no password' },
  { n: '2',  t: 'Claim your .vel name', s: 'Your handle, e.g. alice.vel' },
  { n: '3',  t: 'Tell your money what to do', s: 'Plain-language payments' },
]

export default function Login() {
  const { startGoogleLogin, loading, error } = useZkLogin()
  const [mode, setMode] = useState('signup') // 'signup' | 'login'
  const isSignup = mode === 'signup'

  return (
    <div className="va-fixed">
      <style>{VA_CSS}</style>
      <div className="va-card">

        {/* LEFT HERO */}
        <div className="va-left">
          <div className="va-brand"><TallyLogo /><span className="va-word">Velfi</span></div>

          <h1 className="va-hi">
            <span className="va-hi-accent">HI,</span><br />
            join the users<br />of Velfi.
          </h1>

          <img className="va-otter" src={otterImg} alt="Velfi otter" />

          <div className="va-steps">
            {STEPS.map((st, i) => (
              <div className={'va-step' + (i === 0 ? ' va-step-first' : '')} key={st.n}>
                <span className="va-step-n">
                  {st.n === 'in'
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    : st.n}
                </span>
                <div className="va-step-t">{st.t}</div>
                <div className="va-step-s">{st.s}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT FORM */}
        <div className="va-right">
          <div className="va-form">
            <h2 className="va-title">{isSignup ? 'Sign Up Account' : 'Welcome back'}</h2>
            <p className="va-sub">
              {isSignup
                ? 'Sign in with Google to create your account.'
                : 'Sign in with Google to continue.'}
            </p>

            <button className="va-cta" onClick={startGoogleLogin} disabled={loading}>
              {loading
                ? <span className="va-spin" />
                : <><GoogleG />Continue with Google</>}
            </button>

            {error && <p className="va-err">{error}</p>}

            <div className="va-assure">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
              <span>No seed phrase. Secured by zkLogin.</span>
            </div>

            <div className="va-divider"><span>That&apos;s it</span></div>

            <p className="va-mini">
              Velfi never holds your keys. The AI proposes; you approve every payment with one signature.
            </p>

            <p className="va-switch">
              {isSignup ? 'Already have an account? ' : 'New to Velfi? '}
              <button className="va-link" onClick={() => setMode(isSignup ? 'login' : 'signup')}>
                {isSignup ? 'Log in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}

const VA_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap');

.va-fixed{
  position:fixed; inset:0; z-index:50; overflow-y:auto;
  display:flex; align-items:center; justify-content:center; padding:0;
  font-family:'DM Sans',system-ui,sans-serif;
  --va-ink:#1a1226; --va-sub:#6a5a8a; --va-accent:#7B4FFF;
  --va-page:radial-gradient(120% 90% at 80% 0%, #e6dffb 0%, #EFEDF7 45%, #EFEDF7 100%);
  --va-left:radial-gradient(130% 100% at 30% 10%, #f1ebff 0%, #e7defb 55%, #ddd0f6 100%);
  --va-right:#FBFAFE;
  --va-card:rgba(255,255,255,0.66); --va-cardbd:rgba(42,26,58,0.08);
  --va-cta:#2a1a3a; --va-ctaTxt:#ffffff;
  --va-shadow:0 30px 80px -30px rgba(42,26,58,0.35);
  background:var(--va-page);
}
[data-theme="dark"] .va-fixed{
  --va-ink:#F0F0F5; --va-sub:#b4a8d0; --va-accent:#7C6DFF;
  --va-page:radial-gradient(120% 90% at 80% 0%, #1b1330 0%, #0E0F14 55%, #0E0F14 100%);
  --va-left:radial-gradient(130% 100% at 30% 10%, #3a2a4d 0%, #2a1a3a 55%, #1a1020 100%);
  --va-right:#15131c;
  --va-card:rgba(58,42,77,0.42); --va-cardbd:rgba(255,255,255,0.07);
  --va-cta:linear-gradient(135deg,#7C6DFF,#6a4ff0); --va-ctaTxt:#ffffff;
  --va-shadow:0 30px 80px -30px rgba(0,0,0,0.6);
}

.va-card{
  display:flex; width:100%; max-width:none; height:100dvh;
  border-radius:0; overflow:hidden; box-shadow:none; border:none;
}

.va-left{
  position:relative; flex:1.08; padding:40px 40px 0; overflow:hidden;
  background:var(--va-left);
}
.va-brand{ display:flex; align-items:center; gap:10px; color:var(--va-ink); }
.va-word{ font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:26px; letter-spacing:-0.5px; }
.va-hi{
  margin-top:34px; font-weight:600; font-size:46px; line-height:1.12;
  letter-spacing:-1px; color:var(--va-ink);
}
.va-hi-accent{ color:var(--va-accent); font-weight:700; }
.va-otter{
  position:absolute; left:50%; transform:translateX(-50%); bottom:90px;
  width:100%; max-width:700px; pointer-events:none; user-select:none;
  -webkit-mask-image:linear-gradient(to bottom,#000 80%,transparent 100%);
  mask-image:linear-gradient(to bottom,#000 80%,transparent 100%);
  filter:none;
}
.va-steps{
  position:absolute; left:40px; right:40px; bottom:34px;
  display:grid; grid-template-columns:repeat(3,1fr); gap:14px;
}
.va-step{
  background:var(--va-card); border:1px solid var(--va-cardbd);
  backdrop-filter:blur(10px); border-radius:16px; padding:16px 14px;
}
.va-step-n{
  display:inline-flex; align-items:center; justify-content:center;
  width:30px; height:30px; border-radius:50%; margin-bottom:12px;
  font-weight:700; font-size:13px;
  background:rgba(123,79,255,0.16); color:var(--va-accent);
}
.va-step-first .va-step-n{ background:var(--va-accent); color:#fff; }
.va-step-t{ font-weight:600; font-size:14px; color:var(--va-ink); line-height:1.25; }
.va-step-s{ font-size:12px; color:var(--va-sub); margin-top:5px; line-height:1.35; }

.va-right{
  flex:1; background:var(--va-right);
  display:flex; align-items:center; justify-content:center; padding:40px;
}
.va-form{ width:100%; max-width:360px; }
.va-title{ font-weight:700; font-size:30px; letter-spacing:-0.5px; color:var(--va-ink); }
.va-sub{ margin-top:8px; font-size:14.5px; color:var(--va-sub); }
.va-cta{
  width:100%; margin-top:30px; padding:16px 20px; border-radius:16px;
  background:var(--va-cta); color:var(--va-ctaTxt);
  display:flex; align-items:center; justify-content:center; gap:11px;
  font-family:'DM Sans',sans-serif; font-weight:600; font-size:15px;
  transition:transform .15s ease, opacity .2s ease;
}
.va-cta:hover{ transform:translateY(-1px); }
.va-cta:disabled{ opacity:.7; transform:none; }
.va-gchip{
  display:inline-flex; align-items:center; justify-content:center;
  width:24px; height:24px; border-radius:7px; background:#fff;
}
.va-spin{
  width:20px; height:20px; border-radius:50%;
  border:2px solid rgba(255,255,255,.45); border-top-color:#fff;
  animation:va-spin .8s linear infinite;
}
@keyframes va-spin{ to{ transform:rotate(360deg) } }
.va-err{ margin-top:12px; font-size:12.5px; color:#E84060; text-align:center; }
.va-assure{
  display:flex; align-items:center; justify-content:center; gap:7px;
  margin-top:16px; font-size:12.5px; color:var(--va-sub);
}
.va-assure svg{ color:var(--va-accent); }
.va-divider{
  display:flex; align-items:center; gap:12px; margin:24px 0 16px; color:var(--va-sub);
  font-size:12px;
}
.va-divider::before,.va-divider::after{
  content:''; flex:1; height:1px; background:var(--va-cardbd);
}
.va-mini{ font-size:12.5px; line-height:1.6; color:var(--va-sub); text-align:center; }
.va-switch{ margin-top:26px; text-align:center; font-size:13.5px; color:var(--va-sub); }
.va-link{ background:none; color:var(--va-accent); font-weight:700; font-size:13.5px; cursor:pointer; }

@media (max-width:860px){
  .va-fixed{ padding:0; align-items:flex-start; overflow-x:hidden; -webkit-overflow-scrolling:touch; }
  .va-card{
    flex-direction:column; border-radius:0; max-width:100%;
    height:auto; min-height:100dvh; border:none;
  }
  .va-left{ flex:none; padding:30px 24px 0; min-height:auto;
    background:transparent; overflow:visible; }
  .va-hi{ font-size:34px; margin-top:22px; }
  .va-otter{
    position:relative; left:auto; right:auto; bottom:auto; transform:none;
    display:block; width:calc(100% + 48px); max-width:none; margin:-4px -24px 0;
    -webkit-mask-image:linear-gradient(to bottom,#000 78%,transparent 100%);
    mask-image:linear-gradient(to bottom,#000 78%,transparent 100%);
    filter:none;
  }
  .va-steps{ display:none; }
  .va-right{ flex:1; padding:10px 24px 44px; align-items:flex-start;
    background:transparent; }
  .va-form{ max-width:100%; }
  .va-cta{ margin-top:24px; }
}
`
