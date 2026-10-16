// Google sign-in through Privy, then a Velfi session from the backend.
import { useState, useCallback, useRef } from 'react'
import { useLoginWithOAuth, usePrivy } from '@privy-io/react-auth'
import { useSolanaWallets } from '@privy-io/react-auth/solana'
import { useAuth } from '../context/AuthContext.jsx'

const API = '/api'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export function useVelfiSignIn({ onSignedIn } = {}) {
  const { login } = useAuth()
  const { getAccessToken, user: privyUser } = usePrivy()
  const { createWallet } = useSolanaWallets()
  const userRef = useRef(privyUser)
  userRef.current = privyUser

  // Make sure this person has a Privy Solana wallet. Privy usually creates it at
  // sign-in, but if that didn't happen (or hasn't yet), create it here.
  const ensureWallet = useCallback(async () => {
    const has = (userRef.current?.linkedAccounts || []).some(a => a.type === 'wallet' && a.chainType === 'solana' && a.walletClientType === 'privy')
    if (has) return
    try { await createWallet() }
    catch (e) { if (!/already/i.test(String(e?.message || e))) console.warn('Solana wallet creation:', e?.message || e) }
  }, [createWallet])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Swap the Privy session for a Velfi one. The wallet can take a moment to be
  // created right after a first sign-in, so retry briefly on 409.
  const exchange = useCallback(async () => {
    await ensureWallet()
    for (let attempt = 0; attempt < 15; attempt++) {
      const accessToken = await getAccessToken()
      const r = await fetch(`${API}/auth/privy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
        body: JSON.stringify({ accessToken }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 409) { if (attempt === 4) await ensureWallet(); await sleep(1000); continue }
      if (!r.ok) throw new Error(d.error || 'Sign-in failed. Please try again.')
      login(d.token, { ...d.user, address: d.address })
      return d
    }
    throw new Error('Your wallet is taking longer than usual to set up. Please try again.')
  }, [getAccessToken, login, ensureWallet])

  const { initOAuth } = useLoginWithOAuth({
    onComplete: async () => {
      try { onSignedIn?.() } catch (e) { setError(e.message) }
    },
    onError: (e) => { setError(String(e?.message || e || 'Sign-in was cancelled.')); setLoading(false) },
  })

  async function startGoogleLogin() {
    setError(null); setLoading(true)
    try { await initOAuth({ provider: 'google' }) } catch (e) { setError(e.message); setLoading(false) }
  }

  return { startGoogleLogin, exchange, loading, error }
}
