import './polyfills.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import { CHAIN } from './lib/chain.js'
import { initTheme } from './lib/theme.js'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './ui/kit.jsx'
import App from './App.jsx'
import './ui/velfi.css'

initTheme()

// Google sign-in creates a BNB Chain (EVM) wallet the user owns (no seed phrase).
// Velfi's own "slide to approve" sheet is the confirmation step, so Privy's
// extra wallet pop-ups are turned off.
const PRIVY_CONFIG = {
  loginMethods: ['google'],
  appearance: {
    walletChainType: 'ethereum-only',
    theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
    accentColor: '#7B4FFF',
  },
  embeddedWallets: {
    ethereum: { createOnLogin: 'users-without-wallets' },
    solana: { createOnLogin: 'off' },
    showWalletUIs: false,
  },
  defaultChain: CHAIN,
  supportedChains: [CHAIN],
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
