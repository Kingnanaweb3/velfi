import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Repeat, WavesHorizontal, ArrowRight, ArrowDownLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useVelfiWallet } from '../hooks/useVelfiWallet.js'
import { api, usePoll, useFlows, draft } from '../lib/api.js'
import { Top, Seg, SegBar, Pill, Panel, SectionTitle, NextCard, Sheet, CloseButton, Skeleton, useToast, fmtAmt } from '../ui/kit.jsx'
import otterPeek from '../assets/otter-peek.webp'
import { t, getLocale } from '../i18n/index.jsx'
import { freqLabel } from '../i18n/format.js'

function nextRun(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (d.getTime() <= Date.now() + 60_000) return t('nextAnyMoment')
  return t('nextAt', { when: d.toLocaleString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) })
}
function stateOf(status, done, total) {
  const s = String(status || '').toLowerCase()
  if (['complete', 'completed', 'done', 'ended', 'cancelled', 'stopped'].includes(s) || (total > 0 && done >= total)) return 'done'
  if (s === 'paused' || s === 'failed') return 'paused'
  return 'active'
}
const PILL = { active: ['live', 'running'], paused: ['amber', 'paused'], done: ['soft', 'finished'] }

function toCards(flows, incoming = []) {
  const out = []
  for (const r of incoming) {
    const p = r.progress || {}
    out.push({ id: `in-${r.id}`, kind: 'incoming', state: 'active', icon: <ArrowDownLeft size={18} />, tone: 'good',
      title: t('comingToYou', { amount: fmtAmt(p.total), token: r.token }), line: t('vestedLine', { pct: p.pct || 0 }),
      used: Number(p.vested || 0), cap: Number(p.total || 0),
      action: { kind: 'claim', label: t('claim'), path: `/streams/${r.id}/claim` } })
  }
  for (const r of (flows?.streams || [])) {
    const st = stateOf(r.status, 0, 0)
    out.push({ id: `s-${r.id}`, kind: 'stream', state: st, icon: <WavesHorizontal size={18} />, tone: 'accent',
      title: t('payTo', { amount: fmtAmt(r.total), token: r.token, to: r.to }), line: t('streamingLine', { pct: r.pct || 0 }),
      used: Number(r.done || 0), cap: Number(r.total || 0),
      action: r.flow && st === 'active' ? { label: t('stop'), path: `/streams/${r.id}/stop`, confirm: { title: t('stopTitle'), body: t('stopBody'), button: t('stopBtn') } } : null })
  }
  for (const r of (flows?.schedules || [])) {
    const done = Number(r.occurrences_done) || 0, total = Number(r.occurrences) || 0
    const st = stateOf(r.status, done, total)
    out.push({ id: `p-${r.id}`, kind: 'schedule', state: st, icon: <Repeat size={18} />, tone: st === 'paused' ? 'warn' : 'accent',
      title: t('payTo', { amount: fmtAmt(r.amount), token: r.token, to: r.to }),
      line: st === 'paused' ? t('pausedLine') : st === 'done' ? t('allSent', { n: total }) : `${freqLabel(r.frequency)} · ${nextRun(r.next_run_at)}`,
      meta: t('sentOf', { done, total: total || '∞' }), used: done, cap: total,
      action: st !== 'done' ? { label: t('cancel'), path: `/schedule/${r.id}/cancel`, confirm: { title: t('cancelTitle'), body: t('cancelBody'), button: t('cancelBtn') } } : null })
  }
  return out
}

