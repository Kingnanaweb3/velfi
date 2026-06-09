import { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519'
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client'
import { generateRandomness, generateNonce, getExtendedEphemeralPublicKey } from '@mysten/zklogin'

const BACKEND = 'http://localhost:3001'
const GOOGLE_CLIENT_ID = '819258422444-6h33ugl352hmp4bn7gk9vbkj3cmh28j6.apps.googleusercontent.com'
const REDIRECT_URI = 'http://localhost:5173/auth/callback'

export function useZkLogin() {
  const { login } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function startGoogleLogin() {
    try {
      setLoading(true)

      const ephemeralKeyPair = new Ed25519Keypair()
      const client = new SuiClient({ url: getFullnodeUrl('testnet') })
      const { epoch } = await client.getLatestSuiSystemState()
      const maxEpoch = Number(epoch) + 10
      const randomness = generateRandomness()
      const nonce = generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness)

      // Store as hex — most reliable cross-browser approach
      const rawBytes = ephemeralKeyPair.keypair.secretKey.slice(0, 32)
      const hexKey = Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join('')

      localStorage.setItem('velfi_ephemeral', JSON.stringify({
        privateKey: hexKey,
        maxEpoch,
        randomness: randomness.toString()
      }))

      const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce,
      })

      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  async function handleCallback(idToken) {
    try {
      setLoading(true)

      const stored = JSON.parse(localStorage.getItem('velfi_ephemeral') || '{}')
      if (!stored.privateKey) throw new Error('No ephemeral key found')

      // Restore from hex
      const hexKey = stored.privateKey
      const keyBytes = new Uint8Array(hexKey.match(/.{1,2}/g).map(b => parseInt(b, 16)))
      const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(keyBytes)

      const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
        ephemeralKeyPair.getPublicKey()
      )

      console.log('Calling zklogin with token length:', idToken?.length)
      const authRes = await fetch(`${BACKEND}/auth/zklogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      })
      const authData = await authRes.json()
      if (!authRes.ok) throw new Error(authData.error)

      const { token, user, isNew, salt, suiAddress } = authData

      const proverRes = await fetch(`${BACKEND}/auth/prover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jwt: idToken,
          extendedEphemeralPublicKey,
          maxEpoch: stored.maxEpoch,
          jwtRandomness: stored.randomness,
          salt,
          keyClaimName: 'sub'
        })
      })
      const zkProof = await proverRes.json()

      localStorage.setItem('velfi_zkproof', JSON.stringify({
        zkProof, salt, suiAddress,
        maxEpoch: stored.maxEpoch,
        ephemeralPrivateKey: stored.privateKey
      }))

      login(token, { ...user, suiAddress })
      return { isNew, suiAddress }
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { startGoogleLogin, handleCallback, loading, error }
}
