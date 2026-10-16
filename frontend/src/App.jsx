import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { House, Repeat, Sprout, UserRound } from 'lucide-react'
import { useAuth } from './context/AuthContext.jsx'
import { Logo } from './ui/kit.jsx'
import Demo from './pages/Demo.jsx'
import Home from './pages/Home.jsx'
import Flows from './pages/Flows.jsx'
import Invest from './pages/Invest.jsx'
import Activity from './pages/Activity.jsx'
import Account from './pages/Account.jsx'
import Chat from './pages/Chat.jsx'
import Login from './pages/Login.jsx'
import AuthCallback from './pages/AuthCallback.jsx'

const TABS = [
  { path: '/', label: 'Home', Icon: House },
  { path: '/flows', label: 'Flows', Icon: Repeat },
  { path: '/invest', label: 'Invest', Icon: Sprout },
  { path: '/account', label: 'Account', Icon: UserRound },
]

function Loading() {
  return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', color: 'var(--t3)' }}><span className="spin" /></div>
}

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!user.username) return <Navigate to="/auth/callback" replace />
  return children
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (user?.username) return <Navigate to="/" replace />
  return children
}

// Tabs move between places. Actions live on the screens.
function Nav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const go = (p) => { if (p !== pathname) { navigate(p); window.scrollTo({ top: 0 }) } }
  return (
    <>
      <aside className="side">
        <button className="side-logo" onClick={() => go('/')} aria-label="Velfi home"><Logo size={24} /></button>
        <nav aria-label="Sections">
          {TABS.map(({ path, label, Icon }) => (
            <button key={path} className={pathname === path ? 'on' : ''} aria-current={pathname === path ? 'page' : undefined} onClick={() => go(path)}>
              <Icon size={21} strokeWidth={1.8} />{label}
            </button>
          ))}
        </nav>
      </aside>
      <nav className="tabs" aria-label="Sections">
        {TABS.map(({ path, label, Icon }) => (
          <button key={path} className={pathname === path ? 'on' : ''} aria-label={label} aria-current={pathname === path ? 'page' : undefined} onClick={() => go(path)}>
            <Icon size={22} strokeWidth={1.8} /><span className="lbl">{label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

export default function App() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const showNav = !!user?.username && TABS.some(t => t.path === pathname)
  return (
    <div className={`frame ${showNav ? 'with-nav' : ''}`}>
      {showNav && <Nav />}
      <Routes>
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<Navigate to="/auth/callback" replace />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/" element={<Protected><Home /></Protected>} />
        <Route path="/chat" element={<Protected><Chat /></Protected>} />
        <Route path="/flows" element={<Protected><Flows /></Protected>} />
        <Route path="/invest" element={<Protected><Invest /></Protected>} />
        <Route path="/activity" element={<Protected><Activity /></Protected>} />
        <Route path="/account" element={<Protected><Account /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}
