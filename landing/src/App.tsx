import './index.css'
import logo from './assets/logo.png'
import cardImg from './assets/what-card.webp'
import waitlistBg from './assets/waitlist-bg.webp'
import otter from './assets/otter.webp'
import { useState, useEffect, useRef } from 'react'
import TokenCA from './TokenCA'
import HeroToken from './HeroToken'
import { useLang, rich, LANGS } from './i18n'
import type { Lang } from './i18n'

// The Velfi web app (sign in with Google, claim a .vel name).
const APP_URL = 'https://app.velfi.xyz'

// EN · 中文 · 한국어 picker in the top bar (desktop) and the mobile menu.
function LangSwitch({ mobile = false, onPick }: { mobile?: boolean; onPick?: () => void }) {
  const { lang, setLang, t } = useLang()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const pick = (l: Lang) => { setLang(l); setOpen(false); onPick?.() }
  if (mobile) {
    return (
      <div className="mobile-langs" role="group" aria-label={t('navLanguage')}>
        {LANGS.map(l => (
          <button key={l.code} type="button" lang={l.html} className={l.code === lang ? 'on' : ''} aria-pressed={l.code === lang} onClick={() => pick(l.code)}>{l.label}</button>
        ))}
      </div>
    )
  }
  const cur = LANGS.find(l => l.code === lang)!
  return (
    <div className="lang-switch" ref={ref}>
      <button type="button" className="lang-btn" aria-haspopup="true" aria-expanded={open} aria-label={t('navLanguage')} onClick={() => setOpen(o => !o)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9s1.3-6.4 3.8-9z" /></svg>
        <span lang={cur.html}>{cur.label}</span>
      </button>
      <div className={`nav-dropdown lang-menu${open ? ' open' : ''}`}>
        {LANGS.map(l => (
          <button key={l.code} type="button" lang={l.html} className={l.code === lang ? 'on' : ''} onClick={() => pick(l.code)}>{l.label}</button>
        ))}
      </div>
    </div>
  )
}

function App() {
  const { t, lang } = useLang()
  // Chinese runs a headline straight into its accent part; English and Korean keep a space.
  const sp = lang === 'zh' ? '' : ' '
  const [scrolled, setScrolled] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [menuOpen, setMenuOpen] = useState(false)

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openDropdown = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    setResourcesOpen(true)
  }
  const closeDropdown = () => {
    closeTimer.current = setTimeout(() => setResourcesOpen(false), 250)
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setResourcesOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll('.reveal, .reveal-otter')
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed')
        } else {
          entry.target.classList.remove('revealed')
        }
      })
    }, { threshold: 0.15 })
    els.forEach((el) => obs.observe(el))

    return () => obs.disconnect()
  }, [])

  return (
    <div>
      <nav className={`nav${scrolled ? ' scrolled' : ''}${menuOpen ? ' menu-open' : ''}`}>
        <div className="nav-logo"><img src={logo} className="nav-logo-img" alt="Velfi" /><span>Velfi</span></div>
        <div className="nav-links">
          <a href="#how-it-works">{t('navHow')}</a>
          <a href="#features">{t('navFeatures')}</a>
          <a href="#token">{t('navToken')}</a>
          <div
            className="nav-dropdown-wrap"
            ref={dropdownRef}
            onMouseEnter={openDropdown}
            onMouseLeave={closeDropdown}
          >
            <button className="nav-dropdown-btn">{t('navResources')} ▾</button>
            <div className={`nav-dropdown${resourcesOpen ? ' open' : ''}`}>
              <a href="/docs" target="_blank" rel="noreferrer">{t('navDocs')}</a>
              <a href="/docs/guides/sending-money" target="_blank" rel="noreferrer">{t('navGuides')}</a>
              <a href="/litepaper" target="_blank" rel="noreferrer">{t('navLitepaper')}</a>
              <a href="/docs/token/velfi" target="_blank" rel="noreferrer">{t('navToken')}</a>
            </div>
          </div>
        </div>
        <div className="nav-right">
          <LangSwitch />
          <a href={APP_URL} className="nav-cta">{t('navOpenApp')}</a>
        </div>
        <button className={`nav-burger${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label={t('navMenu')}>
          <span></span><span></span><span></span>
        </button>
      </nav>

      <div className={`mobile-menu${menuOpen ? ' open' : ''}`}>
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>{t('navHow')}</a>
        <a href="#features" onClick={() => setMenuOpen(false)}>{t('navFeatures')}</a>
        <a href="#token" onClick={() => setMenuOpen(false)}>{t('navToken')}</a>
        <a href="/docs" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>{t('navDocs')}</a>
        <a href="/docs/guides/sending-money" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>{t('navGuides')}</a>
        <a href="/litepaper" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>{t('navLitepaper')}</a>
        <LangSwitch mobile onPick={() => setMenuOpen(false)} />
        <a href={APP_URL} className="mobile-menu-cta" onClick={() => setMenuOpen(false)}>{t('navOpenApp')}</a>
      </div>

      <section className="hero">
        <div className="hero-content">
          <HeroToken />
          <h1 className="hero-headline">{t('heroH1a')}<br />{t('heroH1b')}</h1>
          <p className="hero-body">{t('heroBody')}</p>
          <a href={APP_URL} className="hero-cta">{t('heroCta')}</a>
        </div>
      </section>

      <section className="what-section" id="how-it-works">
        <div className="what-top">
          <div className="what-left">
            <h2 className="what-headline">{t('whatH')}</h2>
            <a href={APP_URL} className="what-explore">{t('whatExplore')}</a>
          </div>
          <p className="what-def">{t('whatDef')}</p>
        </div>

        <div className="what-cards">
          <div className="wcard wcard-light reveal" style={{ transitionDelay: '0ms' }}>
            <div className="wcard-img-wrap">
              <img src={cardImg} alt="" className="wcard-img" />
              <div className="wcard-overlay">
                <h3 className="wcard-title-ov">{t('card1T')}</h3>
                <p className="wcard-body-ov">{t('card1B')}</p>
              </div>
            </div>
          </div>
          <div className="wcard wcard-dark reveal" style={{ transitionDelay: '120ms' }}>
            <h3 className="wcard-title">{t('card2T')}</h3>
            <p className="wcard-body">{t('card2B')}</p>
          </div>
          <div className="wcard wcard-dark reveal" style={{ transitionDelay: '240ms' }}>
            <h3 className="wcard-title">{t('card3T')}</h3>
            <p className="wcard-body">{t('card3B')}</p>
          </div>
        </div>

        <div className="trust-strip">
          <p className="trust-label">{t('trustA')}<br />{t('trustB')}</p>
          <div className="marquee">
            <div className="marquee-track">
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">BNB Chain</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">USDC</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">USDT</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">{t('mqSwaps')}</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">{t('mqGoogle')}</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">{t('mqGasless')}</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">BNB Chain</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">USDC</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">USDT</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">{t('mqSwaps')}</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">{t('mqGoogle')}</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">{t('mqGasless')}</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="who-section" id="features">
        <div className="who-eyebrow"><span className="who-dash"></span>{t('whoEyebrow')}</div>
        <h2 className="who-headline">{t('whoH')}{sp}<span className="who-accent">{t('whoHAccent')}</span></h2>
        <div className="who-cols">
          <div className="who-col reveal">
            <p className="who-text">{t('who1')}</p>
          </div>
          <div className="who-col reveal" style={{ transitionDelay: '120ms' }}>
            <p className="who-text">{t('who2')}</p>
          </div>
          <div className="who-col reveal" style={{ transitionDelay: '240ms' }}>
            <p className="who-text">{t('who3')}</p>
          </div>
        </div>
      </section>

      <section className="how-section">
        <div className="how-eyebrow"><span className="how-dash"></span>{t('howEyebrow')}</div>
        <h2 className="how-headline">{t('howH')}{sp}<span className="how-accent">{t('howHAccent')}</span></h2>
        <div className="how-cards">
          <div className="how-card reveal">
            <span className="how-num">01</span>
            <h3 className="how-card-title">{t('step1T')}</h3>
            <p className="how-card-body">{t('step1B')}</p>
          </div>
          <div className="how-card reveal" style={{ transitionDelay: '150ms' }}>
            <span className="how-num">02</span>
            <h3 className="how-card-title">{t('step2T')}</h3>
            <p className="how-card-body">{t('step2B')}</p>
          </div>
          <div className="how-card reveal" style={{ transitionDelay: '300ms' }}>
            <span className="how-num">03</span>
            <h3 className="how-card-title">{t('step3T')}</h3>
            <p className="how-card-body">{t('step3B')}</p>
          </div>
          <div className="how-card reveal" style={{ transitionDelay: '450ms' }}>
            <span className="how-num">04</span>
            <h3 className="how-card-title">{t('step4T')}</h3>
            <p className="how-card-body">{t('step4B')}</p>
          </div>
        </div>
        <div className="how-swipe-hint">
          <svg width="34" height="20" viewBox="0 0 34 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 13c6 4 14 4 20-1 3-2.5 5-6 4-9-0.6-1.8-2.6-2-3.4-0.3-0.9 2 0.2 4.7 2.4 6.2 2.4 1.6 5.6 1.7 8.4 0.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M28 16l5-2-2-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>{t('swipe')}</span>
        </div>
      </section>

      <section className="sec-section">
        <div className="sec-eyebrow"><span className="who-dash"></span>{t('secEyebrow')}</div>
        <h2 className="sec-headline">{t('secH')}{sp}<span className="who-accent">{t('secHAccent')}</span></h2>
        <div className="sec-cards">
          <div className="sec-card reveal">
            <span className="sec-label">{t('sec1L')}</span>
            <h3 className="sec-card-title">{t('sec1T')}</h3>
            <p className="sec-card-body">{t('sec1B')}</p>
          </div>
          <div className="sec-card reveal" style={{ transitionDelay: '200ms' }}>
            <span className="sec-label">{t('sec2L')}</span>
            <h3 className="sec-card-title">{t('sec2T')}</h3>
            <p className="sec-card-body">{t('sec2B')}</p>
          </div>
          <div className="sec-card reveal" style={{ transitionDelay: '400ms' }}>
            <span className="sec-label">{t('sec3L')}</span>
            <h3 className="sec-card-title">{t('sec3T')}</h3>
            <p className="sec-card-body">{t('sec3B')}</p>
          </div>
        </div>
      </section>

      <section className="own-section">
        <div className="own-eyebrow"><span className="own-dash"></span>{t('ownEyebrow')}</div>
        <h2 className="own-headline">{t('ownH')}{sp}<span className="own-accent">{t('ownHAccent')}</span></h2>
        <div className="own-cards">
          <div className="own-card reveal">
            <span className="own-tag">{t('own1Tag')}</span>
            <h3 className="own-col-title">{t('own1T')}</h3>
            <p className="own-col-body">{t('own1B')}</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '100ms' }}>
            <span className="own-tag">{t('own2Tag')}</span>
            <h3 className="own-col-title">{t('own2T')}</h3>
            <p className="own-col-body">{t('own2B')}</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '200ms' }}>
            <span className="own-tag">{t('own3Tag')}</span>
            <h3 className="own-col-title">{t('own3T')}</h3>
            <p className="own-col-body">{t('own3B')}</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '300ms' }}>
            <span className="own-tag">{t('own4Tag')}</span>
            <h3 className="own-col-title">{t('own4T')}</h3>
            <p className="own-col-body">{t('own4B')}</p>
          </div>
        </div>
        <div className="own-swipe-hint">
          <svg width="34" height="20" viewBox="0 0 34 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 13c6 4 14 4 20-1 3-2.5 5-6 4-9-0.6-1.8-2.6-2-3.4-0.3-0.9 2 0.2 4.7 2.4 6.2 2.4 1.6 5.6 1.7 8.4 0.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M28 16l5-2-2-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>{t('swipe')}</span>
        </div>
      </section>

      <section className="uc-section">
        <div className="uc-eyebrow"><span className="how-dash"></span>{t('ucEyebrow')}</div>
        <h2 className="uc-headline">{t('ucH')}{sp}<span className="how-accent">{t('ucHAccent')}</span></h2>
        <div className="uc-grid">
          <div className="uc-card reveal">
            <span className="uc-tag">{t('uc1Tag')}</span>
            <div className="uc-bubble">{t('uc1')}</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '90ms' }}>
            <span className="uc-tag">{t('uc2Tag')}</span>
            <div className="uc-bubble">{t('uc2')}</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '180ms' }}>
            <span className="uc-tag">{t('uc3Tag')}</span>
            <div className="uc-bubble">{t('uc3')}</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '270ms' }}>
            <span className="uc-tag">{t('uc4Tag')}</span>
            <div className="uc-bubble">{t('uc4')}</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '360ms' }}>
            <span className="uc-tag">{t('uc5Tag')}</span>
            <div className="uc-bubble">{t('uc5')}</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '450ms' }}>
            <span className="uc-tag">{t('uc6Tag')}</span>
            <div className="uc-bubble">{t('uc6')}</div>
          </div>
        </div>
        <div className="uc-footer-row">
          <div className="how-swipe-hint uc-swipe-hint">
            <svg width="34" height="20" viewBox="0 0 34 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 13c6 4 14 4 20-1 3-2.5 5-6 4-9-0.6-1.8-2.6-2-3.4-0.3-0.9 2 0.2 4.7 2.4 6.2 2.4 1.6 5.6 1.7 8.4 0.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M28 16l5-2-2-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>{t('swipe')}</span>
          </div>
        </div>
      </section>

      <section className="tk-section" id="token">
        <div className="who-eyebrow"><span className="who-dash"></span>{t('tkEyebrow')}</div>
        <h2 className="tk-headline">{t('tkH')}{sp}<span className="who-accent">{t('tkHAccent')}</span></h2>
        <div className="tk-grid">
          <div className="tk-facts reveal">
            <p className="tk-intro">{t('tkIntro')}</p>
            <div className="tk-rows">
              <div className="tk-row"><span>{t('tkSupply')}</span><b>1,000,000,000</b></div>
              <div className="tk-row"><span>{t('tkLaunch')}</span><b>{t('tkFair')}</b></div>
              <div className="tk-row"><span>{t('tkNetwork')}</span><b>BNB Chain</b></div>
            </div>
            <TokenCA />
          </div>
          <div className="tk-uses">
            <div className="tk-use reveal">
              <span className="tk-use-tag">{t('use1Tag')}</span>
              <h3 className="tk-use-title">{t('use1T')}</h3>
              <p className="tk-use-body">{t('use1B')}</p>
            </div>
            <div className="tk-use reveal" style={{ transitionDelay: '100ms' }}>
              <span className="tk-use-tag">{t('use2Tag')}</span>
              <h3 className="tk-use-title">{t('use2T')}</h3>
              <p className="tk-use-body">{t('use2B')}</p>
            </div>
            <div className="tk-use reveal" style={{ transitionDelay: '200ms' }}>
              <span className="tk-use-tag">{t('use3Tag')}</span>
              <h3 className="tk-use-title">{t('use3T')}</h3>
              <p className="tk-use-body">{t('use3B')}</p>
            </div>
            <div className="tk-use reveal" style={{ transitionDelay: '300ms' }}>
              <span className="tk-use-tag">{t('use4Tag')}</span>
              <h3 className="tk-use-title">{t('use4T')}</h3>
              <p className="tk-use-body">{t('use4B')}</p>
            </div>
          </div>
        </div>
        <div className="tk-foot">
          <p className="tk-disclaimer">{t('tkDisclaimer')}</p>
          <a href="/docs/token/velfi" target="_blank" rel="noreferrer" className="tk-docs">{t('tkDocs')} <span className="fa">↗</span></a>
        </div>
      </section>

      <section className="faq-section">
        <div className="faq-eyebrow"><span className="faq-dash"></span>{t('faqEyebrow')}</div>
        <h2 className="faq-headline">{t('faqH')}</h2>
        <div className="faq-list">
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 0 ? null : 0)}>
              <span>{t('faq0Q')}</span>
              <span className={`faq-icon${openFaq === 0 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 0 ? ' open' : ''}`}>
              <p>{t('faq0A')}</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 1 ? null : 1)}>
              <span>{t('faq1Q')}</span>
              <span className={`faq-icon${openFaq === 1 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 1 ? ' open' : ''}`}>
              <p>{t('faq1A')}</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 2 ? null : 2)}>
              <span>{t('faq2Q')}</span>
              <span className={`faq-icon${openFaq === 2 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 2 ? ' open' : ''}`}>
              <p>{t('faq2A')}</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}>
              <span>{t('faq3Q')}</span>
              <span className={`faq-icon${openFaq === 3 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 3 ? ' open' : ''}`}>
              <p>{t('faq3A')}</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 4 ? null : 4)}>
              <span>{t('faq4Q')}</span>
              <span className={`faq-icon${openFaq === 4 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 4 ? ' open' : ''}`}>
              <p>{t('faq4A')}</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 5 ? null : 5)}>
              <span>{t('faq5Q')}</span>
              <span className={`faq-icon${openFaq === 5 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 5 ? ' open' : ''}`}>
              <p>{rich(t('faq5A'), { app: <a href={APP_URL}>app.velfi.xyz</a> })}</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 6 ? null : 6)}>
              <span>{t('faq6Q')}</span>
              <span className={`faq-icon${openFaq === 6 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 6 ? ' open' : ''}`}>
              <p>{rich(t('faq6A'), { docs: <a href="/docs/token/velfi" target="_blank" rel="noreferrer">{t('faq6Docs')}</a> })}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="wl-section" id="get-started">
        <span id="waitlist" aria-hidden="true"></span>
        <div className="wl-inner" style={{ backgroundImage: `url(${waitlistBg})` }}>
          <div className="wl-content">
            <div className="wl-icon">✦</div>
            <h2 className="wl-headline">{t('wlH1')}<br />{t('wlH2')}</h2>
            <p className="wl-sub">{t('wlSub')}</p>
            <div className="wl-form">
              <a href={APP_URL} className="hero-cta wl-open">{t('wlOpen')}</a>
              <div className="wl-extras">
                <span className="wl-ios"> {t('wlIos')}</span>
                <span className="wl-litepaper">{rich(t('wlLitepaper'), { lp: <a href="/litepaper" target="_blank" rel="noreferrer">{t('wlLitepaperLink')}</a> })}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-cols">
          <div className="footer-col">
            <span className="footer-col-title">{t('ftProduct')}</span>
            <a href="#how-it-works">{t('navHow')}</a>
            <a href="#features">{t('navFeatures')}</a>
            <a href={APP_URL}>{t('ftOpenApp')}</a>
            <a href="#security">{t('ftSecurity')}</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">{t('navResources')}</span>
            <a href="/docs" target="_blank" rel="noreferrer">{t('navDocs')} <span className="fa">↗</span></a>
            <a href="/docs/guides/sending-money" target="_blank" rel="noreferrer">{t('navGuides')} <span className="fa">↗</span></a>
            <a href="/litepaper" target="_blank" rel="noreferrer">{t('navLitepaper')} <span className="fa">↗</span></a>
            <a href="/docs/token/velfi" target="_blank" rel="noreferrer">{t('ftToken')} <span className="fa">↗</span></a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">{t('ftLaunching')}</span>
            <a href="https://www.bnbchain.org" target="_blank" rel="noreferrer">BNB Chain <span className="fa">↗</span></a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">{t('ftCompany')}</span>
            <a href="#about">{t('ftAbout')}</a>
            <a href="#privacy">{t('ftPrivacy')}</a>
            <a href="#terms">{t('ftTerms')}</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">{t('ftCopy')}</p>
        </div>

        <img src={otter} alt="" className="footer-otter reveal-otter" />
        <div className="footer-watermark">velfi</div>
      </footer>

    </div>
  )
}

export default App
