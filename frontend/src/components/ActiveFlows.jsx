import { useState } from 'react'

const periods = ['1D', '1W', '1M', '6M', '1Y']
const bars = [3,5,4,7,6,8,5,4,6,9,7,5,8,6,4,7,5,9,6,8,7,5,6,4,8,9,7,6,5,8]

export default function ActiveFlows() {
  const [period, setPeriod] = useState('1M')
  return (
    <div style={{ background: 'var(--card)', borderRadius: 'var(--radius)', padding: '16px', border: '1px solid var(--border)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="display" style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Active Flows</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
          <span style={{ fontSize: 11, fontWeight: 400, color: '#8E8EA3' }}>Live</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(124,109,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth="2"><path d="M2 12s3-5 10-5 10 5 10 5-3 5-10 5-10-5-10-5z"/></svg>
          </div>
          <div>
            <p className="display" style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>1.00 SUI</p>
            <p style={{ fontSize: 11, fontWeight: 400, color: 'var(--purple)' }}>Streaming Out</p>
          </div>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(75,131,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" strokeWidth="2"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M9 12l2 2 4-4"/></svg>
          </div>
          <div>
            <p className="display" style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>0</p>
            <p style={{ fontSize: 11, fontWeight: 400, color: 'var(--blue)' }}>Automations</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40, marginBottom: 8 }}>
        {bars.map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h * 10}%`, background: i === 14 ? 'var(--purple)' : 'rgba(124,109,255,0.18)', borderRadius: 2 }} />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {periods.map(p => (
          <button key={p} onClick={() => setPeriod(p)} style={{
            background: period === p ? 'rgba(255,255,255,0.06)' : 'none',
            border: period === p ? '1px solid var(--border)' : '1px solid transparent',
            borderRadius: 'var(--radius-btn)', padding: '3px 8px',
            fontSize: 11, fontWeight: 500,
            color: period === p ? '#FFFFFF' : '#8A8AA0'
          }}>{p}</button>
        ))}
      </div>
    </div>
  )
}