export default function Flows() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const wallet = useVelfiWallet()
  const toast = useToast()
  const flows = useFlows()
  const incoming = usePoll('/streams/incoming', 15000)
  const [tab, setTab] = useState('all')
  const [busy, setBusy] = useState(null)
  const [confirm, setConfirm] = useState(null)

  // Claim, stop or cancel: Velfi prepares it, your wallet signs, Velfi sends.
  async function act(c) {
    setConfirm(null); setBusy(c.id)
    let prep = null
    try {
      prep = await api(token, c.action.path, { method: 'POST', body: {} })
      if (!prep.tx) { toast({ text: prep.message || t('doneToast'), tone: 'good' }); return }
      const signedTx = await wallet.sign(prep.tx)
      const d = await api(token, '/tx/submit', { method: 'POST', body: { prepId: prep.prepId, signedTx } })
      toast({ text: d.message || t('doneToast'), tone: 'good' })
    } catch (e) {
      const notSigned = /reject|denied|cancel|closed/i.test(String(e.message)) && !e.status
      // A lite-mode cancel already stopped the schedule; signing only removes the wallet permission.
      if (notSigned && prep?.note) toast(t('liteCancelToast'))
      else toast({ text: notSigned ? t('notSignedNothing') : e.message, tone: notSigned ? '' : 'bad' })
    } finally { setBusy(null); flows.reload(); incoming.reload() }
  }

  const cards = flows.data ? toCards(flows.data, incoming.data?.streams || []) : null
  const shown = (cards || []).filter(c => tab === 'all' || c.state === tab)
  const running = (cards || []).filter(c => c.state === 'active').length

  return (
    <main className="page screen">
      <Top eyebrow={cards ? t('nRunning', { n: running }) : t('autopilot')} title={t('flowsTitle')}
        right={<button className="icon-btn" onClick={() => { draft(t('draftWeekly')); navigate('/chat') }} aria-label={t('newFlow')}><Plus size={20} /></button>} />
      <div className="stack">
        <Seg label={t('show')} value={tab} onChange={setTab} options={[{ id: 'all', label: t('all') }, { id: 'active', label: t('running') }, { id: 'paused', label: t('paused') }, { id: 'done', label: t('finished') }]} />

        {!cards ? <><Skeleton h={150} r={28} /><Skeleton h={150} r={28} /></>
          : cards.length === 0 ? (
            <NextCard tone="lav" eyebrow={t('autopilot')} title={t('autopilotTitle')}
              chips={[t('chipWeekly'), t('chipMonthly'), t('chipCancelAnytime')]}
              action={{ label: t('createFlow'), onClick: () => { draft(t('draftWeekly')); navigate('/chat') }, icon: <ArrowRight size={22} /> }}
              art={<img src={otterPeek} alt="" />} />
          )
          : shown.length === 0 ? (
            <Panel><SectionTitle title={tab === 'active' ? t('nothingRunning') : tab === 'paused' ? t('nothingPaused') : t('nothingFinished')} sub={t('switchAll')} /></Panel>
          )
          : shown.map(c => (
            <Panel key={c.id} className="flow-card">
              <div className="flow-card-top">
                <span className={`dot ${c.tone}`} aria-hidden="true">{c.icon}</span>
                <Pill tone={PILL[c.state][0]}>{c.kind === 'incoming' ? t('forYou') : t(PILL[c.state][1])}</Pill>
              </div>
              <h3>{c.title}</h3>
              <p className="flow-note">{c.line}</p>
              {c.cap > 0 && <SegBar used={c.used} cap={c.cap} />}
              <div className="flow-card-foot">
                <span className="eyebrow">{c.meta || ''}</span>
                {c.action && (
                  <button className={`btn sm ${c.action.kind === 'claim' ? 'primary' : 'ghost'}`} disabled={busy === c.id}
                    onClick={() => c.action.confirm ? setConfirm(c) : act(c)}>
                    {busy === c.id ? <span className="spin" /> : c.action.label}
                  </button>
                )}
              </div>
            </Panel>
          ))}
      </div>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} pale label={confirm?.action?.confirm?.title}>
        {confirm && <>
          <div className="flow-head"><CloseButton onClick={() => setConfirm(null)} /><span /></div>
          <h2 className="flow-title" style={{ fontSize: 30 }}>{confirm.action.confirm.title}</h2>
          <div className="amount-card"><b style={{ fontWeight: 500 }}>{confirm.title}</b><p className="flow-note">{confirm.action.confirm.body}</p></div>
          <div className="actions-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <button className="btn pale" onClick={() => setConfirm(null)}>{t('keepIt')}</button>
            <button className="btn danger" onClick={() => act(confirm)}>{confirm.action.confirm.button}</button>
          </div>
        </>}
      </Sheet>
    </main>
  )
}
