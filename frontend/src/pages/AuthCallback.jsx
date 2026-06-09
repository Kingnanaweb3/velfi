import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useZkLogin } from '../hooks/useZkLogin.js'

const STEPS = [
  { id: 0, label: 'Verified', icon: '✓' },
  { id: 1, label: 'Creating', icon: '✦' },
  { id: 2, label: 'Securing', icon: '🔒' },
  { id: 3, label: 'Almost done', icon: '👤' },
]

export default function AuthCallback() {
  const navigate = useNavigate()
  const { handleCallback } = useZkLogin()
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState(null)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    async function process() {
      try {
        const hash = window.location.hash.substring(1)
        const params = new URLSearchParams(hash)
        const idToken = params.get('id_token')

        if (!idToken) {
          setError('No token found')
          setTimeout(() => navigate('/login'), 2000)
          return
        }

        setCurrentStep(0)
        await new Promise(r => setTimeout(r, 600))
        setCurrentStep(1)
        await new Promise(r => setTimeout(r, 800))

        const { isNew } = await handleCallback(idToken)

        setCurrentStep(2)
        await new Promise(r => setTimeout(r, 700))
        setCurrentStep(3)
        await new Promise(r => setTimeout(r, 600))

        if (isNew) {
          navigate('/register', { replace: true })
        } else {
          navigate('/', { replace: true })
        }
      } catch (err) {
        setError(err.message)
      }
    }

    process()
  }, [])

  if (error) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#000', gap: 16, padding: '0 32px' }}>
        <p style={{ fontSize: 14, color: '#FF5C7C', textAlign: 'center' }}>Error: {error}</p>
        <button onClick={() => navigate('/login')} style={{ background: '#1A1A1A', color: '#fff', border: '1px solid #333', borderRadius: 12, padding: '10px 20px', fontSize: 13 }}>
          Back to Login
        </button>
      </div>
    )
  }

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#000000', padding: '0 32px', position: 'relative', overflow: 'hidden'
    }}>
      <style>{`
        @keyframes orbPulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.06); opacity: 1; }
        }
        @keyframes orbRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes orbRotateReverse {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
        @keyframes particleFloat {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.6; }
          50% { transform: translateY(-8px) scale(1.3); opacity: 1; }
        }
        @keyframes stepAppear {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
      `}</style>

      {/* Orb container */}
      <div style={{ position: 'relative', width: 200, height: 200, marginBottom: 48 }}>

        {/* Outer glow */}
        <div style={{
          position: 'absolute', inset: -30,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(100,60,220,0.2) 0%, transparent 70%)',
          animation: 'orbPulse 3s ease-in-out infinite'
        }} />

        {/* Orbital ring 1 */}
        <div style={{
          position: 'absolute', inset: -20,
          borderRadius: '50%',
          border: '1px solid rgba(120,80,255,0.3)',
          animation: 'orbRotate 8s linear infinite',
          transform: 'rotateX(70deg)'
        }}>
          {/* Ring dot */}
          <div style={{
            position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)',
            width: 6, height: 6, borderRadius: '50%',
            background: '#C084FC',
            boxShadow: '0 0 8px 3px rgba(192,132,252,0.8)'
          }} />
        </div>

        {/* Orbital ring 2 */}
        <div style={{
          position: 'absolute', inset: -8,
          borderRadius: '50%',
          border: '1px solid rgba(100,60,200,0.2)',
          animation: 'orbRotateReverse 12s linear infinite',
          transform: 'rotateX(70deg) rotateZ(60deg)'
        }}>
          <div style={{
            position: 'absolute', bottom: -3, left: '50%', transform: 'translateX(-50%)',
            width: 4, height: 4, borderRadius: '50%',
            background: '#818CF8',
            boxShadow: '0 0 6px 2px rgba(129,140,248,0.8)'
          }} />
        </div>

        {/* Main orb body */}
        <div style={{
          position: 'absolute', inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, rgba(120,70,240,0.95) 0%, rgba(60,20,160,0.9) 40%, rgba(15,5,50,1) 75%)',
          boxShadow: '0 0 40px 10px rgba(100,50,220,0.3), inset 0 0 30px rgba(0,0,0,0.5)',
          animation: 'orbPulse 3s ease-in-out infinite'
        }} />

        {/* Orb shine */}
        <div style={{
          position: 'absolute', top: '12%', left: '18%',
          width: '35%', height: '25%',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(255,255,255,0.15) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />

        {/* Shield checkmark icon */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <path
              d="M26 4L8 12V26C8 36.5 16.1 46.3 26 49C35.9 46.3 44 36.5 44 26V12L26 4Z"
              stroke="rgba(220,200,255,0.9)"
              strokeWidth="1.5"
              fill="rgba(100,60,200,0.15)"
            />
            <path
              d="M18 26L23 31L34 20"
              stroke="rgba(230,210,255,0.95)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Floating particles */}
        {[
          { top: '8%', left: '15%', delay: '0s', size: 3 },
          { top: '75%', right: '12%', delay: '1.2s', size: 2 },
          { top: '20%', right: '8%', delay: '0.6s', size: 2 },
          { bottom: '15%', left: '20%', delay: '1.8s', size: 3 },
        ].map((p, i) => (
          <div key={i} style={{
            position: 'absolute', ...p,
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: 'rgba(180,140,255,0.8)',
            boxShadow: '0 0 4px 2px rgba(160,120,255,0.6)',
            animation: `particleFloat ${2 + i * 0.4}s ease-in-out infinite`,
            animationDelay: p.delay
          }} />
        ))}
      </div>

      {/* Text */}
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <h2 className="display" style={{ fontSize: 26, fontWeight: 400, color: '#FFFFFF', marginBottom: 10, letterSpacing: '-0.3px' }}>
          Creating your
        </h2>
        <h2 className="display" style={{ fontSize: 26, fontWeight: 400, letterSpacing: '-0.3px', marginBottom: 12 }}>
          <span style={{ background: 'linear-gradient(135deg, #9B6DFF, #4B83FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Velfi</span>
          <span style={{ color: '#FFFFFF' }}> account</span>
        </h2>
        <p style={{ fontSize: 13, color: '#555570', fontWeight: 300 }}>
          Securing your identity and setting things up for you...
        </p>
      </div>

      {/* Step progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {STEPS.map((step, i) => (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center' }}>
            {/* Step circle */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i < currentStep
                  ? 'linear-gradient(135deg, #7C4DFF, #6C3FEF)'
                  : i === currentStep
                    ? 'transparent'
                    : '#1A1A1A',
                border: i === currentStep
                  ? '2px solid #7C4DFF'
                  : i < currentStep
                    ? 'none'
                    : '2px solid #2A2A2A',
                boxShadow: i === currentStep ? '0 0 12px rgba(124,77,255,0.5)' : 'none',
                transition: 'all 0.4s ease',
                animation: i === currentStep ? 'shimmer 1.5s ease-in-out infinite' : 'none'
              }}>
                {i < currentStep ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L6.5 11.5L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : i === currentStep ? (
                  <span style={{ fontSize: 16 }}>✦</span>
                ) : i === 2 ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                )}
              </div>
              <span style={{
                fontSize: 11, fontWeight: 400,
                color: i <= currentStep ? (i === currentStep ? '#7C4DFF' : '#FFFFFF') : '#333',
                transition: 'color 0.4s ease',
                whiteSpace: 'nowrap'
              }}>
                {step.label}
              </span>
            </div>

            {/* Dashed connector */}
            {i < STEPS.length - 1 && (
              <div style={{
                width: 40, height: 1, marginBottom: 24, marginLeft: 4, marginRight: 4,
                background: i < currentStep
                  ? 'linear-gradient(90deg, #7C4DFF, #6C3FEF)'
                  : 'repeating-linear-gradient(90deg, #2A2A2A 0px, #2A2A2A 4px, transparent 4px, transparent 8px)',
                transition: 'background 0.4s ease'
              }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
