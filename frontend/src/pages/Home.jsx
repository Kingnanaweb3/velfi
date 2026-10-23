import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, ArrowRight, ArrowDownLeft, Bell, Eye, EyeOff, Repeat, Send, Users } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useBalances, useFlows, useActivity, useNotifications, draft } from '../lib/api.js'
import { Top, Vault, Tile, NextCard, Panel, SectionTitle, Empty, Pill, Skeleton, fmtAmt } from '../ui/kit.jsx'
import { ReceiveSheet, TokensSheet, ActivitySheet, AlertsSheet, TxRow, coinFor, isMainnet, lastSeenAlerts, markAlertsSeen } from '../components/sheets.jsx'
import otterFace from '../assets/otter-face.webp'
import otterPeek from '../assets/otter-peek.webp'
import { t, getLocale } from '../i18n/index.jsx'
import { freqLabel } from '../i18n/format.js'


function greeting() {
  const h = new Date().getHours()
  return h < 12 ? t('goodMorning') : h < 17 ? t('goodAfternoon') : t('goodEvening')
}
function when(ts) {
  if (!ts) return t('whenSoon')
  const d = new Date(ts)
  if (d.getTime() <= Date.now() + 60_000) return t('whenNow')
  return d.toLocaleString(getLocale(), { weekday: 'short', hour: 'numeric', minute: '2-digit' })
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
    <NextCard tone="sky" eyebrow={t('getStarted')} title={t('addMoneyTitle')}
      chips={[t('chipUsdcBnb'), t('chipOnBnb')]}
      action={{ label: t('receiveMoney'), onClick: () => setSheet('receive'), icon: <ArrowDownLeft size={22} /> }}
      art={<img src={otterPeek} alt="" />} />
  )
  else if (nextPay) next = (
    <NextCard tone="peach" eyebrow={t('nextPayment', { when: when(nextPay.next_run_at) })} title={t('payTo', { amount: fmtAmt(nextPay.amount), token: nextPay.token, to: nextPay.to })}
      chips={[freqLabel(nextPay.frequency), t('sentOf', { done: nextPay.occurrences_done || 0, total: nextPay.occurrences || '∞' })]}
      action={{ label: t('seeFlows'), onClick: () => navigate('/flows'), icon: <ArrowRight size={22} /> }}
      art={<img src={otterPeek} alt="" />} />
  )
  else next = (
    <NextCard tone="lav" eyebrow={t('tryThis')} title={t('splitTitle')}
      chips={[t('chipSeeFirst'), t('chipApprove')]}
      action={{ label: t('splitBill'), onClick: () => ask(t('draftSplit')), icon: <ArrowRight size={22} /> }}
      art={<img src={otterPeek} alt="" />} />
  )

  return (
    <main className="page screen">
      <Top
        left={<button className="avatar" onClick={() => navigate('/account')} aria-label={t('account')}><img src={otterFace} alt="" /></button>}
        eyebrow={greeting()} title={`${user?.username || t('you')}.vel`}
        right={<>
          {!isMainnet && <Pill tone="amber">{t('test')}</Pill>}
          <button className="icon-btn" onClick={openAlerts} aria-label={fresh ? t('alertsNew') : t('alerts')}><Bell size={20} strokeWidth={1.8} />{fresh && <span className="badge" />}</button>
        </>} />

      <div className="stack">
        <Vault label={t('yourMoney')}
          labelExtra={<button onClick={toggleHidden} aria-label={hidden ? t('showBalance') : t('hideBalance')}>{hidden ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
          amount={usd} hidden={hidden}
          sub={usd === null ? ' ' : hidden ? t('hidden') : usd > 0 ? t('vaultSub') : t('vaultEmpty')}
          actions={<>
            <button className="vbtn" onClick={() => ask(t('draftSend'))}><Send size={16} /> {t('send')}</button>
            <button className="vbtn glass" onClick={() => setSheet('receive')}><ArrowDownLeft size={17} /> {t('receive')}</button>
            <button className="vbtn glass" onClick={() => ask(t('draftSplit'))}><Users size={16} /> {t('split')}</button>
          </>} />

        <button className="ask" onClick={() => navigate('/chat')}>
          <span>{t('askPlaceholder')}</span>
          <span className="go" aria-hidden="true"><ArrowUp size={20} strokeWidth={2.2} /></span>
        </button>

        <div className="tiles">
          <Tile tone="lav" icon={<img src={coinFor('USDC')} alt="" />} value={bal.data ? fmtAmt(usdc?.human || 0) : '—'} label="USDC" onClick={() => setSheet('tokens')} />
          <Tile tone="sage" icon={<img src={coinFor('BNB')} alt="" />} value={bal.data ? fmtAmt(bnb?.human || 0) : '—'} label="BNB" onClick={() => setSheet('tokens')} />
          <Tile tone="butter" icon={<Repeat size={16} />} value={flows.data ? activeCount : '—'} label={activeCount === 1 ? t('activeFlow') : t('activeFlows')} onClick={() => navigate('/flows')} />
        </div>

        {next}

        <Panel>
          <SectionTitle title={t('recent')} sub={t('recentSub')}
            action={<button className="link-btn" onClick={() => setSheet('activity')}>{t('seeAll')}</button>} />
          {!act.data ? <div style={{ display: 'grid', gap: 10 }}><Skeleton h={52} /><Skeleton h={52} /></div>
            : !(act.data.transactions || []).length ? <Empty title={t('noPayments')}>{t('noPaymentsBody')}</Empty>
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
