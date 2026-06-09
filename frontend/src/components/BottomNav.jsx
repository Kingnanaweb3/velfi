import { useLocation, useNavigate } from 'react-router-dom'

const tabs = [
  { path: '/', label: 'Home', icon: HomeIcon },
  { path: '/invest', label: 'Invest', icon: InvestIcon },
  { path: '/activity', label: 'Activity', icon: ActivityIcon },
  { path: '/account', label: 'Account', icon: AccountIcon },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430,
      background: 'rgba(11,13,17,0.95)',
      backdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border)',
      display: 'flex', padding: '10px 0 28px', zIndex: 100
    }}>
      {tabs.map(({ path, label, icon: Icon }) => {
        const active = location.pathname === path
        return (
          <button key={path} onClick={() => navigate(path)} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 4, background: 'none', padding: '2px 0'
          }}>
            <Icon color={active ? '#7C6DFF' : '#8A8AA0'} />
            <span style={{ fontSize: 11, fontWeight: active ? 600 : 500, color: active ? '#7C6DFF' : '#8A8AA0' }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function HomeIcon({ color }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill={color}><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
}
function InvestIcon({ color }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
}
function ActivityIcon({ color }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
}
function AccountIcon({ color }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
}
