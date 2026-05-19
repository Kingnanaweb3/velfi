import { useCurrentAccount, useDisconnectWallet, useSuiClientQuery, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Transaction } from '@mysten/sui/transactions'
import { useSuiNS } from '../hooks/useSuiNS'
import { sendToVelfiAI } from '../lib/velfiAI'
import StreamModal from './Stream'
import { storeReceipt } from '../lib/walrus'

export default function Dashboard() {
  const account = useCurrentAccount()
  const { mutate: disconnect } = useDisconnectWallet()
  const { mutate: signAndExecute } = useSignAndExecuteTransaction()
  const navigate = useNavigate()
  const { resolve } = useSuiNS()

  // ── Modal state ──────────────────────────────────────────────────────
  const [modal, setModal] = useState(null)

  // ── Send state ───────────────────────────────────────────────────────
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [txStatus, setTxStatus] = useState(null)
  const [resolvedAddress, setResolvedAddress] = useState(null)
  const [sendTxHash, setSendTxHash] = useState(null)
  const [sendBlobId, setSendBlobId] = useState(null)
  const [splitTxHash, setSplitTxHash] = useState(null)
  const [splitBlobId, setSplitBlobId] = useState(null)

  // ── Request state ────────────────────────────────────────────────────
  const [requestAmount, setRequestAmount] = useState('')
  const [requestMemo, setRequestMemo] = useState('')
  const [payLink, setPayLink] = useState(null)

  // ── Split state ──────────────────────────────────────────────────────
  const [splitRecipients, setSplitRecipients] = useState([
    { address: '', amount: '' },
    { address: '', amount: '' },
  ])
  const [splitStatus, setSplitStatus] = useState(null)

  // ── AI state ─────────────────────────────────────────────────────────
  const [aiInput, setAiInput] = useState('')
  const [aiHistory, setAiHistory] = useState([])
  const [aiMessages, setAiMessages] = useState([])
  const [aiLoading, setAiLoading] = useState(false)

  // ── Queries ──────────────────────────────────────────────────────────
  const { data: balance, refetch } = useSuiClientQuery('getBalance', {
    owner: account?.address ?? '',
    coinType: '0x2::sui::SUI',
  }, { enabled: !!account })

  const { data: txns, refetch: refetchTxns } = useSuiClientQuery('queryTransactionBlocks', {
    filter: { FromAddress: account?.address ?? '' },
    options: { showEffects: true, showInput: true },
    limit: 10,
    order: 'descending',
  }, { enabled: !!account })

  useEffect(() => {
    if (!account) navigate('/')
  }, [account])

  if (!account) return null

  const suiBalance = balance
    ? (Number(balance.totalBalance) / 1_000_000_000).toFixed(4)
    : '...'

  const shortAddress = account.address.slice(0, 6) + '...' + account.address.slice(-4)

  // ── Detect tx type ───────────────────────────────────────────────────
  const getTxType = (tx) => {
    const txData = tx.transaction?.data?.transaction
    const txns = txData?.transactions || []
    const inputs = txData?.inputs || []
    const hasMoveCall = txns.some(t => t.MoveCall)
    if (hasMoveCall) {
      const call = txns.find(t => t.MoveCall)?.MoveCall
      const fn = (call?.function || '').toLowerCase()
      if (fn.includes('stream')) return 'Stream'
      if (fn.includes('split')) return 'Split'
      if (fn.includes('safe')) return 'Safe Pay'
      if (fn.includes('stage')) return 'Stage Pay'
      return 'Contract'
    }
    if (inputs.length >= 3 && inputs[2]?.valueType === 'u64' && parseInt(inputs[2]?.value) > 1000000) return 'Stream'
    const addresses = inputs.filter(i => i.valueType === 'address')
    if (addresses.length > 1) return 'Split'
    return 'Send'
  }

  // ── Send handler ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!recipient || !amount) return
    setTxStatus('pending')
    try {
      let toAddress = recipient
      if (!recipient.startsWith('0x')) {
        const resolved = await resolve(recipient)
        if (!resolved) { setTxStatus('error'); return }
        toAddress = resolved
        setResolvedAddress(resolved)
      }
      const tx = new Transaction()
      const amountMist = BigInt(Math.floor(parseFloat(amount) * 1_000_000_000))
      const [coin] = tx.splitCoins(tx.gas, [amountMist])
      tx.transferObjects([coin], toAddress)
      signAndExecute({ transaction: tx }, {
        onSuccess: async (result) => {
          setTxStatus('success')
          setSendTxHash(result.digest)
          refetch()
          refetchTxns()
          storeReceipt({
            type: 'send',
            txHash: result.digest,
            from: account.address,
            to: toAddress,
            amount: amount + ' SUI',
            memo: memo || '',
          }).then(blobId => {
            if (blobId) setSendBlobId(blobId)
          })
        },
        onError: () => setTxStatus('error')
      })
    } catch { setTxStatus('error') }
  }

  // ── Split handler ────────────────────────────────────────────────────
  const handleSplit = async () => {
    const valid = splitRecipients.filter(r => r.address && r.amount)
    if (valid.length < 2) return
    setSplitStatus('pending')
    try {
      const tx = new Transaction()
      const resolved = await Promise.all(valid.map(r => resolve(r.address)))
      if (resolved.some(r => !r)) { setSplitStatus('error'); return }
      const coins = resolved.map((addr, i) => {
        const amountMist = BigInt(Math.floor(parseFloat(valid[i].amount) * 1_000_000_000))
        const [coin] = tx.splitCoins(tx.gas, [amountMist])
        return { coin, addr }
      })
      coins.forEach(({ coin, addr }) => tx.transferObjects([coin], addr))
      signAndExecute({ transaction: tx }, {
        onSuccess: async (result) => {
          setSplitStatus('success')
          setSplitTxHash(result.digest)
          refetch()
          refetchTxns()
          storeReceipt({
            type: 'split',
            txHash: result.digest,
            from: account.address,
            recipients: valid.map((r, i) => ({ to: resolved[i], amount: r.amount + ' SUI' })),
          }).then(blobId => {
            if (blobId) setSplitBlobId(blobId)
          })
        },
        onError: () => setSplitStatus('error')
      })
    } catch { setSplitStatus('error') }
  }

  // ── Generate request link ────────────────────────────────────────────
  const generateLink = () => {
    const base = window.location.origin
    const name = 'almond'
    let url = `${base}/pay/${name}`
    const params = []
    if (requestAmount) params.push(`amount=${requestAmount}`)
    if (requestMemo) params.push(`memo=${encodeURIComponent(requestMemo)}`)
    if (params.length) url += '?' + params.join('&')
    setPayLink(url)
  }

  // ── AI handler ───────────────────────────────────────────────────────
  const handleAiSubmit = async () => {
    if (!aiInput.trim() || aiLoading) return
    const userMsg = { role: 'user', content: aiInput }
    const newMessages = [...aiMessages, userMsg]
    setAiMessages(newMessages)
    setAiHistory(prev => [...prev, { input: aiInput, intent: null }])
    setAiInput('')
    setAiLoading(true)
    try {
      const response = await sendToVelfiAI(newMessages)
      const assistantMsg = { role: 'assistant', content: response.message }
      setAiMessages(prev => [...prev, assistantMsg])
      setAiHistory(prev => {
        const updated = [...prev]
        updated[updated.length - 1].intent = response
        return updated
      })
      if (response.action === 'send' && response.params?.to) {
        setRecipient(response.params.to)
        if (response.params.amount) setAmount(response.params.amount)
        if (response.params.memo) setMemo(response.params.memo)
        setModal('send')
      } else if (response.action === 'split' && response.params?.recipients) {
        const recs = response.params.recipients.map(r => ({ address: r, amount: response.params.perPerson || '' }))
        setSplitRecipients(recs)
        setModal('split')
      } else if (response.action === 'request') {
        if (response.params?.amount) setRequestAmount(response.params.amount)
        if (response.params?.memo) setRequestMemo(response.params.memo)
        setModal('request')
      } else if (response.action === 'stream') {
        setModal('stream')
      }
    } catch {
      setAiHistory(prev => {
        const updated = [...prev]
        updated[updated.length - 1].intent = { message: 'Something went wrong. Try again.', action: 'none' }
        return updated
      })
    }
    setAiLoading(false)
  }

  // ── Styles ───────────────────────────────────────────────────────────
  const inputStyle = {
    width: '100%', background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 12, padding: '12px 16px',
    color: 'white', fontSize: 15, outline: 'none',
    marginBottom: 12, fontFamily: 'Inter, sans-serif'
  }

  const modalStyle = {
    position: 'fixed', inset: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    zIndex: 100
  }

  const sheetStyle = {
    width: '100%', maxWidth: 480,
    background: 'linear-gradient(160deg, #3a5280, #273d6a)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '24px 24px 0 0',
    padding: '32px 28px 48px',
    color: 'white', fontFamily: 'Inter, sans-serif'
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(150deg, #5c6f96 0%, #6b7fa3 30%, #536898 60%, #344f7e 85%, #273d6a 100%)',
      color: 'white', fontFamily: 'Inter, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: 40,
    }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <span style={{ fontWeight: 700, fontSize: 20 }}>Velfi.ai</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, opacity: 0.6, fontFamily: 'monospace' }}>{shortAddress}</span>
          <button onClick={() => disconnect()} style={{
            background: 'rgba(255,255,255,0.1)', color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13
          }}>Disconnect</button>
        </div>
      </div>

      {/* Balance Card */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: 28, padding: '40px 32px',
        textAlign: 'center', marginBottom: 16
      }}>
        <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 8 }}>Total Balance</div>
        <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2, marginBottom: 4 }}>
          {suiBalance} <span style={{ fontSize: 24, fontWeight: 500, opacity: 0.6 }}>SUI</span>
        </div>
        <div style={{ fontSize: 13, opacity: 0.4, marginBottom: 32 }}>Testnet</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            { label: 'Send', primary: true },
            { label: 'Request', primary: false },
            { label: 'Split', primary: false },
            { label: 'Stream', primary: false },
          ].map(({ label, primary }) => (
            <button key={label} onClick={() => setModal(label.toLowerCase())} style={{
              background: primary ? '#2563EB' : 'rgba(255,255,255,0.08)',
              color: 'white', border: '1px solid rgba(255,255,255,0.15)',
              padding: '10px 22px', borderRadius: 999,
              cursor: 'pointer', fontSize: 14, fontWeight: 600
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Status */}
      {txStatus === 'success' && (
        <div style={{ width: '100%', maxWidth: 480, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '12px 20px', marginBottom: 16, fontSize: 14, color: '#4ade80' }}>
          Transaction sent successfully
        </div>
      )}

      {/* Recent */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 24, padding: '24px 28px', marginBottom: 16
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.5, letterSpacing: 1, marginBottom: 20 }}>RECENT</div>
        {txns?.data?.length > 0 ? txns.data.map((tx, i) => {
          const status = tx.effects?.status?.status === 'success' ? 'success' : 'failed'
          const color = status === 'success' ? '#4ade80' : '#f87171'
          const digest = tx.digest.slice(0, 8) + '...' + tx.digest.slice(-6)
          const timestamp = tx.timestampMs ? new Date(Number(tx.timestampMs)).toLocaleTimeString() : ''
          const txType = getTxType(tx)
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0',
              borderBottom: i < txns.data.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, color, fontWeight: 700
                }}>
                  {status === 'success' ? 'v' : 'x'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{txType}</div>
                  <div style={{ fontSize: 11, opacity: 0.45, fontFamily: 'monospace' }}>{digest}</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, opacity: 0.5 }}>{timestamp}</div>
                <a href={"https://testnet.suivision.xyz/txblock/" + tx.digest} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#6EA8FF', textDecoration: 'none' }}>View</a>
              </div>
            </div>
          )
        }) : (
          <div style={{ opacity: 0.4, fontSize: 14, textAlign: 'center', padding: '20px 0' }}>
            No transactions yet. Try sending your first payment.
          </div>
        )}
      </div>

      {/* AI Chat */}
      <div style={{ width: '100%', maxWidth: 480, marginBottom: 16 }}>
        {aiHistory.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16, padding: '16px 20px', marginBottom: 12
          }}>
            {aiHistory.slice(-4).map((h, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, opacity: 0.45, marginBottom: 4 }}>You: {h.input}</div>
                {h.intent ? (
                  <div style={{ fontSize: 13, fontWeight: 500, color: h.intent.action === 'none' ? 'rgba(255,255,255,0.7)' : '#4ade80', lineHeight: 1.5 }}>
                    Velfi: {h.intent.message}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, opacity: 0.4 }}>Velfi: Thinking...</div>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{
          display: 'flex', gap: 10,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 16, padding: '10px 16px', alignItems: 'center'
        }}>
          <span style={{ fontSize: 14, opacity: 0.6 }}>AI</span>
          <input
            style={{ flex: 1, background: 'none', border: 'none', color: 'white', fontSize: 14, outline: 'none', fontFamily: 'Inter, sans-serif' }}
            placeholder={aiLoading ? 'Velfi is thinking...' : 'Ask Velfi anything...'}
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAiSubmit()}
            disabled={aiLoading}
          />
          <button onClick={handleAiSubmit} style={{
            background: '#2563EB', border: 'none', color: 'white',
            width: 32, height: 32, borderRadius: '50%',
            cursor: 'pointer', fontSize: 14, display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0
          }}>-&gt;</button>
        </div>
      </div>

      {/* Stream Modal */}
      {modal === 'stream' && <StreamModal onClose={() => { setModal(null); refetchTxns(); refetch() }} />}

      {/* Send Modal */}
      {modal === 'send' && (
        <div style={modalStyle} onClick={() => setModal(null)}>
          <div style={sheetStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Send SUI</h2>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', opacity: 0.6 }}>x</button>
            </div>
            {txStatus !== 'success' && (
              <>
                <label style={{ fontSize: 13, opacity: 0.6, display: 'block', marginBottom: 6 }}>Recipient address</label>
                <input style={inputStyle} placeholder="0x... or name.sui" value={recipient} onChange={e => setRecipient(e.target.value)} />
                <label style={{ fontSize: 13, opacity: 0.6, display: 'block', marginBottom: 6 }}>Amount (SUI)</label>
                <input style={inputStyle} placeholder="0.00" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
                <label style={{ fontSize: 13, opacity: 0.6, display: 'block', marginBottom: 6 }}>Memo (optional)</label>
                <input style={inputStyle} placeholder="What's this for?" value={memo} onChange={e => setMemo(e.target.value)} />
              </>
            )}
            {txStatus === 'success' ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Payment sent successfully</div>
                {sendTxHash && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 4 }}>Transaction</div>
                    <a href={"https://testnet.suivision.xyz/txblock/" + sendTxHash} target="_blank" rel="noreferrer" style={{ color: '#6EA8FF', fontSize: 13 }}>
                      {sendTxHash.slice(0,10)}...{sendTxHash.slice(-8)} - View on explorer
                    </a>
                  </div>
                )}
                {sendBlobId && (
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 4 }}>Receipt stored on Walrus</div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.6, wordBreak: 'break-all' }}>{sendBlobId}</div>
                  </div>
                )}
                {!sendBlobId && <div style={{ fontSize: 11, opacity: 0.4, marginTop: 8 }}>Storing receipt on Walrus...</div>}
                <button onClick={() => { setModal(null); setTxStatus(null); setSendTxHash(null); setSendBlobId(null) }} style={{ marginTop: 16, background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 999, cursor: 'pointer', fontSize: 13 }}>Close</button>
              </div>
            ) : (
              <>
                <button onClick={handleSend} disabled={txStatus === 'pending'} style={{ width: '100%', background: '#2563EB', color: 'white', border: 'none', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 }}>
                  {txStatus === 'pending' ? 'Sending...' : 'Confirm Send'}
                </button>
                {txStatus === 'error' && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' }}>Transaction failed. Try again.</div>}
              </>
            )}
          </div>
        </div>
      )}

      {/* Request Modal */}
      {modal === 'request' && (
        <div style={modalStyle} onClick={() => { setModal(null); setPayLink(null) }}>
          <div style={sheetStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Request Payment</h2>
              <button onClick={() => { setModal(null); setPayLink(null) }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', opacity: 0.6 }}>x</button>
            </div>
            <label style={{ fontSize: 13, opacity: 0.6, display: 'block', marginBottom: 6 }}>Amount (SUI)</label>
            <input style={inputStyle} placeholder="0.00" type="number" value={requestAmount} onChange={e => setRequestAmount(e.target.value)} />
            <label style={{ fontSize: 13, opacity: 0.6, display: 'block', marginBottom: 6 }}>Memo (optional)</label>
            <input style={inputStyle} placeholder="What's this for?" value={requestMemo} onChange={e => setRequestMemo(e.target.value)} />
            <button onClick={generateLink} style={{ width: '100%', background: '#2563EB', color: 'white', border: 'none', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}>
              Generate Payment Link
            </button>
            {payLink && (
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 6 }}>Your payment link</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 10 }}>{payLink}</div>
                <button onClick={() => { navigator.clipboard?.writeText(payLink) || (() => { const el = document.createElement('textarea'); el.value = payLink; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) })(); alert('Copied!') }} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12 }}>
                  Copy Link
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Split Modal */}
      {modal === 'split' && (
        <div style={modalStyle} onClick={() => { setModal(null); setSplitStatus(null); setSplitRecipients([{ address: '', amount: '' }, { address: '', amount: '' }]) }}>
          <div style={sheetStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Split Payment</h2>
              <button onClick={() => { setModal(null); setSplitStatus(null); setSplitRecipients([{ address: '', amount: '' }, { address: '', amount: '' }]) }} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', opacity: 0.6 }}>x</button>
            </div>
            {splitStatus !== 'success' && <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 16 }}>All transfers happen in one atomic transaction</div>}
            {splitStatus !== 'success' && splitRecipients.map((r, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 6 }}>Recipient {i + 1}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...inputStyle, flex: 2, marginBottom: 0 }} placeholder="0x... or name.sui" value={r.address} onChange={e => { const u = [...splitRecipients]; u[i].address = e.target.value; setSplitRecipients(u) }} />
                  <input style={{ ...inputStyle, flex: 1, marginBottom: 0 }} placeholder="SUI" type="number" value={r.amount} onChange={e => { const u = [...splitRecipients]; u[i].amount = e.target.value; setSplitRecipients(u) }} />
                </div>
              </div>
            ))}
            {splitStatus !== 'success' && <button onClick={() => setSplitRecipients([...splitRecipients, { address: '', amount: '' }])} style={{ background: 'none', border: '1px dashed rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, width: '100%', marginBottom: 16 }}>
              + Add recipient
            </button>}
            {splitStatus !== 'success' && <div style={{ fontSize: 13, opacity: 0.5, marginBottom: 16, textAlign: 'right' }}>
              Total: {splitRecipients.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0).toFixed(3)} SUI
            </div>}
            {splitStatus !== 'success' && <button onClick={handleSplit} disabled={splitStatus === 'pending'} style={{ width: '100%', background: '#2563EB', color: 'white', border: 'none', padding: '14px', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
              {splitStatus === 'pending' ? 'Splitting...' : 'Confirm Split'}
            </button>}
            {splitStatus === 'success' ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 16, marginBottom: 12 }}>All payments sent</div>
                <div style={{ opacity: 0.5, fontSize: 13, marginBottom: 12 }}>One atomic transaction on Sui</div>
                {splitTxHash && (
                  <div style={{ marginBottom: 8 }}>
                    <a href={"https://testnet.suivision.xyz/txblock/" + splitTxHash} target="_blank" rel="noreferrer" style={{ color: '#6EA8FF', fontSize: 13 }}>
                      {splitTxHash.slice(0,10)}...{splitTxHash.slice(-8)} - View on explorer
                    </a>
                  </div>
                )}
                {splitBlobId ? (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, opacity: 0.45, marginBottom: 4 }}>Receipt stored on Walrus</div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.6, wordBreak: 'break-all' }}>{splitBlobId}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, opacity: 0.4, marginBottom: 16 }}>Storing receipt on Walrus...</div>
                )}
                <button onClick={() => { setModal(null); setSplitStatus(null); setSplitTxHash(null); setSplitBlobId(null); setSplitRecipients([{ address: '', amount: '' }, { address: '', amount: '' }]) }} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: 999, cursor: 'pointer', fontSize: 13 }}>Close</button>
              </div>
            ) : (
              <>
                {splitStatus === 'error' && <div style={{ color: '#f87171', fontSize: 13, marginTop: 12, textAlign: 'center' }}>Split failed. Check addresses and balance.</div>}
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
