import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

// The shared demo wallet is gone: on BNB Chain every user signs with their own
// wallet, so the demo link now goes straight to Google sign-in.
export default function Demo() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/login', { replace: true }) }, [])
  return null
}
