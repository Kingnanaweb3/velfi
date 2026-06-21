import './index.css'
import logo from './assets/logo.png'
import cardImg from './assets/what-card.png'
import logoSui from './assets/logo-sui.png'
import logoWalrus from './assets/logo-walrus.png'
import logoMysten from './assets/logo-mysten.png'
import waitlistBg from './assets/waitlist-bg.png'
import otter from './assets/otter.png'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || '',
  import.meta.env.VITE_SUPABASE_ANON_KEY || ''
)
import { useState, useEffect, useRef } from 'react'

function App() {
  const [scrolled, setScrolled] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [joined, setJoined] = useState(false)
  const [formError, setFormError] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [claimedCount, setClaimedCount] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    async function loadCount() {
      const { data: count } = await supabase.rpc('signup_count')
      if (!cancelled && typeof count === 'number') setClaimedCount(count)
    }
    loadCount()
    const id = setInterval(loadCount, 15000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const [refCount, setRefCount] = useState<number>(0)
  const [myCode, setMyCode] = useState('')

  function getRefParam() {
    const p = new URLSearchParams(window.location.search)
    return (p.get('ref') || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  }

  async function handleWaitlist() {
    setFormError('')
    if (!username || username.length < 3) { setFormError('Pick a username (3+ characters)'); return }
    if (!email || !email.includes('@')) { setFormError('Enter a valid email'); return }
    setSubmitting(true)
    try {
      const referredBy = getRefParam()
      const code = username.trim()
      const { error } = await supabase.from('waitlist').insert({
        email: email.trim(),
        username: code,
        referral_code: code,
        referred_by: referredBy && referredBy !== code ? referredBy : null,
      })
      if (error) {
        if (error.code === '23505') {
          if (error.message.includes('username')) setFormError('That username is taken')
          else setFormError('You are already on the list')
        } else { setFormError('Something went wrong. Try again.') }
      } else {
        setMyCode(code)
        const { count } = await supabase
          .from('waitlist')
          .select('*', { count: 'exact', head: true })
          .eq('referred_by', code)
        setRefCount(count || 0)
        setJoined(true)
      }
    } catch {
      setFormError('Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const refLink = myCode ? `https://velfi.xyz/waitlist?ref=${myCode}` : ''

  const [copied, setCopied] = useState(false)
  function copyRefLink() {
    if (!refLink) return
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1800) }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(refLink).then(done).catch(() => fallbackCopy())
    } else {
      fallbackCopy()
    }
    function fallbackCopy() {
      const ta = document.createElement('textarea')
      ta.value = refLink
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus(); ta.select()
      try { document.execCommand('copy'); done() } catch {}
      document.body.removeChild(ta)
    }
  }

  const shareText = encodeURIComponent('I just claimed my .vel name on Velfi — tell your money what to do. Join the waitlist:')
  const shareUrl = refLink ? `https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(refLink)}` : '#'
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
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <div
            className="nav-dropdown-wrap"
            ref={dropdownRef}
            onMouseEnter={openDropdown}
            onMouseLeave={closeDropdown}
          >
            <button className="nav-dropdown-btn">Resources ▾</button>
            <div className={`nav-dropdown${resourcesOpen ? ' open' : ''}`}>
              <a href="https://kinnahjoshua67s-organization.gitbook.io/velfi" target="_blank" rel="noreferrer">Docs</a>
              <a href="https://kinnahjoshua67s-organization.gitbook.io/velfi/guides/sending-money" target="_blank" rel="noreferrer">Guides</a>
              <a href="/litepaper" target="_blank" rel="noreferrer">Litepaper</a>
            </div>
          </div>
        </div>
        <a href="#waitlist" className="nav-cta">Join Waitlist</a>
        <button className={`nav-burger${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </nav>

      <div className={`mobile-menu${menuOpen ? ' open' : ''}`}>
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="https://kinnahjoshua67s-organization.gitbook.io/velfi" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Docs</a>
        <a href="https://kinnahjoshua67s-organization.gitbook.io/velfi/guides/sending-money" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Guides</a>
        <a href="/litepaper" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Litepaper</a>
        <a href="#waitlist" className="mobile-menu-cta" onClick={() => setMenuOpen(false)}>Join Waitlist</a>
      </div>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-icon">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2V24M2 13H24" stroke="#2a1a3a" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="hero-headline">Tell Your Money<br />What To Do.</h1>
          <p className="hero-body">The AI money agent that lets you perform sophisticated and complex transactions by just texting them into on-chain financial workflows.</p>
          <a href="https://app.velfi.xyz/demo" className="hero-cta">Test Demo</a>
        </div>
      </section>

      <section className="what-section" id="how-it-works">
        <div className="what-top">
          <div className="what-left">
            <h2 className="what-headline">What is Velfi?</h2>
            <a href="#waitlist" className="what-explore">Explore now</a>
          </div>
          <p className="what-def">Velfi is an AI money agent that turns plain text into on-chain financial actions — send, stream, split, schedule, and invest, all from a single instruction.</p>
        </div>

        <div className="what-cards">
          <div className="wcard wcard-light reveal" style={{ transitionDelay: '0ms' }}>
            <div className="wcard-img-wrap">
              <img src={cardImg} alt="" className="wcard-img" />
              <div className="wcard-overlay">
                <h3 className="wcard-title-ov">Just say it</h3>
                <p className="wcard-body-ov">Tell Velfi what you want in plain English. It builds and runs the on-chain workflow for you.</p>
              </div>
            </div>
          </div>
          <div className="wcard wcard-dark reveal" style={{ transitionDelay: '120ms' }}>
            <h3 className="wcard-title">Runs on its own</h3>
            <p className="wcard-body">Set it once and Velfi executes forever — recurring pays, splits, and savings without you lifting a finger.</p>
          </div>
          <div className="wcard wcard-dark reveal" style={{ transitionDelay: '240ms' }}>
            <h3 className="wcard-title">You stay in control</h3>
            <p className="wcard-body">Non-custodial by design. Velfi acts on your instructions, but only you hold the keys.</p>
          </div>
        </div>

        <div className="trust-strip">
          <p className="trust-label">Built on trusted<br />infrastructure</p>
          <div className="marquee">
            <div className="marquee-track">
              <div className="marquee-unit"><img src={logoSui} alt="" className="marquee-logo" /><span className="marquee-name">Sui</span></div>
              <div className="marquee-unit"><img src={logoWalrus} alt="" className="marquee-logo" /><span className="marquee-name">Walrus</span></div>
              <div className="marquee-unit"><img src={logoMysten} alt="" className="marquee-logo" /><span className="marquee-name">Mysten Labs</span></div>
              <div className="marquee-unit"><img src={logoSui} alt="" className="marquee-logo" /><span className="marquee-name">Sui</span></div>
              <div className="marquee-unit"><img src={logoWalrus} alt="" className="marquee-logo" /><span className="marquee-name">Walrus</span></div>
              <div className="marquee-unit"><img src={logoMysten} alt="" className="marquee-logo" /><span className="marquee-name">Mysten Labs</span></div>
              <div className="marquee-unit"><img src={logoSui} alt="" className="marquee-logo" /><span className="marquee-name">Sui</span></div>
              <div className="marquee-unit"><img src={logoWalrus} alt="" className="marquee-logo" /><span className="marquee-name">Walrus</span></div>
              <div className="marquee-unit"><img src={logoMysten} alt="" className="marquee-logo" /><span className="marquee-name">Mysten Labs</span></div>
              <div className="marquee-unit"><img src={logoSui} alt="" className="marquee-logo" /><span className="marquee-name">Sui</span></div>
              <div className="marquee-unit"><img src={logoWalrus} alt="" className="marquee-logo" /><span className="marquee-name">Walrus</span></div>
              <div className="marquee-unit"><img src={logoMysten} alt="" className="marquee-logo" /><span className="marquee-name">Mysten Labs</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="who-section" id="features">
        <div className="who-eyebrow"><span className="who-dash"></span>WHO IT'S FOR</div>
        <h2 className="who-headline">Made for people who transact frequently <span className="who-accent">on-chain.</span></h2>
        <div className="who-cols">
          <div className="who-col reveal">
            <p className="who-text">From an instant one-tap send to splitting a payment across many addresses, each with its own flexible allocation and percentage share — all from one instruction.</p>
          </div>
          <div className="who-col reveal" style={{ transitionDelay: '120ms' }}>
            <p className="who-text">For anyone running repeat payments: salaries, subscriptions, and deals that pay out continuously. Configure it once and Velfi keeps it running.</p>
          </div>
          <div className="who-col reveal" style={{ transitionDelay: '240ms' }}>
            <p className="who-text">Time-based, trigger-activated, and conditional payments you set just by texting. Escrow is built in, and you can cancel any payment flow anytime.</p>
          </div>
        </div>
      </section>

      <section className="how-section">
        <div className="how-eyebrow"><span className="how-dash"></span>HOW TO USE IT</div>
        <h2 className="how-headline">Four steps from sign-in <span className="how-accent">to autopilot.</span></h2>
        <div className="how-cards">
          <div className="how-card reveal">
            <span className="how-num">01</span>
            <h3 className="how-card-title">Sign in with Google</h3>
            <p className="how-card-body">No seed phrase, no wallet setup. zkLogin derives your wallet from your Google account in seconds.</p>
          </div>
          <div className="how-card reveal" style={{ transitionDelay: '150ms' }}>
            <span className="how-num">02</span>
            <h3 className="how-card-title">Claim your .vel name</h3>
            <p className="how-card-body">Pick a username like almond.vel. It replaces long wallet addresses for you and everyone who pays you.</p>
          </div>
          <div className="how-card reveal" style={{ transitionDelay: '300ms' }}>
            <span className="how-num">03</span>
            <h3 className="how-card-title">Tell Velfi what you want</h3>
            <p className="how-card-body">Type it in plain English — "split rent three ways", "pay my designer every Friday". Velfi builds the workflow.</p>
          </div>
          <div className="how-card reveal" style={{ transitionDelay: '450ms' }}>
            <span className="how-num">04</span>
            <h3 className="how-card-title">Confirm once, run forever</h3>
            <p className="how-card-body">Approve with a single tap. Velfi executes and keeps recurring flows running automatically.</p>
          </div>
        </div>
        <div className="how-swipe-hint">
          <svg width="34" height="20" viewBox="0 0 34 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 13c6 4 14 4 20-1 3-2.5 5-6 4-9-0.6-1.8-2.6-2-3.4-0.3-0.9 2 0.2 4.7 2.4 6.2 2.4 1.6 5.6 1.7 8.4 0.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M28 16l5-2-2-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Swipe to see more</span>
        </div>
      </section>

      <section className="sec-section">
        <div className="sec-eyebrow"><span className="who-dash"></span>SECURITY</div>
        <h2 className="sec-headline">No seed phrases. <span className="who-accent">Only you hold the keys.</span></h2>
        <div className="sec-cards">
          <div className="sec-card reveal">
            <span className="sec-label">ZKLOGIN</span>
            <h3 className="sec-card-title">Sign in with Google. No seed phrase.</h3>
            <p className="sec-card-body">Your wallet is derived from your Google account through a zero-knowledge proof. Nothing to write down, nothing to lose — switch phones and the same wallet comes back.</p>
          </div>
          <div className="sec-card reveal" style={{ transitionDelay: '200ms' }}>
            <span className="sec-label">NON-CUSTODIAL</span>
            <h3 className="sec-card-title">Velfi never holds your funds.</h3>
            <p className="sec-card-body">Every action runs on your instruction and is signed by you. Velfi builds the workflow, but only your keys can move money — we never take custody.</p>
          </div>
          <div className="sec-card reveal" style={{ transitionDelay: '400ms' }}>
            <span className="sec-label">ON-CHAIN & VERIFIABLE</span>
            <h3 className="sec-card-title">Every payment is provable.</h3>
            <p className="sec-card-body">Flows execute as Move contracts on Sui with sub-second finality. Receipts are stored on Walrus, so every transaction is transparent and verifiable.</p>
          </div>
        </div>
      </section>

      <section className="own-section">
        <div className="own-eyebrow"><span className="own-dash"></span>OWNERSHIP</div>
        <h2 className="own-headline">You own your money. <span className="own-accent">And your memory.</span></h2>
        <div className="own-cards">
          <div className="own-card reveal">
            <span className="own-tag">YOUR MONEY</span>
            <h3 className="own-col-title">Non-custodial by design.</h3>
            <p className="own-col-body">Every action is signed by you. Velfi builds the workflow, but only your keys can move money — we never take custody.</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '100ms' }}>
            <span className="own-tag">YOUR MEMORY</span>
            <h3 className="own-col-title">Your agent remembers — privately.</h3>
            <p className="own-col-body">Your agent's context lives encrypted on Walrus, owned by you alone. It learns your money habits and carries them across sessions and devices — revoke anytime.</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '200ms' }}>
            <span className="own-tag">YOUR KEYS</span>
            <h3 className="own-col-title">No seed phrase to lose.</h3>
            <p className="own-col-body">zkLogin derives your wallet from your Google sign-in. Switch phones and the same wallet returns — nothing to write down, nothing to leak.</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '300ms' }}>
            <span className="own-tag">YOUR RULES</span>
            <h3 className="own-col-title">The agent obeys your limits.</h3>
            <p className="own-col-body">Set a policy once and Autopilot executes within it — bounded by on-chain guardrails it can never override. You stay in control.</p>
          </div>
        </div>
        <div className="own-swipe-hint">
          <svg width="34" height="20" viewBox="0 0 34 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 13c6 4 14 4 20-1 3-2.5 5-6 4-9-0.6-1.8-2.6-2-3.4-0.3-0.9 2 0.2 4.7 2.4 6.2 2.4 1.6 5.6 1.7 8.4 0.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M28 16l5-2-2-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Swipe to see more</span>
        </div>
      </section>

      <section className="uc-section">
        <div className="uc-eyebrow"><span className="how-dash"></span>WHAT YOU CAN BUILD</div>
        <h2 className="uc-headline">One text. <span className="how-accent">Any money flow.</span></h2>
        <div className="uc-grid">
          <div className="uc-card reveal">
            <span className="uc-tag">Send to anyone</span>
            <div className="uc-bubble">Send $50 to jordan@gmail.com — they claim it when they sign up.</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '90ms' }}>
            <span className="uc-tag">Stream a salary</span>
            <div className="uc-bubble">Stream $4,000 to alex.vel over 30 days.</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '180ms' }}>
            <span className="uc-tag">Auto-save</span>
            <div className="uc-bubble">Move 10% of every payment I receive into savings.</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '270ms' }}>
            <span className="uc-tag">Escrow a deal</span>
            <div className="uc-bubble">Hold $2,000 until the work is delivered, then release.</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '360ms' }}>
            <span className="uc-tag">Split a bill</span>
            <div className="uc-bubble">Split this 40/30/30 between three .vel names.</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '450ms' }}>
            <span className="uc-tag">Schedule a payment</span>
            <div className="uc-bubble">Send rent to landlord.vel every Friday.</div>
          </div>
        </div>
        <div className="uc-footer-row">
          <div className="how-swipe-hint uc-swipe-hint">
            <svg width="34" height="20" viewBox="0 0 34 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 13c6 4 14 4 20-1 3-2.5 5-6 4-9-0.6-1.8-2.6-2-3.4-0.3-0.9 2 0.2 4.7 2.4 6.2 2.4 1.6 5.6 1.7 8.4 0.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              <path d="M28 16l5-2-2-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span>Swipe to see more</span>
          </div>
          <div className="uc-claimed">
            <span className="uc-claimed-num">{claimedCount.toLocaleString()}</span> .vel names claimed
          </div>
        </div>
      </section>

      <section className="faq-section">
        <div className="faq-eyebrow"><span className="faq-dash"></span>FAQ</div>
        <h2 className="faq-headline">Questions, answered.</h2>
        <div className="faq-list">
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 0 ? null : 0)}>
              <span>Is Velfi custodial?</span>
              <span className={`faq-icon${openFaq === 0 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 0 ? ' open' : ''}`}>
              <p>No. Velfi is non-custodial by design. Every action is signed by you and only your keys can move money — we never take custody of your funds.</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 1 ? null : 1)}>
              <span>What does a .vel name cost?</span>
              <span className={`faq-icon${openFaq === 1 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 1 ? ' open' : ''}`}>
              <p>Your .vel username is free to claim during early access. It replaces long wallet addresses for you and anyone who pays you.</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 2 ? null : 2)}>
              <span>Which chains does Velfi support?</span>
              <span className={`faq-icon${openFaq === 2 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 2 ? ' open' : ''}`}>
              <p>Velfi is built on Sui, with sub-second finality and near-zero fees. More chains may come later, but Sui is the foundation today.</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}>
              <span>Is my money safe?</span>
              <span className={`faq-icon${openFaq === 3 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 3 ? ' open' : ''}`}>
              <p>Yes. Flows run as Move smart contracts on Sui, you sign in with zkLogin (no seed phrase), and every transaction is on-chain and verifiable.</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 4 ? null : 4)}>
              <span>Do I need crypto experience?</span>
              <span className={`faq-icon${openFaq === 4 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 4 ? ' open' : ''}`}>
              <p>Not at all. You sign in with Google, claim a username, and tell Velfi what you want in plain English. No wallets or seed phrases to manage.</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 5 ? null : 5)}>
              <span>When does Velfi launch?</span>
              <span className={`faq-icon${openFaq === 5 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 5 ? ' open' : ''}`}>
              <p>You can join the waitlist now and claim your name. The app is coming to the App Store soon — waitlist members get early access first.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="wl-section" id="waitlist">
        <div className="wl-inner" style={{ backgroundImage: `url(${waitlistBg})` }}>
          <div className="wl-content">
            <div className="wl-icon">✦</div>
            <h2 className="wl-headline">Tell your money<br />what to do.</h2>
            <p className="wl-sub">Claim your .vel name and join the waitlist before someone else takes it.</p>
            <div className="wl-count" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(20,12,30,0.5)', border: '1px solid rgba(180,168,208,0.35)', backdropFilter: 'blur(4px)', borderRadius: '30px', padding: '8px 16px', margin: '6px 0 26px', fontSize: '14px', fontWeight: 600, color: '#e1dcfa' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#7b4fff', display: 'inline-block', boxShadow: '0 0 8px #7b4fff' }}></span>
              {claimedCount.toLocaleString()} .vel {claimedCount === 1 ? 'name' : 'names'} claimed
            </div>
            {joined ? (
              <div className="wl-success">
                <div className="wl-success-top">You're on the list ✦</div>
                <p className="wl-success-sub">Share your link — the more friends who join with it, the higher you move up.</p>
                <div className="wl-ref-box">
                  <span className="wl-ref-link">{refLink}</span>
                  <button className="wl-ref-copy" onClick={copyRefLink}>{copied ? 'Copied✓' : 'Copy'}</button>
                </div>
                <div className="wl-ref-actions">
                  <a className="wl-ref-share" href={shareUrl} target="_blank" rel="noreferrer">Share on X</a>
                  <span className="wl-ref-count">{refCount} referred so far</span>
                </div>
              </div>
            ) : (
              <div className="wl-form">
                <div className="wl-username">
                  <input
                    type="text"
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                    className="wl-input wl-input-name"
                  />
                  <span className="wl-suffix">.vel</span>
                </div>
                <div className="wl-email-row">
                  <input
                    type="email"
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="wl-input wl-input-email"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleWaitlist() }}
                  />
                  <button className="wl-submit" onClick={handleWaitlist} disabled={submitting}>
                    {submitting ? 'Joining…' : 'Join Waitlist'}
                  </button>
                </div>
                {formError && <p className="wl-error">{formError}</p>}
                <div className="wl-extras">
                  <span className="wl-ios"> iOS · Coming soon</span>
                  <span className="wl-litepaper">Want the full picture? <a href="/litepaper" target="_blank" rel="noreferrer">Read the litepaper</a>.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-cols">
          <div className="footer-col">
            <span className="footer-col-title">Product</span>
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href="#waitlist">Join waitlist</a>
            <a href="#security">Security</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Resources</span>
            <a href="https://kinnahjoshua67s-organization.gitbook.io/velfi" target="_blank" rel="noreferrer">Docs <span className="fa">↗</span></a>
            <a href="https://kinnahjoshua67s-organization.gitbook.io/velfi/guides/sending-money" target="_blank" rel="noreferrer">Guides <span className="fa">↗</span></a>
            <a href="/litepaper" target="_blank" rel="noreferrer">Litepaper <span className="fa">↗</span></a>
            <a href="https://github.com/Kingnanaweb3/velfi" target="_blank" rel="noreferrer">GitHub <span className="fa">↗</span></a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Built on</span>
            <a href="https://sui.io" target="_blank" rel="noreferrer">Sui <span className="fa">↗</span></a>
            <a href="https://walrus.xyz" target="_blank" rel="noreferrer">Walrus <span className="fa">↗</span></a>
            <a href="https://mystenlabs.com" target="_blank" rel="noreferrer">Mysten Labs <span className="fa">↗</span></a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Company</span>
            <a href="#about">About</a>
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms of Service</a>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="footer-socials">
            <a href="https://x.com/velfi_xyz" target="_blank" rel="noreferrer" aria-label="X">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://github.com/Kingnanaweb3/velfi" target="_blank" rel="noreferrer" aria-label="GitHub">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.5 11.5 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.598 24 12.297c0-6.627-5.373-12-12-12"/></svg>
            </a>
          </div>
          <p className="footer-copy">© 2026 Velfi. All rights reserved.</p>
        </div>

        <img src={otter} alt="" className="footer-otter reveal-otter" />
        <div className="footer-watermark">velfi</div>
      </footer>

    </div>
  )
}

export default App
