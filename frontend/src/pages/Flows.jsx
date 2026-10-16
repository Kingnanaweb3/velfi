import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Repeat, WavesHorizontal, ArrowRight, ArrowDownLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useVelfiWallet } from '../hooks/useVelfiWallet.js'
import { api, usePoll, useFlows, draft } from '../lib/api.js'
import { Top, Seg, SegBar, Pill, Panel, SectionTitle, NextCard, Sheet, CloseButton, Skeleton, useToast, fmtAmt } from '../ui/kit.jsx'
import otterPeek from '../assets/otter-peek.webp'

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s)
function nextRun(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (d.getTime() <= Date.now() + 60_000) return 'Next: any moment'
  return 'Next: ' + d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function stateOf(status, done, total) {
  const s = String(status || '').toLowerCase()
  if (['complete', 'completed', 'done', 'ended', 'cancelled', 'stopped'].includes(s) || (total > 0 && done >= total)) return 'done'
  if (s === 'paused' || s === 'failed') return 'paused'
  return 'active'
}
const PILL = { active: ['live', 'Running'], paused: ['amber', 'Paused'], done: ['soft', 'Finished'] }

function toCards(flows, incoming = []) {
  const out = []
  for (const r of incoming) {
    const p = r.progress || {}
    out.push({ id: `in-${r.id}`, kind: 'incoming', state: 'active', icon: <ArrowDownLeft size={18} />, tone: 'good',
      title: `${fmtAmt(p.total)} ${r.token} coming to you`, line: `${p.pct || 0}% vested. Claim what has vested anytime.`,
      used: Number(p.vested || 0), cap: Number(p.total || 0),
      action: { label: 'Claim', path: `/streams/${r.id}/claim` } })
  }
  for (const r of (flows?.streams || [])) {
    const st = stateOf(r.status, 0, 0)
    out.push({ id: `s-${r.id}`, kind: 'stream', state: st, icon: <WavesHorizontal size={18} />, tone: 'accent',
      title: `${fmtAmt(r.total)} ${r.token} to ${r.to}`, line: `Streaming · ${r.pct || 0}% paid out`,
      used: Number(r.done || 0), cap: Number(r.total || 0),
      action: r.flow && st === 'active' ? { label: 'Stop', path: `/streams/${r.id}/stop`, confirm: { title: 'Stop this stream?', body: 'They keep what has already paid out. The rest comes back to you.', button: 'Stop stream' } } : null })
  }
  for (const r of (flows?.schedules || [])) {
    const done = Number(r.occurrences_done) || 0, total = Number(r.occurrences) || 0
    const st = stateOf(r.status, done, total)
    out.push({ id: `p-${r.id}`, kind: 'schedule', state: st, icon: <Repeat size={18} />, tone: st === 'paused' ? 'warn' : 'accent',
      title: `${fmtAmt(r.amount)} ${r.token} to ${r.to}`,
      line: st === 'paused' ? 'A payment didn’t go through, so this is paused.' : st === 'done' ? `All ${total} payments sent` : `${cap(r.frequency || 'Recurring')} · ${nextRun(r.next_run_at)}`,
      meta: `${done} of ${total || '∞'} sent`, used: done, cap: total,
      action: st !== 'done' ? { label: 'Cancel', path: `/schedule/${r.id}/cancel`, confirm: { title: 'Cancel this schedule?', body: 'No more payments will go out. Payments already sent stay sent.', button: 'Cancel schedule' } } : null })
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
      if (!prep.tx) { toast({ text: prep.message || 'Done.', tone: 'good' }); return }
      const signedTx = await wallet.sign(prep.tx)
      const d = await api(token, '/tx/submit', { method: 'POST', body: { prepId: prep.prepId, signedTx } })
      toast({ text: d.message || 'Done.', tone: 'good' })
    } catch (e) {
      const notSigned = /reject|denied|cancel|closed/i.test(String(e.message)) && !e.status
      // A lite-mode cancel already stopped the schedule; signing only removes the wallet permission.
      if (notSigned && prep?.note) toast('Schedule cancelled. No more payments will go out. The unused permission stays on your wallet until your next schedule replaces it, and Velfi won’t use it.')
      else toast({ text: notSigned ? 'You didn’t sign, so nothing changed.' : e.message, tone: notSigned ? '' : 'bad' })
    } finally { setBusy(null); flows.reload(); incoming.reload() }
  }

  const cards = flows.data ? toCards(flows.data, incoming.data?.streams || []) : null
  const shown = (cards || []).filter(c => tab === 'all' || c.state === tab)
  const running = (cards || []).filter(c => c.state === 'active').length

  return (
    <main className="page screen">
      <Top eyebrow={cards ? `${running} running` : 'Autopilot'} title="Flows"
        right={<button className="icon-btn" onClick={() => { draft('Every week send '); navigate('/chat') }} aria-label="New flow"><Plus size={20} /></button>} />
      <div className="stack">
        <Seg label="Show" value={tab} onChange={setTab} options={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Running' }, { id: 'paused', label: 'Paused' }, { id: 'done', label: 'Finished' }]} />

        {!cards ? <><Skeleton h={150} r={28} /><Skeleton h={150} r={28} /></>
          : cards.length === 0 ? (
            <NextCard tone="lav" eyebrow="Autopilot" title="Set up a payment that runs itself"
              chips={['Weekly', 'Monthly', 'Cancel anytime']}
              action={{ label: 'Create a flow', onClick: () => { draft('Every week send '); navigate('/chat') }, icon: <ArrowRight size={22} /> }}
              art={<img src={otterPeek} alt="" />} />
          )
          : shown.length === 0 ? (
            <Panel><SectionTitle title={`Nothing ${tab === 'active' ? 'running' : tab === 'paused' ? 'paused' : 'finished'}`} sub="Switch to All to see every flow." /></Panel>
          )
          : shown.map(c => (
            <Panel key={c.id} className="flow-card">
              <div className="flow-card-top">
                <span className={`dot ${c.tone}`} aria-hidden="true">{c.icon}</span>
                <Pill tone={PILL[c.state][0]}>{c.kind === 'incoming' ? 'For you' : PILL[c.state][1]}</Pill>
              </div>
              <h3>{c.title}</h3>
              <p className="flow-note">{c.line}</p>
              {c.cap > 0 && <SegBar used={c.used} cap={c.cap} />}
              <div className="flow-card-foot">
                <span className="eyebrow">{c.meta || ''}</span>
                {c.action && (
                  <button className={`btn sm ${c.action.label === 'Claim' ? 'primary' : 'ghost'}`} disabled={busy === c.id}
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
            <button className="btn pale" onClick={() => setConfirm(null)}>Keep it</button>
            <button className="btn danger" onClick={() => act(confirm)}>{confirm.action.confirm.button}</button>
          </div>
        </>}
      </Sheet>
    </main>
  )
}
