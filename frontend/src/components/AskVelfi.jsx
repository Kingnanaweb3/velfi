const suggestions = [
  { icon: '↗', text: 'Pay Sarah $50' },
  { icon: '👥', text: 'Split rent' },
  { icon: '〜', text: 'Create stream' },
]

export default function AskVelfi() {
  return (
    <div style={{
      background: 'var(--gradient-ai)',
      borderRadius: 'var(--radius)',
      padding: '16px',
      border: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      minHeight: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <p className="display" style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Ask Velfi</p>
          <p style={{ fontSize: 10, fontWeight: 400, color: '#8C8C9B', marginTop: 1 }}>Your AI financial assistant</p>
        </div>
        <div style={{
          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
          background: 'var(--purple)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
            <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
          </svg>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestions.map((s, i) => (
          <button key={i} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border)',
            borderRadius: 12, padding: '8px 10px',
            display: 'flex', alignItems: 'center', gap: 8,
            color: '#FFFFFF', fontSize: 12, fontWeight: 400,
            textAlign: 'left', whiteSpace: 'nowrap'
          }}>
            <span style={{ color: 'var(--purple)', fontSize: 12, flexShrink: 0 }}>{s.icon}</span>
            {s.text}
          </button>
        ))}
      </div>
    </div>
  )
}
