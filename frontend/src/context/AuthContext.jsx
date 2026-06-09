import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('velfi_token')
      const savedUser = localStorage.getItem('velfi_user')
      if (savedToken && savedUser) {
        setToken(savedToken)
        setUser(JSON.parse(savedUser))
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

  function logout() {
    localStorage.removeItem('velfi_token')
    localStorage.removeItem('velfi_user')
    localStorage.removeItem('velfi_ephemeral')
    localStorage.removeItem('velfi_zkproof')
    setToken(null)
    setUser(null)
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
