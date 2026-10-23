import { useNavigate } from 'react-router-dom'
import { ArrowRight, Coins, Landmark, PiggyBank, ShieldCheck } from 'lucide-react'
import { draft } from '../lib/api.js'
import { Top, NextCard, Panel, SectionTitle, Row, Pill } from '../ui/kit.jsx'
import otterPeek from '../assets/otter-peek.webp'

// Honest by design: only swaps exist today. No made-up yields, no fake numbers.
const SOON = [
  { Icon: Coins, title: 'Stake BNB', sub: 'Earn network rewards on BNB you hold' },
  { Icon: Landmark, title: 'Earn on USDC', sub: 'Lend idle dollars to established BNB Chain markets' },
  { Icon: PiggyBank, title: 'Save automatically', sub: 'Put aside a share of every payment you receive' },
]

export default function Invest() {
  const navigate = useNavigate()
  const swap = () => { draft('Swap 10 USDC to BNB'); navigate('/chat') }
  return (
    <main className="page screen">
      <Top eyebrow="Grow your money" title="Invest" />
      <div className="stack">
        <NextCard tone="sky" eyebrow="Coming soon" title="Swap tokens just by asking"
          chips={['On BNB Chain', 'You see the price first']}
          action={{ label: 'Swap tokens', onClick: swap, icon: <ArrowRight size={22} /> }}
          art={<img src={otterPeek} alt="" />} />

        <Panel>
          <SectionTitle title="On the way" sub="Not live yet. Nothing here earns anything today." />
          <ul className="feed">
            {SOON.map(({ Icon, title, sub }) => (
              <li key={title}><Row icon={<Icon size={18} />} title={title} sub={sub} end={<Pill tone="amber">Soon</Pill>} /></li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <SectionTitle title="Before you invest" sub="Plain facts, so there are no surprises." />
          <div className="facts">
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>Velfi explains each option and never moves money without your signature.</span></p>
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>Crypto prices go down as well as up. Only put in what you can afford to lose.</span></p>
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>Velfi doesn’t give financial advice.</span></p>
          </div>
        </Panel>
      </div>
    </main>
  )
}
