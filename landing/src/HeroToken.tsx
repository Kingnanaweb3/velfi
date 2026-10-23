import { useTokenConfig, useCopy } from './tokenConfig'
import { useLang } from './i18n'

// The pill above the hero headline. Before launch: "coming soon". Once the
// address is live (and checked on-chain): "$VELFI is live" + the address exactly
// exactly as written (upper and lower case kept) + a copy button.
export default function HeroToken() {
  const cfg = useTokenConfig()
  const { copied, copy } = useCopy()
  const { t } = useLang()

  if (cfg.status !== 'live') {
    return (
      <a href="#token" className="hero-token"><span className="hero-token-dot"></span>{t('heroPillSoon')} <span className="hero-token-arrow">→</span></a>
    )
  }

  const a = cfg.address
  const short = `${a.slice(0, 6)}…${a.slice(-8)}`
  return (
    <div className={cfg.test ? 'hero-token hero-token-live hero-token-test' : 'hero-token hero-token-live'}>
      <span className="hero-token-dot hero-token-pulse"></span>
      <a href="#token" className="hero-token-label">{cfg.test ? t('tokenTestTag') : t('heroPillLive')}</a>
      <span className="hero-token-sep" aria-hidden="true"></span>
      <span className="hero-token-addr" translate="no" title={a}>
        <span className="hero-token-full">{a}</span>
        <span className="hero-token-short">{short}</span>
      </span>
      <button type="button" className="hero-token-copy" onClick={() => copy(a)} aria-label={copied ? t('copied') : `${t('copyCa')} ${a}`}>
        {copied ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
        )}
      </button>
      <span className="hero-token-toast" role="status" aria-live="polite">{copied ? t('copied') : ''}</span>
    </div>
  )
}
