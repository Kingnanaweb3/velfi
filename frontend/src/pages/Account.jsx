import { useState } from 'react'
import { BookOpen, Check, Copy, ExternalLink, FileText, LogOut, MessageCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { useBalances } from '../lib/api.js'
import { shortAddr } from '../lib/api.js'
import { explorerAddress, EXPLORER_NAME } from '../lib/chain.js'
import { getThemeChoice, setThemeChoice } from '../lib/theme.js'
import { Top, Panel, SectionTitle, Row, Seg, Pill, useCopy } from '../ui/kit.jsx'
import { isMainnet } from '../components/sheets.jsx'
import otterFace from '../assets/otter-face.webp'

export default function Account() {
  const { user, logout } = useAuth()
  const bal = useBalances()
  const { copied, copy } = useCopy()
  const [theme, setTheme] = useState(getThemeChoice)
  const handle = `${user?.username || 'you'}.vel`
  const address = bal.data?.address || user?.address || user?.wallet_address
  const pickTheme = (t) => { setThemeChoice(t); setTheme(t) }

  return (
    <main className="page screen">
      <Top eyebrow="Account" title="You" />
      <div className="stack">
        <Panel>
          <div className="profile">
            <span className="avatar"><img src={otterFace} alt="" /></span>
            <div style={{ minWidth: 0 }}>
              <b>{handle}</b>
              <small>{user?.email ? `Signed in with Google · ${user.email}` : 'Signed in with Google'}</small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
            <Pill tone="lime">Your own wallet</Pill>
            <Pill tone={isMainnet ? 'soft' : 'amber'}>{isMainnet ? 'Solana' : 'Solana test network'}</Pill>
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="Your details" sub="Tap to copy." />
          <ul className="feed">
            <li><Row title="Your .vel name" sub={handle} onClick={() => copy(handle, 'h')} chevron={copied === 'h' ? <Check size={18} /> : <Copy size={17} />} /></li>
            <li><Row title="Wallet address" sub={address ? shortAddr(address) : 'Loading…'} onClick={() => address && copy(address, 'a')} chevron={copied === 'a' ? <Check size={18} /> : <Copy size={17} />} /></li>
            {address && <li><Row title={`View on ${EXPLORER_NAME}`} sub="Every payment, publicly checkable" href={explorerAddress(address)} chevron={<ExternalLink size={17} />} /></li>}
          </ul>
        </Panel>

        <Panel>
          <SectionTitle title="Appearance" sub="Auto follows your phone or computer." />
          <Seg label="Appearance" value={theme} onChange={pickTheme} options={[{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'system', label: 'Auto' }]} />
        </Panel>

        <Panel>
          <SectionTitle title="How Velfi keeps you safe" />
          <div className="facts">
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>Your wallet is yours. Every payment needs your approval and signature.</span></p>
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>Schedules only pay who you chose, how much you chose. Cancel any of them in Flows.</span></p>
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>Velfi pays the network fee on payments, so you don’t need SOL to move USDC.</span></p>
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="Help" />
          <ul className="feed">
            <li><Row icon={<BookOpen size={18} />} title="Docs and guides" href="https://velfi.xyz/docs" chevron={<ExternalLink size={17} />} /></li>
            <li><Row icon={<FileText size={18} />} title="Litepaper" href="https://velfi.xyz/litepaper" chevron={<ExternalLink size={17} />} /></li>
            <li><Row icon={<MessageCircle size={18} />} title="Message us on X" sub="@velfixyz" href="https://x.com/velfixyz" chevron={<ExternalLink size={17} />} /></li>
          </ul>
        </Panel>

        <button className="btn danger block" onClick={logout}><LogOut size={18} /> Log out</button>
      </div>
    </main>
  )
}
