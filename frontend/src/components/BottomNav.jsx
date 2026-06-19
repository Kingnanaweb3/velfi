import { useLocation, useNavigate } from 'react-router-dom'
import { Home, ArrowRightLeft, TrendingUp, User } from 'lucide-react'

const tabs = [
  { path: '/', label: 'Home', Icon: Home },
  { path: '/flows', label: 'Flows', Icon: ArrowRightLeft },
  { path: '/invest', label: 'Invest', Icon: TrendingUp },
  { path: '/account', label: 'Account', Icon: User },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <nav className="vnav">
      <style>{`
        .vnav{ position:fixed; bottom:0; left:50%; transform:translateX(-50%);
          width:100%; max-width:430px; display:flex; padding:10px 8px 26px; z-index:100;
          background:var(--v-card-solid); border-top:1px solid var(--v-card-bd);
          -webkit-backdrop-filter:blur(16px); backdrop-filter:blur(16px);
          font-family:'DM Sans',system-ui,sans-serif; }
        .vnav-tab{ flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; background:none; padding:2px 0; }
        .vnav-tab span{ font-size:11px; }
      `}</style>
      {tabs.map(({ path, label, Icon }) => {
        const active = location.pathname === path
        const color = active ? 'var(--v-accent)' : 'var(--v-sub)'
        return (
          <button key={path} className="vnav-tab" onClick={() => navigate(path)}>
            <Icon size={21} color={color} strokeWidth={active ? 2.3 : 1.8} />
            <span style={{ color, fontWeight: active ? 700 : 500 }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
