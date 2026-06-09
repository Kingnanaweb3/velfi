import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate } from 'react-router-dom'

export default function Account() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="page" style={{ padding: '24px 20px' }}>
      <h2 className="display" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginBottom: 24 }}>Account</h2>

      {/* Profile */}
      <div style={{ background: 'var(--card)', borderRadius: 'var(--radius)', padding: '20px', marginBottom: 16, boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {user?.avatar_url ? (
            <img src={user.avatar_url} style={{ width: 48, height: 48, borderRadius: '50%' }} alt="avatar" />
          ) : (
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#fff' }}>
              {user?.email?.[0]?.toUpperCase() || 'V'}
            </div>
          )}
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{user?.username ? `@${user.username}` : 'No username'}</p>
            <p style={{ fontSize: 12, color: 'var(--text2)' }}>{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Sui Address */}
      <div style={{ background: 'var(--card)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 16, boxShadow: 'var(--shadow)' }}>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>SUI ADDRESS</p>
        <p style={{ fontSize: 11, color: 'var(--text2)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
          {user?.suiAddress || user?.sui_address || '—'}
        </p>
      </div>

      {/* Settings placeholder */}
      <div style={{ background: 'var(--card)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 24, boxShadow: 'var(--shadow)' }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Theme</p>
        <p style={{ fontSize: 12, color: 'var(--text2)' }}>Follows system preference • Override in Settings coming soon</p>
      </div>

      {/* Logout */}
      <button onClick={handleLogout} style={{
        width: '100%', background: 'transparent',
        border: '1px solid var(--red)', borderRadius: 'var(--radius-btn)',
        padding: '14px', fontSize: 14, fontWeight: 600, color: 'var(--red)',
        cursor: 'pointer'
      }}>
        Log Out
      </button>
    </div>
  )
}
