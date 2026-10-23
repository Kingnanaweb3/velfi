import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { useVelfiSignIn } from '../hooks/useVelfiSignIn.js'
import { useAuth } from '../context/AuthContext.jsx'
import { Pill } from '../ui/kit.jsx'
import { t, getLang } from '../i18n/index.jsx'

const BACKEND = '/api'
const COPY = ['cbSigning', 'cbWallet', 'cbAlmost']

export default function AuthCallback() {
  const navigate = useNavigate()
  const { ready, authenticated } = usePrivy()
  const { exchange } = useVelfiSignIn()
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
    if (!ready || processed.current) return
    if (!authenticated) { navigate('/login', { replace: true }); return }
    processed.current = true
    ;(async () => {
      try {
        setStep(0)
        await new Promise(r => setTimeout(r, 400))
        setStep(1)
        const { isNew, address } = await exchange() // verifies Google + reads your new BNB Chain wallet
        addrRef.current = address
        if (!isNew) setReturning(true)
        setStep(2)
        await new Promise(r => setTimeout(r, 650))

        if (isNew) setPhase('username')
        else navigate('/', { replace: true })
      } catch (err) {
        setError(err.message || t('somethingWrong'))
        setPhase('error')
      }
    })()
  }, [ready, authenticated])

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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true', 'x-velfi-lang': getLang() },
        body: JSON.stringify({ username: claimName })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('couldNotClaim'))
      login(data.token || token, { ...user, username: claimName })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setClaiming(false)
    }
  }

  const ok = status === 'available' && username.length >= 3
  return (
    <div className="auth-dark">
    <main className="auth screen" style={{ gridTemplateRows: '1fr', gridTemplateColumns: '1fr', maxWidth: 520 }}>
      {phase === 'error' ? (
        <div className="auth-art">
          <h1 style={{ fontSize: 34 }}>{t('didntWork')}</h1>
          <p className="auth-err" role="alert">{error}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button className="btn primary" onClick={() => window.location.reload()}>{t('tryAgain')}</button>
            <button className="btn ghost" onClick={() => navigate('/login')}>{t('backToSignIn')}</button>
          </div>
        </div>
      ) : phase === 'loading' ? (
        <div className="auth-art" aria-live="polite">
          <div className="loader-mark">
            <svg width="56" height="56" viewBox="0 0 40 40" fill="none" aria-hidden="true">
              <line style={{ '--d': '0.1s' }} x1="13" y1="9" x2="13" y2="27" pathLength="1" />
              <line style={{ '--d': '0.3s' }} x1="20" y1="9" x2="20" y2="31" pathLength="1" />
              <line style={{ '--d': '0.5s' }} x1="27" y1="9" x2="27" y2="27" pathLength="1" />
              <line style={{ '--d': '0.75s' }} x1="9" y1="20" x2="31" y2="20" pathLength="1" />
            </svg>
          </div>
          <h1 style={{ fontSize: 34, marginTop: 10 }}>{returning ? t('welcomeBack') : t('creatingAccount')}</h1>
          <p className="lede" key={step}>{t(COPY[step])}</p>
          <div className="steps-dots"><i className={step >= 0 ? 'on' : ''} /><i className={step >= 1 ? 'on' : ''} /><i className={step >= 2 ? 'on' : ''} /></div>
        </div>
      ) : (
        <div className="stack" style={{ alignContent: 'center' }}>
          <Pill tone="lime">{t('walletReady')}</Pill>
          <h1 className="flow-title" style={{ fontSize: 40 }}>{t('claimName')}</h1>
          <p className="lede" style={{ color: 'var(--t2)' }}>{t('claimLede')}</p>
          <label className="claim-box">
            <span className="sr">{t('yourName')}</span>
            <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
              placeholder="yourname" maxLength={20} autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onKeyDown={e => { if (e.key === 'Enter' && ok) handleClaim() }} />
            <span aria-hidden="true">.vel</span>
          </label>
          <div aria-live="polite" style={{ minHeight: 30 }}>
            {username.length > 0 && username.length < 3 && <Pill tone="soft">{t('min3')}</Pill>}
            {status === 'checking' && <Pill tone="soft">{t('checking')}</Pill>}
            {ok && <Pill tone="lime">{t('nameFree', { name: username })}</Pill>}
            {status === 'taken' && <Pill tone="amber">{t('nameTaken', { name: username })}</Pill>}
          </div>
          {status === 'taken' && suggestions.length > 0 && (
            <div className="chips-row" style={{ marginTop: 0 }}>
              {suggestions.map(s => <button key={s} className="pill" onClick={() => { setUsername(s); setStatus('available') }}>{s}.vel</button>)}
            </div>
          )}
          {error && <p className="auth-err" role="alert">{error}</p>}
          <button className="btn primary block" style={{ minHeight: 56 }} onClick={() => handleClaim()} disabled={claiming || !ok}>
            {claiming ? <span className="spin" /> : t('claimContinue')}
          </button>
        </div>
      )}
    </main>
    </div>
  )
}
