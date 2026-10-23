import { useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useNavigate } from 'react-router-dom'
import { useVelfiSignIn } from '../hooks/useVelfiSignIn.js'
import { Logo, Pill } from '../ui/kit.jsx'
import otterScene from '../assets/otter-scene.webp'
import { t, useLang, LANGS } from '../i18n/index.jsx'

function GoogleG() {
  return (
    <span className="g" aria-hidden="true">
      <svg width="17" height="17" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    </span>
  )
}

// Small EN · 中文 · 한국어 switch for people who haven't signed in yet.
function LangPills() {
  const { lang, setLang } = useLang()
  return (
    <span className="lang-pills" role="group" aria-label={t('language')}>
      {LANGS.map(l => <button key={l.code} type="button" lang={l.html} className={l.code === lang ? 'on' : ''} aria-pressed={l.code === lang} onClick={() => setLang(l.code)}>{l.label}</button>)}
    </span>
  )
}

export default function Login() {
  const navigate = useNavigate()
  // After Google, finish on /auth/callback (wallet set-up and .vel name).
  const { startGoogleLogin, loading, error } = useVelfiSignIn({ onSignedIn: () => navigate('/auth/callback', { replace: true }) })
  const { ready, authenticated } = usePrivy()
  useEffect(() => { if (ready && authenticated) navigate('/auth/callback', { replace: true }) }, [ready, authenticated])

  return (
    <div className="auth-dark">
    <main className="auth screen">
      <div className="brand" style={{ justifyContent: 'space-between', width: '100%' }}><span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Logo size={26} /> Velfi</span><LangPills /></div>

      <div className="auth-art">
        <h1>{t('loginH1a')}<br /><span>{t('loginH1b')}</span></h1>
        <p className="lede">{t('loginLede')}</p>
        <div className="auth-steps">
          <Pill tone="soft">{t('step1')}</Pill><Pill tone="soft">{t('step2')}</Pill><Pill tone="soft">{t('step3')}</Pill>
        </div>
        <div className="auth-visual"><img src={otterScene} alt="" /></div>
      </div>

      <div className="auth-foot">
        <button className="gbtn" onClick={startGoogleLogin} disabled={loading}>
          {loading ? <span className="spin" /> : <><GoogleG /> {t('continueGoogle')}</>}
        </button>
        {error && <p className="auth-err" role="alert">{error}</p>}
        <p className="auth-note">{t('loginNote')}</p>
      </div>
    </main>
    </div>
  )
}
