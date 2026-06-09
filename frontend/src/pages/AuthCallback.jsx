import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useZkLogin } from '../hooks/useZkLogin.js'

export default function AuthCallback() {
  const navigate = useNavigate()
  const { handleCallback } = useZkLogin()
  const [status, setStatus] = useState('Verifying your identity...')
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

        console.log('Processing callback, token found:', !!idToken)

        if (!idToken) {
          setError('No authentication token found')
          setTimeout(() => navigate('/login'), 3000)
          return
        }

        setStatus('Creating your account...')
        const { isNew, suiAddress } = await handleCallback(idToken)
        console.log('handleCallback success, isNew:', isNew, 'address:', suiAddress)

        setStatus('Almost ready...')
        await new Promise(r => setTimeout(r, 800))

        if (isNew) {
          navigate('/register', { replace: true })
        } else {
          navigate('/', { replace: true })
        }
      } catch (err) {
        console.error('AuthCallback error:', err)
        setError(err.message)
      }
    }

    process()
  }, [])

  if (error) {
    return (
      <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 16, padding: '0 32px' }}>
        <p style={{ fontSize: 14, color: 'var(--red)', textAlign: 'center' }}>Error: {error}</p>
        <button onClick={() => navigate('/login')} style={{ background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 20px', fontSize: 13 }}>
          Back to Login
        </button>
      </div>
    )
  }

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid var(--text3)', borderTopColor: 'var(--text)', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ fontSize: 14, color: 'var(--text2)' }}>{status}</p>
    </div>
  )
}
