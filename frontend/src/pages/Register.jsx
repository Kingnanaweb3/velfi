import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

const BACKEND = 'http://localhost:3001'

export default function Register() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const { user, token } = useAuth()
  const navigate = useNavigate()

  async function handleRegister() {
    if (!username) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suiAddress: user?.sui_address, username: username.toLowerCase() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '0 32px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 className="display" style={{ fontSize: 24, fontWeight: 700, color: '#FFFFFF' }}>Pick your username</h1>
        <p style={{ fontSize: 13, color: '#9A9AAF', marginTop: 8 }}>This is your Vel.fi identity</p>
      </div>
      <div style={{ width: '100%', maxWidth: 320, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: '14px 16px', gap: 8 }}>
          <span style={{ fontSize: 14, color: '#9A9AAF' }}>@</span>
          <input value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="yourname" maxLength={20}
            style={{ flex: 1, background: 'none', color: '#FFFFFF', fontSize: 15, fontWeight: 500 }} />
          <span style={{ fontSize: 13, color: 'var(--purple)', fontWeight: 500 }}>.vel</span>
        </div>
        <p style={{ fontSize: 11, color: '#5A5A6A', marginTop: 8, paddingLeft: 4 }}>3-20 chars, lowercase, numbers, underscores</p>
      </div>
      {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
      <button onClick={handleRegister} disabled={loading || username.length < 3} style={{ width: '100%', maxWidth: 320, background: 'var(--purple)', color: '#FFFFFF', borderRadius: 'var(--radius-btn)', padding: '15px', fontSize: 14, fontWeight: 600, opacity: loading || username.length < 3 ? 0.5 : 1 }}>
        {loading ? 'Claiming...' : `Claim ${username || 'username'}.vel`}
      </button>
    </div>
  )
}
