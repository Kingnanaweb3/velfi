import './polyfills.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import { CLUSTER, RPC_URL } from './lib/chain.js'
import { initTheme } from './lib/theme.js'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './ui/kit.jsx'
import App from './App.jsx'
import './ui/velfi.css'

initTheme()

// Google sign-in creates a Solana wallet the user owns (no seed phrase).
// Velfi's own "slide to approve" sheet is the confirmation step, so Privy's
// extra wallet pop-ups are turned off.
const PRIVY_CONFIG = {
  loginMethods: ['google'],
  appearance: {
    walletChainType: 'solana-only',
    theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
    accentColor: '#7B4FFF',
  },
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
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </PrivyProvider>
  </StrictMode>
)
