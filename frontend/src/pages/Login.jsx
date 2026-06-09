import { useZkLogin } from '../hooks/useZkLogin.js'

export default function Login() {
  const { startGoogleLogin, loading, error } = useZkLogin()

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'var(--login-bg)', padding: '56px 28px 40px',
      position: 'relative', overflow: 'hidden'
    }}>
      {/* Orb glow */}
      {/* Inner planet glow — blends inward from arc */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-20%',
        width: '110%', height: '75%',
        background: 'radial-gradient(ellipse at 80% 15%, rgba(100,60,200,0.22) 0%, rgba(60,25,140,0.1) 35%, rgba(30,10,80,0.04) 55%, transparent 70%)',
        pointerEvents: 'none'
      }} />
      {/* Arc — just the visible curved line with glow */}
      <svg style={{
        position: 'absolute', top: 0, left: 0,
        width: '100%', height: '60%',
        pointerEvents: 'none', overflow: 'visible'
      }} viewBox="0 0 390 500" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="arcGlow" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(220,190,255,1)" />
            <stop offset="20%" stopColor="rgba(180,140,255,1)" />
            <stop offset="45%" stopColor="rgba(130,80,240,0.6)" />
            <stop offset="75%" stopColor="rgba(80,40,180,0.2)" />
            <stop offset="100%" stopColor="rgba(40,10,120,0)" />
          </linearGradient>
          <filter id="blur">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Soft glow hugging arc */}
        <path
          d="M 750 60 A 680 680 0 0 0 -80 650"
          fill="none"
          stroke="rgba(100,60,220,0.2)"
          strokeWidth="30"
          filter="url(#blur)"
        />
        {/* Tight glow on arc */}
        <path
          d="M 750 60 A 680 680 0 0 0 -80 650"
          fill="none"
          stroke="rgba(150,110,255,0.35)"
          strokeWidth="8"
          filter="url(#blur)"
        />
        {/* Main arc line */}
        <path
          d="M 750 60 A 680 680 0 0 0 -80 650"
          fill="none"
          stroke="url(#arcGlow)"
          strokeWidth="2.5"
        />
      </svg>

      {/* Logo */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <span className="display" style={{ fontSize: 32, fontWeight: 500, letterSpacing: '-0.5px' }}>
          <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #4B83FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>vel</span>
          <span style={{ color: 'var(--login-text)' }}>.fi</span>
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Hero */}
      <div style={{ position: 'relative', zIndex: 1, marginBottom: 36 }}>
        <h1 className="display" style={{ fontSize: 50, fontWeight: 400, lineHeight: 1.25, letterSpacing: '-0.5px', marginBottom: 14 }}>
          <span style={{ color: 'var(--login-text)' }}>Move </span>
          <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #4B83FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>money</span>
          <br />
          <span style={{ color: 'var(--login-text)' }}>differently</span>
        </h1>
        <p style={{ fontSize: 15, fontWeight: 300, color: 'var(--login-sub)', lineHeight: 1.8 }}>
          Send, stream and split crypto<br />with just a username
        </p>
      </div>

      {/* CTA */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <button onClick={startGoogleLogin} disabled={loading} style={{
          width: '100%',
          background: 'var(--login-btn-bg)',
          border: '1px solid var(--login-btn-border)',
          borderRadius: 'var(--radius-btn)', padding: '17px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontSize: 15, fontWeight: 300, color: 'var(--login-btn-text)',
          opacity: loading ? 0.7 : 1, marginBottom: 20,
          transition: 'opacity 0.2s'
        }}>
          {loading ? (
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid currentColor', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {error && <p style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center', marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--login-sub)" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M9 12l2 2 4-4"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--login-sub)' }}>Secured by zkLogin • No seed phrases</span>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--login-sub)' }}>
          New User?{' '}
          <span style={{ color: 'var(--purple)', fontWeight: 600 }}>Sign Up</span>
        </p>
      </div>
    </div>
  )
}
