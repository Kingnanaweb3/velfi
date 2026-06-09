import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const DEPLOYER = '0x75380bca19fad6159850104a134d131f46408f4759df47179b2350d231805630'

function formatTime(ms) {
  if (!ms) return 'Today'
  const date = new Date(Number(ms))
  const now = new Date()
  const diff = now - date
  if (diff < 86400000) return 'Today'
  if (diff < 172800000) return 'Yesterday'
  return date.toLocaleDateString()
}

function TxIcon({ type, out }) {
  const color = type === 'stream' ? 'var(--purple)' : type === 'contract' ? 'var(--blue)' : !out ? 'var(--green)' : 'var(--red)'
  const bg = type === 'stream' ? 'rgba(124,109,255,0.12)' : type === 'contract' ? 'rgba(75,131,255,0.1)' : !out ? 'rgba(41,209,125,0.1)' : 'rgba(255,92,124,0.1)'
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {type === 'stream' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M2 12s3-5 10-5 10 5 10 5-3 5-10 5-10-5-10-5z"/></svg>
      ) : type === 'contract' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      ) : !out ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M12 2v14M5 9l7 7 7-7"/></svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
      )}
    </div>
  )
}

export default function RecentActivity({ address }) {
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const navigate = useNavigate()

  useEffect(() => { fetchActivity() }, [address])

  async function fetchActivity() {
    try {
      const userAddr = address || DEPLOYER

      const { data: dbTxs } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_address', userAddr)
        .order('created_at', { ascending: false })
        .limit(5)

      const dbDigests = new Set((dbTxs || []).map(t => t.digest))

      const [outRes, inRes] = await Promise.all([
        fetch('https://fullnode.testnet.sui.io', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_queryTransactionBlocks', params: [{ filter: { FromAddress: userAddr } }, null, 5, true] })
        }),
        fetch('https://fullnode.testnet.sui.io', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'suix_queryTransactionBlocks', params: [{ filter: { ToAddress: userAddr } }, null, 5, true] })
        })
      ])

      const outData = await outRes.json()
      const inData = await inRes.json()
      const outgoing = (outData.result?.data || []).map(tx => ({ ...tx, direction: 'out' }))
      const incoming = (inData.result?.data || []).map(tx => ({ ...tx, direction: 'in' }))
      const combined = [...outgoing, ...incoming]
        .filter(tx => !dbDigests.has(tx.digest))
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
        .slice(0, 5)

      // Fetch details one by one to get balance changes
      const detailedTxs = await Promise.all(combined.map(async (tx) => {
        try {
          const res = await fetch('https://fullnode.testnet.sui.io', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1,
              method: 'sui_getTransactionBlock',
              params: [tx.digest, { showBalanceChanges: true, showInput: true }]
            })
          })
          const data = await res.json()
          const detail = data.result
          const balanceChanges = detail?.balanceChanges || []
          const change = balanceChanges.find(c =>
            c.owner?.AddressOwner === userAddr &&
            c.coinType === '0x2::sui::SUI'
          )
          const rawAmount = change ? Math.abs(Number(change.amount)) / 1_000_000_000 : null
          const txKind = detail?.transaction?.data?.transaction
          const moveCall = txKind?.transactions?.find(t => t.MoveCall)?.MoveCall
          return {
            ...tx,
            _amount: rawAmount ? rawAmount.toFixed(3) : null,
            _isMoveCall: !!moveCall,
            _moveModule: moveCall?.module
          }
        } catch {
          return tx
        }
      }))

      const formattedDb = (dbTxs || []).map(t => ({
        digest: t.digest, timestampMs: new Date(t.created_at).getTime(),
        direction: t.direction, _label: t.label, _subLabel: t.sub_label,
        _type: t.type, _amount: t.amount, _token: t.token, _fromDb: true
      }))

      const all = [...formattedDb, ...detailedTxs]
        .sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0))
        .slice(0, 5)

      setTxs(all)
    } catch (err) {
      console.error('Activity error:', err)
    } finally {
      setLoading(false)
    }
  }

  function getTxDisplay(tx) {
    if (tx._fromDb) {
      return { label: tx._label || 'Transaction', sub: tx._subLabel || 'On-chain', type: tx._type || 'send', out: tx.direction === 'out', amount: tx._amount ? `${tx._amount} SUI` : '—' }
    }
    const out = tx.direction === 'out'
    const amount = tx._amount ? `${tx._amount} SUI` : '—'
    if (tx._moveModule === 'stream') return { label: 'Stream Created', sub: 'Active Stream', type: 'stream', out: true, amount }
    if (tx._moveModule === 'escrow') return { label: 'Escrow Created', sub: 'Pending claim', type: 'stream', out: true, amount }
    if (tx._isMoveCall && out) return { label: 'Contract Call', sub: tx._moveModule || 'On-chain', type: 'contract', out: true, amount }
    if (!out) return { label: 'Received', sub: 'Payment', type: 'receive', out: false, amount }
    return { label: 'Sent', sub: 'Payment', type: 'send', out: true, amount }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="display" style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Recent Activity</span>
        <button onClick={() => navigate('/activity')} style={{ background: 'none', fontSize: 11, fontWeight: 400, color: '#8A8AA0', display: 'flex', alignItems: 'center', gap: 3 }}>
          See more <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
        </button>
      </div>

      {loading ? (
        [1,2,3].map(i => <div key={i} style={{ height: 52, background: 'var(--card)', borderRadius: 12, marginBottom: 6, opacity: 0.3 }} />)
      ) : txs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: '#8A8AA0', fontSize: 12 }}>No transactions yet</div>
      ) : (
        txs.map((tx, i) => {
          const { label, sub, type, out, amount } = getTxDisplay(tx)
          const isExpanded = expanded === i
          return (
            <div key={i} style={{ borderBottom: i < txs.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div onClick={() => setExpanded(isExpanded ? null : i)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <TxIcon type={type} out={out} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#FFFFFF' }}>{label}</p>
                    <p style={{ fontSize: 11, fontWeight: 400, color: '#8E8EA3', marginTop: 1 }}>{sub}</p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="display" style={{ fontSize: 12, fontWeight: 600, color: out ? '#FF5C7C' : '#29D17D' }}>
                    {out ? '-' : '+'}{amount}
                  </p>
                  <p style={{ fontSize: 10, fontWeight: 400, color: '#8A8AA0', marginTop: 1 }}>{formatTime(tx.timestampMs)}</p>
                </div>
              </div>
              {isExpanded && (
                <div style={{ background: 'var(--bg3)', borderRadius: 12, padding: '12px', marginBottom: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#8A8AA0' }}>Tx Hash</span>
                    <span style={{ fontSize: 11, color: '#FFFFFF', fontFamily: 'monospace' }}>{tx.digest?.slice(0, 16)}...</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: '#8A8AA0' }}>Direction</span>
                    <span style={{ fontSize: 11, color: out ? '#FF5C7C' : '#29D17D' }}>{out ? 'Outgoing' : 'Incoming'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 11, color: '#8A8AA0' }}>Time</span>
                    <span style={{ fontSize: 11, color: '#FFFFFF' }}>{tx.timestampMs ? new Date(Number(tx.timestampMs)).toLocaleString() : 'Today'}</span>
                  </div>
                  <a href={`https://suiscan.xyz/testnet/tx/${tx.digest}`} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', background: 'rgba(124,109,255,0.1)', border: '1px solid rgba(124,109,255,0.2)', borderRadius: 10, padding: '8px', color: 'var(--purple)', fontSize: 12, fontWeight: 500 }}>View on Suiscan ↗</a>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
