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
import { t, useLang, LANGS } from '../i18n/index.jsx'

export default function Account() {
  const { user, logout } = useAuth()
  const { lang, setLang } = useLang()
  const bal = useBalances()
  const { copied, copy } = useCopy()
  const [theme, setTheme] = useState(getThemeChoice)
  const handle = `${user?.username || t('you')}.vel`
  const address = bal.data?.address || user?.address || user?.wallet_address
  const pickTheme = (t) => { setThemeChoice(t); setTheme(t) }

  return (
    <main className="page screen">
      <Top eyebrow={t('accountEyebrow')} title={t('youTitle')} />
      <div className="stack">
        <Panel>
          <div className="profile">
            <span className="avatar"><img src={otterFace} alt="" /></span>
            <div style={{ minWidth: 0 }}>
              <b>{handle}</b>
              <small>{user?.email ? t('signedInEmail', { email: user.email }) : t('signedIn')}</small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
            <Pill tone="lime">{t('ownWallet')}</Pill>
            <Pill tone={isMainnet ? 'soft' : 'amber'}>{isMainnet ? t('bnbChain') : t('bnbTestnet')}</Pill>
          </div>
        </Panel>

        <Panel>
          <SectionTitle title={t('yourDetails')} sub={t('tapToCopy')} />
          <ul className="feed">
            <li><Row title={t('velName')} sub={handle} onClick={() => copy(handle, 'h')} chevron={copied === 'h' ? <Check size={18} /> : <Copy size={17} />} /></li>
            <li><Row title={t('walletAddress')} sub={address ? shortAddr(address) : t('loading')} onClick={() => address && copy(address, 'a')} chevron={copied === 'a' ? <Check size={18} /> : <Copy size={17} />} /></li>
            {address && <li><Row title={t('viewOn', { name: EXPLORER_NAME })} sub={t('publicCheck')} href={explorerAddress(address)} chevron={<ExternalLink size={17} />} /></li>}
          </ul>
        </Panel>

        <Panel>
          <SectionTitle title={t('appearance')} sub={t('appearanceSub')} />
          <Seg label={t('appearance')} value={theme} onChange={pickTheme} options={[{ id: 'light', label: t('light') }, { id: 'dark', label: t('dark') }, { id: 'system', label: t('auto') }]} />
        </Panel>

        <Panel>
          <SectionTitle title={t('language')} sub={t('languageSub')} />
          <Seg label={t('language')} value={lang} onChange={setLang} options={LANGS.map(l => ({ id: l.code, label: l.label }))} />
        </Panel>

        <Panel>
          <SectionTitle title={t('safeTitle')} />
          <div className="facts">
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>{t('safe1')}</span></p>
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>{t('safe2')}</span></p>
            <p><span aria-hidden="true"><ShieldCheck size={16} /></span><span>{t('safe3')}</span></p>
          </div>
        </Panel>

        <Panel>
          <SectionTitle title={t('help')} />
          <ul className="feed">
            <li><Row icon={<BookOpen size={18} />} title={t('docs')} href="https://velfi.xyz/docs" chevron={<ExternalLink size={17} />} /></li>
            <li><Row icon={<FileText size={18} />} title={t('litepaper')} href="https://velfi.xyz/litepaper" chevron={<ExternalLink size={17} />} /></li>
            <li><Row icon={<MessageCircle size={18} />} title={t('messageX')} sub="@velfixyz" href="https://x.com/velfixyz" chevron={<ExternalLink size={17} />} /></li>
          </ul>
        </Panel>

        <button className="btn danger block" onClick={logout}><LogOut size={18} /> {t('logout')}</button>
      </div>
    </main>
  )
}
