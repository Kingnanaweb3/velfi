export default function BalanceCard({ balance, loading }) {
  const suiPrice = 3.2
  const usdValue = balance
    ? (parseFloat(balance) * suiPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00'

  return (
    <div style={{
      background: 'var(--gradient-balance)',
      borderRadius: 'var(--radius)',
      padding: '16px',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minHeight: 200,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 400, color: '#9A9AAF', letterSpacing: 0.1 }}>Total Balance</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9A9AAF" strokeWidth="1.5">
          <circle cx="12" cy="12" r="3"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/>
        </svg>
      </div>

      {loading ? (
        <div style={{ height: 32, background: 'rgba(255,255,255,0.05)', borderRadius: 8 }} />
      ) : (
        <div className="display" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.5px', lineHeight: 1, color: '#FFFFFF' }}>
          ${usdValue}
        </div>
      )}

      {!loading && (
        <div style={{ fontSize: 11, fontWeight: 300, color: '#9A9AAF' }}>{balance} SUI</div>
      )}

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: 'rgba(41,209,125,0.1)', borderRadius: 'var(--radius-btn)',
        padding: '3px 8px', width: 'fit-content',
        border: '1px solid rgba(41,209,125,0.15)'
      }}>
        <span style={{ fontSize: 10, fontWeight: 500, color: '#29D17D', whiteSpace: 'nowrap' }}>↑ +2.4% this month</span>
      </div>

      <button className="display" style={{
        marginTop: 'auto',
        background: '#FFFFFF', color: '#111111',
        borderRadius: 'var(--radius-btn)', padding: '10px 14px',
        fontWeight: 500, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      }}>
        Send
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 17L17 7M17 7H7M17 7v10"/>
        </svg>
      </button>
    </div>
  )
}
