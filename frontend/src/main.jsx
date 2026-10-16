import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import { CLUSTER, RPC_URL } from './lib/chain.js'
import { AuthProvider } from './context/AuthContext.jsx'
import App from './App.jsx'
import './index.css'

function applyTheme() {
  const saved = localStorage.getItem('velfi_theme')
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved)
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
  }
}

applyTheme()

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  const saved = localStorage.getItem('velfi_theme')
  if (!saved) {
    document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light')
  }
})

// Google sign-in creates a Solana wallet the user owns (no seed phrase).
// Velfi's own "slide to approve" sheet is the confirmation step, so Privy's
// extra wallet pop-ups are turned off.
const PRIVY_CONFIG = {
  loginMethods: ['google'],
  appearance: { walletChainType: 'solana-only', theme: 'dark', accentColor: '#7B4FFF' },
  embeddedWallets: {
    solana: { createOnLogin: 'users-without-wallets' },
    ethereum: { createOnLogin: 'off' },
    showWalletUIs: false,
  },
  solanaClusters: [{ name: CLUSTER, rpcUrl: RPC_URL }],
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrivyProvider appId={import.meta.env.VITE_PRIVY_APP_ID} config={PRIVY_CONFIG}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </PrivyProvider>
  </StrictMode>
)
