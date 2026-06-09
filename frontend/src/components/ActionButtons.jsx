const actions = [
  { label: 'Receive', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.5"><path d="M12 2v14M5 9l7 7 7-7"/></svg> },
  { label: 'Split', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.5"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg> },
  { label: 'Stream', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.5"><path d="M2 12s3-5 10-5 10 5 10 5-3 5-10 5-10-5-10-5z"/></svg> },
  { label: 'Invest', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.5"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg> },
  { label: 'Request', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> },
]

export default function ActionButtons() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 6 }}>
      {actions.map(({ label, icon }) => (
        <button key={label} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '12px 4px', flex: 1,
        }}>
          {icon}
          <span style={{ fontSize: 11, fontWeight: 500, color: '#FFFFFF' }}>{label}</span>
        </button>
      ))}
    </div>
  )
}
