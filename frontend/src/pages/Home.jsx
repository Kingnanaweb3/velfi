import { useState, useEffect } from 'react'
import BalanceCard from '../components/BalanceCard.jsx'
import AskVelfi from '../components/AskVelfi.jsx'
import ActiveFlows from '../components/ActiveFlows.jsx'
import ActionButtons from '../components/ActionButtons.jsx'
import RecentActivity from '../components/RecentActivity.jsx'

const DEPLOYER = '0x75380bca19fad6159850104a134d131f46408f4759df47179b2350d231805630'
const API = 'http://172.20.10.7:3001'

export default function Home() {
  const [balance, setBalance] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      // Fetch balance from Sui RPC
      const rpc = await fetch('https://fullnode.testnet.sui.io', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1,
          method: 'suix_getBalance',
          params: [DEPLOYER, '0x2::sui::SUI']
        })
      })
      const data = await rpc.json()
      const raw = data.result?.totalBalance || 0
      setBalance((Number(raw) / 1_000_000_000).toFixed(3))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div style={{ padding: '56px 20px 0' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--purple), var(--blue))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 500, color: '#fff'
            }}>A</div>
            <span className="display" style={{ fontSize: 15, fontWeight: 500, color: '#FFFFFF' }}>Hi, Almond</span>
          </div>
          <button style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: 7 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9A9AAF" strokeWidth="1.5">
              <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
          </button>
        </div>

        {/* Hero */}
        <div style={{ marginBottom: 16 }}>
          <p className="display" style={{ fontSize: 20, fontWeight: 300, color: '#9A9AAF', lineHeight: 1.2 }}>Manage</p>
          <p className="display" style={{ fontSize: 20, lineHeight: 1.2, color: '#FFFFFF' }}>
            your <span style={{ fontWeight: 700 }}>money</span>
          </p>
        </div>

        {/* Cards Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <BalanceCard balance={balance} loading={loading} />
          <AskVelfi />
        </div>

        {/* Active Flows */}
        <ActiveFlows />

        {/* Action Buttons */}
        <ActionButtons />

        {/* Recent Activity */}
        <RecentActivity address={DEPLOYER} />
      </div>
    </div>
  )
}
