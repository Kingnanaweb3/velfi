import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const BACKEND = 'http://localhost:3001'

export default function Register() {
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState(null) // 'available' | 'taken' | 'checking'
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { user, token, login } = useAuth()
  const navigate = useNavigate()

  // Debounced availability check
  useEffect(() => {
    if (username.length < 3) { setStatus(null); setSuggestions([]); return }
    setStatus('checking')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${BACKEND}/users/${username}`)
        if (res.ok) {
          setStatus('taken')
          setSuggestions([`${username}pay`, `hey${username}`, `${username}1`])
        } else {
          setStatus('available')
          setSuggestions([`${username}pay`, `hey${username}`, `${username}vel`])
        }
      } catch {
        setStatus('available')
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [username])

  async function handleClaim(name = username) {
    if (!name || name.length < 3) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ suiAddress: user?.suiAddress || user?.sui_address, username: name.toLowerCase() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      login(token, { ...user, username: name })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#000000', padding: '0 28px',
      position: 'relative', overflow: 'hidden'
    }}>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) }
          50% { transform: translateY(-10px) }
        }
        @keyframes orbit {
          from { transform: rotateX(70deg) rotateZ(0deg) }
          to { transform: rotateX(70deg) rotateZ(360deg) }
        }
        @keyframes orbitReverse {
          from { transform: rotateX(70deg) rotateZ(0deg) }
          to { transform: rotateX(70deg) rotateZ(-360deg) }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.4; transform: scale(1) }
          50% { opacity: 0.8; transform: scale(1.05) }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 30px 8px rgba(100,60,220,0.3) }
          50% { box-shadow: 0 0 50px 15px rgba(120,80,240,0.5) }
        }
      `}</style>

      {/* 3D floating icon */}
      <div style={{
        position: 'relative', width: 160, height: 160,
        marginBottom: 36,
        animation: 'float 4s ease-in-out infinite'
      }}>
        {/* Outer glow */}
        <div style={{
          position: 'absolute', inset: -20,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(100,60,220,0.2) 0%, transparent 70%)',
          animation: 'pulse 3s ease-in-out infinite'
        }} />

        {/* Orbital ring */}
        <div style={{
          position: 'absolute', inset: -16,
          borderRadius: '50%',
          border: '1.5px solid rgba(140,100,255,0.4)',
          animation: 'orbit 6s linear infinite',
          transformStyle: 'preserve-3d'
        }}>
          <div style={{
            position: 'absolute', top: -4, left: '50%',
            transform: 'translateX(-50%)',
            width: 8, height: 8, borderRadius: '50%',
            background: '#A78BFA',
            boxShadow: '0 0 10px 4px rgba(167,139,250,0.8)'
          }} />
        </div>

        {/* Second ring */}
        <div style={{
          position: 'absolute', inset: -6,
          borderRadius: '50%',
          border: '1px solid rgba(100,60,200,0.2)',
          animation: 'orbitReverse 10s linear infinite',
          transformStyle: 'preserve-3d'
        }}>
          <div style={{
            position: 'absolute', bottom: -3, right: 8,
            width: 5, height: 5, borderRadius: '50%',
            background: '#818CF8',
            boxShadow: '0 0 6px 2px rgba(129,140,248,0.7)'
          }} />
        </div>

        {/* Hexagon body */}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            width: 130, height: 130,
            clipPath: 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)',
            background: 'linear-gradient(135deg, rgba(120,70,240,0.95) 0%, rgba(60,20,160,0.9) 50%, rgba(20,5,80,1) 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            animation: 'glow 3s ease-in-out infinite'
          }}>
            {/* Shine */}
            <div style={{
              position: 'absolute', top: '10%', left: '20%',
              width: '40%', height: '30%',
              background: 'radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 70%)',
              clipPath: 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)'
            }} />
            {/* @ symbol */}
            <span style={{
              fontSize: 48, fontWeight: 300,
              color: 'rgba(230,210,255,0.95)',
              fontFamily: 'SF Pro Display, -apple-system, sans-serif',
              letterSpacing: '-2px',
              textShadow: '0 0 20px rgba(200,160,255,0.5)'
            }}>@</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 className="display" style={{
          fontSize: 28, fontWeight: 400, color: '#FFFFFF',
          letterSpacing: '-0.5px', marginBottom: 8
        }}>Choose your username</h1>
        <p style={{ fontSize: 14, color: '#555570', fontWeight: 300 }}>
          People will send you money using this
        </p>
      </div>

      {/* Input */}
      <div style={{ width: '100%', maxWidth: 340, marginBottom: 12 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          background: '#0D0D0D',
          border: `1px solid ${status === 'available' ? 'rgba(100,60,220,0.6)' : status === 'taken' ? 'rgba(255,80,100,0.4)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 16, padding: '14px 16px', gap: 8,
          transition: 'border-color 0.3s'
        }}>
          <span style={{ fontSize: 16, color: '#555570' }}>@</span>
          <input
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="yourname"
            maxLength={20}
            autoFocus
            style={{
              flex: 1, background: 'none', color: '#FFFFFF',
              fontSize: 16, fontWeight: 300, outline: 'none', border: 'none'
            }}
          />
          <span style={{ fontSize: 13, color: 'rgba(100,60,220,0.8)', fontWeight: 500 }}>.vel</span>
        </div>

        {/* Status */}
        {status === 'available' && username.length >= 3 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 4 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid #22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                <path d="M2 5L4 7L8 3" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 12, color: '#22C55E' }}>{username}.vel is available</span>
          </div>
        )}
        {status === 'taken' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 4 }}>
            <span style={{ fontSize: 12, color: '#FF5C7C' }}>✕ Already taken</span>
          </div>
        )}
        {status === 'checking' && (
          <p style={{ fontSize: 11, color: '#444', marginTop: 8, paddingLeft: 4 }}>Checking availability...</p>
        )}
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && username.length >= 3 && (
        <div style={{ width: '100%', maxWidth: 340, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, height: '1px', background: '#1A1A1A' }} />
            <span style={{ fontSize: 11, color: '#333' }}>or try these</span>
            <div style={{ flex: 1, height: '1px', background: '#1A1A1A' }} />
          </div>
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => { setUsername(s); handleClaim(s) }} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#0D0D0D', border: '1px solid #1A1A1A', borderRadius: 14,
              padding: '14px 16px', marginBottom: 8, cursor: 'pointer',
              transition: 'border-color 0.2s'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: 'rgba(140,100,255,0.8)', fontSize: 14 }}>✦</span>
                <span style={{ fontSize: 14, color: '#FFFFFF', fontWeight: 300 }}>{s}.vel</span>
              </div>
              <span style={{ fontSize: 12, color: '#444' }}>↗</span>
            </button>
          ))}
        </div>
      )}

      {error && <p style={{ fontSize: 12, color: '#FF5C7C', marginBottom: 12 }}>{error}</p>}

      {/* CTA */}
      <div style={{ width: '100%', maxWidth: 340 }}>
        <button
          onClick={() => handleClaim()}
          disabled={loading || username.length < 3 || status === 'taken'}
          style={{
            width: '100%',
            background: username.length >= 3 && status !== 'taken'
              ? 'linear-gradient(135deg, #7C3AED, #6D28D9)'
              : '#1A1A1A',
            borderRadius: 999, padding: '16px',
            fontSize: 15, fontWeight: 400, color: '#FFFFFF',
            opacity: loading ? 0.7 : 1,
            transition: 'all 0.3s', marginBottom: 16,
            border: 'none', cursor: 'pointer'
          }}>
          {loading ? 'Claiming...' : `Continue`}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontSize: 11, color: '#333' }}>You can't change this later</span>
        </div>
      </div>
    </div>
  )
}
