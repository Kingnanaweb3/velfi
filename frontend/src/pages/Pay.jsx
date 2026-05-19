import { useCurrentAccount, useSignAndExecuteTransaction, ConnectButton } from '@mysten/dapp-kit'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Transaction } from '@mysten/sui/transactions'
import { useSuiNS } from '../hooks/useSuiNS'

export default function Pay() {
  const { username } = useParams()
  const [searchParams] = useSearchParams()
  const account = useCurrentAccount()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const { resolve } = useSuiNS()

  const defaultAmount = searchParams.get('amount') || ''
  const defaultMemo = searchParams.get('memo') || ''

  const [amount, setAmount] = useState(defaultAmount)
  const [memo, setMemo] = useState(defaultMemo)
  const [txStatus, setTxStatus] = useState(null)

  const handlePay = async () => {
    if (!account || !amount) return
    setTxStatus('pending')
    try {
      const toAddress = await resolve(username)
      if (!toAddress) { setTxStatus('error'); return }
      const tx = new Transaction()
      const amountMist = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000))
      const [coin] = tx.splitCoins(tx.gas, [amountMist])
      tx.transferObjects([coin], toAddress)
      signAndExecute({ transaction: tx }, {
        onSuccess: () => setTxStatus('success'),
        onError: () => setTxStatus('error')
      })
    } catch {
      setTxStatus('error')
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

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(150deg, #5c6f96 0%, #6b7fa3 30%, #536898 60%, #344f7e 85%, #273d6a 100%)',
      color: 'white', fontFamily: 'Inter, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24
    }}>

      {/* Logo */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>Velfi.ai</div>
        <div style={{ fontSize: 12, opacity: 0.45, marginTop: 2 }}>Programmable payments on Sui</div>
      </div>

      {/* Payment Card */}
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 28, padding: '36px 32px',
        textAlign: 'center', marginBottom: 24
      }}>
        {/* Avatar */}
        <div style={{
          width: 68, height: 68, borderRadius: '50%',
          background: 'linear-gradient(135deg, #2563EB, #4F8EF7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, fontWeight: 800, margin: '0 auto 14px',
          boxShadow: '0 8px 24px rgba(37,99,235,0.4)'
        }}>
          {username?.slice(0, 1).toUpperCase()}
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          Pay {username}.sui
        </h2>
        <p style={{ opacity: 0.45, fontSize: 13, marginBottom: 28 }}>
          {defaultMemo ? `"${defaultMemo}"` : 'Send SUI directly on Velfi'}
        </p>

        {txStatus === 'success' ? (
          <div style={{
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 16, padding: '28px 20px'
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>✓</div>
            <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              Payment sent!
            </div>
            <div style={{ opacity: 0.5, fontSize: 13 }}>
              {amount} SUI sent to {username}.sui
            </div>
          </div>
        ) : (
          <>
            <label style={{ fontSize: 12, opacity: 0.55, display: 'block', textAlign: 'left', marginBottom: 6 }}>
              Amount (SUI)
            </label>
            <input
              style={inputStyle}
              placeholder="0.00"
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              readOnly={!!defaultAmount}
            />

            <label style={{ fontSize: 12, opacity: 0.55, display: 'block', textAlign: 'left', marginBottom: 6 }}>
              Memo
            </label>
            <input
              style={{ ...inputStyle, marginBottom: 20 }}
              placeholder="What's this for?"
              value={memo}
              onChange={e => setMemo(e.target.value)}
            />

            {!account ? (
              <div>
                <p style={{ opacity: 0.5, fontSize: 13, marginBottom: 14 }}>
                  Connect your wallet to pay
                </p>
                <ConnectButton />
              </div>
            ) : (
              <button
                onClick={handlePay}
                disabled={txStatus === 'pending' || !amount}
                style={{
                  width: '100%', background: '#2563EB', color: 'white',
                  border: 'none', padding: '14px', borderRadius: 12,
                  fontSize: 16, fontWeight: 700, cursor: 'pointer',
                  opacity: !amount ? 0.5 : 1
                }}
              >
                {txStatus === 'pending' ? 'Sending...' : `Pay ${amount || '0'} SUI`}
              </button>
            )}

            {txStatus === 'error' && (
              <div style={{ color: '#f87171', fontSize: 13, marginTop: 12 }}>
                Transaction failed. Try again.
              </div>
            )}
          </>
        )}
      </div>

      {/* Onboarding CTA */}
      {!account && (
        <div style={{
          width: '100%', maxWidth: 420,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: '24px 28px',
          textAlign: 'center'
        }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
            New to Velfi.ai?
          </div>
          <div style={{ opacity: 0.5, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
            Send, split, stream and invest — all from one place. No wallet address needed.
          </div>
          <a href="/" style={{
            display: 'inline-block',
            background: 'rgba(37,99,235,0.2)',
            border: '1px solid rgba(37,99,235,0.4)',
            color: '#6EA8FF', textDecoration: 'none',
            padding: '10px 24px', borderRadius: 999,
            fontSize: 14, fontWeight: 600
          }}>
            Get started with Velfi →
          </a>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop: 24, opacity: 0.3, fontSize: 12 }}>
        Powered by Velfi.ai · Built on Sui
      </div>

    </div>
  )
}
