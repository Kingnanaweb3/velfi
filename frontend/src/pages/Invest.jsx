import { useNavigate } from 'react-router-dom'
import { ArrowRight, Coins, Landmark, PiggyBank, ShieldCheck } from 'lucide-react'
import { draft } from '../lib/api.js'
import { Top, NextCard, Panel, SectionTitle, Row, Pill } from '../ui/kit.jsx'
import otterPeek from '../assets/otter-peek.webp'
import { t } from '../i18n/index.jsx'

// Honest by design: only swaps exist today. No made-up yields, no fake numbers.
const SOON = [
  { Icon: Coins, title: 'stakeT', sub: 'stakeS' },
  { Icon: Landmark, title: 'earnT', sub: 'earnS' },
  { Icon: PiggyBank, title: 'saveT', sub: 'saveS' },
]

export default function Invest() {
  const navigate = useNavigate()
  const swap = () => { draft(t('draftSwap')); navigate('/chat') }
  return (
    <main className="page screen">
      <Top eyebrow={t('growEyebrow')} title={t('investTitle')} />
      <div className="stack">
        <NextCard tone="sky" eyebrow={t('comingSoon')} title={t('swapTitle')}
          chips={[t('chipOnBnb'), t('chipPriceFirst')]}
          action={{ label: t('swapTokens'), onClick: swap, icon: <ArrowRight size={22} /> }}
          art={<img src={otterPeek} alt="" />} />

        <Panel>
          <SectionTitle title={t('onTheWay')} sub={t('onTheWaySub')} />
          <ul className="feed">
            {SOON.map(({ Icon, title, sub }) => (
              <li key={title}><Row icon={<Icon size={18} />} title={t(title)} sub={t(sub)} end={<Pill tone="amber">{t('soon')}</Pill>} /></li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <SectionTitle title={t('beforeInvest')} sub={t('beforeSub')} />
          <div className="facts">
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>{t('fact1')}</span></p>
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>{t('fact2')}</span></p>
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>{t('fact3')}</span></p>
          </div>
        </Panel>
      </div>
    </main>
  )
}
