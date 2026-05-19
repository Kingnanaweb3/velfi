import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClientQuery } from '@mysten/dapp-kit'
import { Transaction } from '@mysten/sui/transactions'
import { useState } from 'react'
import { PACKAGE_ID } from '../lib/constants'
import { storeReceipt } from '../lib/walrus'
import { useSuiNS } from '../hooks/useSuiNS'

export default function StreamModal({ onClose }) {
  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const { resolve } = useSuiNS()

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('30')
  const [status, setStatus] = useState(null)
  const [streamId, setStreamId] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [walrusBlobId, setWalrusBlobId] = useState(null)

  const handleStream = async () => {
    if (!recipient || !amount || !days) return
    setStatus('pending')

    try {
      const toAddress = await resolve(recipient)
      if (!toAddress) { setStatus('error'); return }

      const tx = new Transaction()
      const durationMs = BigInt(parseInt(days) * 24 * 60 * 60 * 1000)
      const amountMist = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000))

      const [coin] = tx.splitCoins(tx.gas, [amountMist])

      tx.moveCall({
        target: `${PACKAGE_ID}::stream::start_stream`,
        arguments: [
          coin,
          tx.pure.address(toAddress),
          tx.pure.u64(durationMs),
          tx.object('0x6'),  // Sui Clock object
        ],
      })

      signAndExecute({ transaction: tx }, {
        onSuccess: (result) => {
          setStatus('success')
          setTxHash(result.digest)
          const created = result.effects?.created
          if (created && created.length > 0) {
            setStreamId(created[0].reference?.objectId)
          }
          // Store receipt on Walrus
          storeReceipt({
            type: 'stream',
            txHash: result.digest,
            recipient,
            amount: amount + ' SUI',
            duration: days + ' days',
            streamId: created?.[0]?.reference?.objectId || null,
          }).then(blobId => {
            if (blobId) setWalrusBlobId(blobId)
          })
        },
        onError: (err) => {
          console.error(err)
          setStatus('error')
        }
      })
    } catch (err) {
      console.error(err)
      setStatus('error')
    }
  }

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12, padding: '12px 16px',
    color: 'white', fontSize: 15, outline: 'none',
    marginBottom: 12, fontFamily: 'Inter, sans-serif'
  }

  const perDay = amount && days
    ? (parseFloat(amount) / parseInt(days)).toFixed(4)
    : '0'

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      zIndex: 100
    }} onClick={onClose}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'linear-gradient(160deg, #3a5280, #273d6a)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '24px 24px 0 0',
        padding: '32px 28px 48px',
        color: 'white', fontFamily: 'Inter, sans-serif'
      }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Start a Stream</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', opacity: 0.6 }}>✕</button>
        </div>

        <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 20 }}>
          Money flows to the recipient continuously over time
        </div>

        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
              Stream started on-chain
            </div>
            <div style={{ opacity: 0.5, fontSize: 13, marginBottom: 16 }}>
              {amount} SUI streaming to {recipient} over {days} days
            </div>
{txHash && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 4 }}>Transaction</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', opacity: 0.7, marginBottom: 8 }}>
                  {txHash.slice(0,12)}...{txHash.slice(-8)}
                </div>
                <a href={"https://testnet.suivision.xyz/txblock/" + txHash} target="_blank" rel="noreferrer" style={{ color: '#6EA8FF', fontSize: 13 }}>View on explorer ↗</a>
              </div>
            )}
            {streamId && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 4 }}>Stream Object</div>
                <a href={"https://testnet.suivision.xyz/object/" + streamId} target="_blank" rel="noreferrer" style={{ color: '#6EA8FF', fontSize: 13 }}>View stream object ↗</a>
              </div>
            )}
          </div>
        ) : (
          <>
            <label style={{ fontSize: 13, opacity: 0.6, display: 'block', marginBottom: 6 }}>Recipient</label>
            <input
              style={inputStyle}
              placeholder="0x... or name.sui"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
            />

            <label style={{ fontSize: 13, opacity: 0.6, display: 'block', marginBottom: 6 }}>Total Amount (SUI)</label>
            <input
              style={inputStyle}
              placeholder="0.00"
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />

            <label style={{ fontSize: 13, opacity: 0.6, display: 'block', marginBottom: 6 }}>Duration (days)</label>
            <input
              style={inputStyle}
              placeholder="30"
              type="number"
              value={days}
              onChange={e => setDays(e.target.value)}
            />

            {amount && days && (
              <div style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '12px 16px',
                marginBottom: 16, fontSize: 13
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ opacity: 0.5 }}>Rate</span>
                  <span style={{ fontWeight: 600 }}>{perDay} SUI / day</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ opacity: 0.5 }}>Duration</span>
                  <span style={{ fontWeight: 600 }}>{days} days</span>
                </div>
              </div>
            )}

            <button
              onClick={handleStream}
              disabled={status === 'pending' || !recipient || !amount || !days}
              style={{
                width: '100%', background: '#2563EB', color: 'white',
                border: 'none', padding: '14px', borderRadius: 12,
                fontSize: 16, fontWeight: 700, cursor: 'pointer',
                opacity: (!recipient || !amount || !days) ? 0.5 : 1
              }}
            >
              {status === 'pending' ? 'Starting Stream...' : 'Start Stream'}
            </button>

            {status === 'error' && (
              <div style={{ color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' }}>
                Failed to start stream. Check balance and try again.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
