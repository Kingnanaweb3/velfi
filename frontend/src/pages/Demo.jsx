import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

export default function Demo() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    ;(async () => {
      try {
        const r = await fetch('/api/auth/demo', { headers: { 'ngrok-skip-browser-warning': 'true' } })
        const d = await r.json()
        if (d.token) { login(d.token, d.user); navigate('/', { replace: true }) }
        else navigate('/login', { replace: true })
      } catch { navigate('/login', { replace: true }) }
    })()
  }, [])
  return (
    <div style={{ position:'fixed', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--v-bg, #0b0a12)', color:'var(--v-ink, #fff)', fontFamily:'var(--font-body, sans-serif)' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:34, height:34, margin:'0 auto 14px', borderRadius:'50%', border:'3px solid rgba(123,79,255,0.3)', borderTopColor:'#7B4FFF', animation:'spin .7s linear infinite' }} />
        <p style={{ fontSize:14, opacity:.7 }}>Setting up your demo wallet…</p>
      </div>
    </div>
  )
}
