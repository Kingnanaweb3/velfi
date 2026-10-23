import { createContext, useContext, useState, useEffect } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const AuthContext = createContext(null)

// BNB Chain sessions carry a 0x address. Anything else is left over from the Solana version.
const EVM = /^0x[0-9a-fA-F]{40}$/
const isBnbSession = (u) => EVM.test(String(u?.wallet_address || u?.address || ''))

export function AuthProvider({ children }) {
  const privy = usePrivy()
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('velfi_token')
      const savedUser = localStorage.getItem('velfi_user')
      const parsed = savedUser ? JSON.parse(savedUser) : null
      if (savedToken && parsed && isBnbSession(parsed)) {
        setToken(savedToken)
        setUser(parsed)
      } else if (savedToken || savedUser) {
        // A session from the Solana version: sign in again to get the BNB Chain wallet.
        localStorage.removeItem('velfi_token')
        localStorage.removeItem('velfi_user')
      }
    } catch (err) {
      console.error('Auth restore error:', err)
      localStorage.removeItem('velfi_token')
      localStorage.removeItem('velfi_user')
    } finally {
      setLoading(false)
    }
  }, [])

  function login(token, user) {
    localStorage.setItem('velfi_token', token)
    localStorage.setItem('velfi_user', JSON.stringify(user))
    setToken(token)
    setUser(user)
  }

  // The backend says this session is from the old version: start a fresh sign in.
  useEffect(() => {
    const onReauth = () => logout()
    window.addEventListener('velfi:reauth', onReauth)
    return () => window.removeEventListener('velfi:reauth', onReauth)
  })

  function logout() {
    localStorage.removeItem('velfi_token')
    localStorage.removeItem('velfi_user')
    setToken(null)
    setUser(null)
    privy.logout().catch(() => {})
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
