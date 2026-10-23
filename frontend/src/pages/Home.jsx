import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, ArrowRight, ArrowDownLeft, Bell, Eye, EyeOff, Repeat, Send, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useBalances, useFlows, useActivity, useNotifications, draft } from '../lib/api.js'
import { Top, Vault, Tile, NextCard, Panel, SectionTitle, Empty, Pill, Skeleton, fmtAmt } from '../ui/kit.jsx'
import { ReceiveSheet, TokensSheet, ActivitySheet, AlertsSheet, TxRow, coinFor, isMainnet, lastSeenAlerts, markAlertsSeen } from '../components/sheets.jsx'
import otterFace from '../assets/otter-face.webp'
import otterPeek from '../assets/otter-peek.webp'


function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
function when(ts) {
  if (!ts) return 'soon'
  const d = new Date(ts)
  if (d.getTime() <= Date.now() + 60_000) return 'now'
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

export default function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const bal = useBalances()
  const flows = useFlows()
  const act = useActivity(6)
  const alerts = useNotifications()
  const [sheet, setSheet] = useState(null)
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem('velfi_hide') === '1' } catch { return false } })
  const [seen, setSeen] = useState(lastSeenAlerts)

  const tokens = bal.data?.tokens || []
  const usd = bal.data ? bal.data.total_usd || 0 : null
  const address = bal.data?.address || user?.address || user?.wallet_address
  const usdc = tokens.find(t => t.symbol === 'USDC')
  const bnb = tokens.find(t => t.symbol === 'BNB')
  const schedules = (flows.data?.schedules || []).filter(s => s.status === 'active')
  const activeCount = schedules.length + (flows.data?.streams || []).filter(s => s.status === 'active').length
  const nextPay = useMemo(() => [...schedules].sort((a, b) => new Date(a.next_run_at) - new Date(b.next_run_at))[0], [flows.data])
  const fresh = (alerts.data?.notifications || []).some(n => new Date(n.created_at).getTime() > seen)
  const empty = bal.data && tokens.length === 0

  const toggleHidden = () => setHidden(h => { try { localStorage.setItem('velfi_hide', h ? '0' : '1') } catch {} return !h })
  const ask = (text) => { if (text) draft(text); navigate('/chat') }
  const openAlerts = () => { setSheet('alerts'); markAlertsSeen(); setSeen(Date.now()) }

  let next
  if (!bal.data) next = <Skeleton h={210} r={28} />
  else if (empty) next = (
    <NextCard tone="sky" eyebrow="To get started" title="Add money to your wallet"
      chips={['USDC or BNB', 'On BNB Chain']}
      action={{ label: 'Receive money', onClick: () => setSheet('receive'), icon: <ArrowDownLeft size={22} /> }}
      art={<img src={otterPeek} alt="" />} />
  )
  else if (nextPay) next = (
    <NextCard tone="peach" eyebrow={`Next payment · ${when(nextPay.next_run_at)}`} title={`${fmtAmt(nextPay.amount)} ${nextPay.token} to ${nextPay.to}`}
      chips={[nextPay.frequency, `${nextPay.occurrences_done || 0} of ${nextPay.occurrences || '∞'} sent`]}
      action={{ label: 'See your flows', onClick: () => navigate('/flows'), icon: <ArrowRight size={22} /> }}
      art={<img src={otterPeek} alt="" />} />
  )
  else next = (
    <NextCard tone="lav" eyebrow="Try this" title="Split a bill with friends in one sentence"
      chips={['You see it first', 'You approve it']}
      action={{ label: 'Split a bill', onClick: () => ask('Split '), icon: <ArrowRight size={22} /> }}
      art={<img src={otterPeek} alt="" />} />
  )

  return (
    <main className="page screen">
      <Top
        left={<button className="avatar" onClick={() => navigate('/account')} aria-label="Account"><img src={otterFace} alt="" /></button>}
        eyebrow={greeting()} title={`${user?.username || 'you'}.vel`}
        right={<>
          {!isMainnet && <Pill tone="amber">Test</Pill>}
          <button className="icon-btn" onClick={openAlerts} aria-label={fresh ? 'Alerts, new' : 'Alerts'}><Bell size={20} strokeWidth={1.8} />{fresh && <span className="badge" />}</button>
        </>} />

      <div className="stack">
        <Vault label="Your money"
          labelExtra={<button onClick={toggleHidden} aria-label={hidden ? 'Show balance' : 'Hide balance'}>{hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
          amount={usd} hidden={hidden}
          sub={usd === null ? ' ' : hidden ? 'Hidden' : usd > 0 ? 'USDC and BNB on BNB Chain' : 'Add USDC or BNB to start'}
          actions={<>
            <button className="vbtn" onClick={() => ask('Send ')}><Send size={16} /> Send</button>
            <button className="vbtn glass" onClick={() => setSheet('receive')}><ArrowDownLeft size={17} /> Receive</button>
            <button className="vbtn glass" onClick={() => ask('Split ')}><Users size={16} /> Split</button>
          </>} />

        <button className="ask" onClick={() => navigate('/chat')}>
          <span>Tell your money what to do…</span>
          <span className="go" aria-hidden="true"><ArrowUp size={20} strokeWidth={2.2} /></span>
        </button>

        <div className="tiles">
          <Tile tone="lav" icon={<img src={coinFor('USDC')} alt="" />} value={bal.data ? fmtAmt(usdc?.human || 0) : '—'} label="USDC" onClick={() => setSheet('tokens')} />
          <Tile tone="sage" icon={<img src={coinFor('BNB')} alt="" />} value={bal.data ? fmtAmt(bnb?.human || 0) : '—'} label="BNB" onClick={() => setSheet('tokens')} />
          <Tile tone="butter" icon={<Repeat size={16} />} value={flows.data ? activeCount : '—'} label={activeCount === 1 ? 'Active flow' : 'Active flows'} onClick={() => navigate('/flows')} />
        </div>

        {next}

        <Panel>
          <SectionTitle title="Recent" sub="Your latest payments, newest first."
            action={<button className="link-btn" onClick={() => setSheet('activity')}>See all</button>} />
          {!act.data ? <div style={{ display: 'grid', gap: 10 }}><Skeleton h={52} /><Skeleton h={52} /></div>
            : !(act.data.transactions || []).length ? <Empty title="No payments yet">When you send or receive money, it shows up here.</Empty>
            : <ul className="feed">{act.data.transactions.slice(0, 5).map(t => <li key={t.id || t.digest}><TxRow t={t} /></li>)}</ul>}
        </Panel>
      </div>

      <ReceiveSheet open={sheet === 'receive'} onClose={() => setSheet(null)} username={user?.username} address={address} />
      <TokensSheet open={sheet === 'tokens'} onClose={() => setSheet(null)} tokens={tokens} total={usd || 0} address={address} />
      <ActivitySheet open={sheet === 'activity'} onClose={() => setSheet(null)} />
      <AlertsSheet open={sheet === 'alerts'} onClose={() => setSheet(null)} items={alerts.data ? alerts.data.notifications || [] : null} />
    </main>
  )
}
