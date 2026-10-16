import './index.css'
import logo from './assets/logo.png'
import cardImg from './assets/what-card.webp'
import waitlistBg from './assets/waitlist-bg.webp'
import otter from './assets/otter.webp'
import { useState, useEffect, useRef } from 'react'

// The Velfi web app (sign in with Google, claim a .vel name).
const APP_URL = 'https://app.velfi.xyz'

function App() {
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
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#token">Token</a>
          <div
            className="nav-dropdown-wrap"
            ref={dropdownRef}
            onMouseEnter={openDropdown}
            onMouseLeave={closeDropdown}
          >
            <button className="nav-dropdown-btn">Resources ▾</button>
            <div className={`nav-dropdown${resourcesOpen ? ' open' : ''}`}>
              <a href="/docs" target="_blank" rel="noreferrer">Docs</a>
              <a href="/docs/guides/sending-money" target="_blank" rel="noreferrer">Guides</a>
              <a href="/litepaper" target="_blank" rel="noreferrer">Litepaper</a>
              <a href="/docs/token/velfi" target="_blank" rel="noreferrer">Token</a>
            </div>
          </div>
        </div>
        <a href={APP_URL} className="nav-cta">Open App</a>
        <button className={`nav-burger${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
          <span></span><span></span><span></span>
        </button>
      </nav>

      <div className={`mobile-menu${menuOpen ? ' open' : ''}`}>
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
        <a href="#token" onClick={() => setMenuOpen(false)}>Token</a>
        <a href="/docs" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Docs</a>
        <a href="/docs/guides/sending-money" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Guides</a>
        <a href="/litepaper" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>Litepaper</a>
        <a href={APP_URL} className="mobile-menu-cta" onClick={() => setMenuOpen(false)}>Open App</a>
      </div>

      <section className="hero">
        <div className="hero-content">
          <a href="#token" className="hero-token"><span className="hero-token-dot"></span>$VELFI token coming soon on Solana <span className="hero-token-arrow">→</span></a>
          <h1 className="hero-headline">Tell Your Money<br />What To Do.</h1>
          <p className="hero-body">The AI money agent that lets you perform sophisticated and complex transactions by just texting them into on-chain financial workflows.</p>
          <a href={APP_URL} className="hero-cta">Open the app</a>
        </div>
      </section>

      <section className="what-section" id="how-it-works">
        <div className="what-top">
          <div className="what-left">
            <h2 className="what-headline">What is Velfi?</h2>
            <a href={APP_URL} className="what-explore">Explore now</a>
          </div>
          <p className="what-def">Velfi is an AI money agent that turns plain text into on-chain financial actions — send, split, schedule and swap, all from a single instruction. Streaming is next.</p>
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
          <p className="trust-label">Launching on<br />Solana</p>
          <div className="marquee">
            <div className="marquee-track">
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">Solana</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">USDC</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">USDT</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">Jupiter swaps</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">Google sign-in</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">Gasless payments</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">Solana</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">USDC</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">USDT</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">Jupiter swaps</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">Google sign-in</span></div>
              <div className="marquee-unit"><span className="marquee-dot" aria-hidden="true"></span><span className="marquee-name">Gasless payments</span></div>
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
            <p className="who-text">Scheduled payments you set just by texting, and money sent to an email waits until they sign up. Cancel any schedule anytime.</p>
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
            <p className="how-card-body">No seed phrase, no wallet setup. Sign in with Google and Velfi creates your Solana wallet in seconds.</p>
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
            <span className="sec-label">GOOGLE SIGN-IN</span>
            <h3 className="sec-card-title">Sign in with Google. No seed phrase.</h3>
            <p className="sec-card-body">Your Velfi wallet lives on Solana and you unlock it with Google. Nothing to write down, nothing to lose — switch phones and the same wallet comes back.</p>
          </div>
          <div className="sec-card reveal" style={{ transitionDelay: '200ms' }}>
            <span className="sec-label">NON-CUSTODIAL</span>
            <h3 className="sec-card-title">Velfi never holds your funds.</h3>
            <p className="sec-card-body">Every action runs on your instruction. Velfi builds it and pays the fee, but money only leaves your wallet when you sign, or within a schedule you approved. We never hold your balance.</p>
          </div>
          <div className="sec-card reveal" style={{ transitionDelay: '400ms' }}>
            <span className="sec-label">ON-CHAIN & VERIFIABLE</span>
            <h3 className="sec-card-title">Every payment is provable.</h3>
            <p className="sec-card-body">Every payment settles as a transaction on Solana, so anyone can check it on Solscan. Your history doesn't depend on trusting our servers.</p>
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
            <p className="own-col-body">Velfi builds the workflow, but money only leaves your wallet when you sign, or within a schedule you approved. We never hold your balance.</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '100ms' }}>
            <span className="own-tag">YOUR MEMORY</span>
            <h3 className="own-col-title">Your agent remembers — privately.</h3>
            <p className="own-col-body">Your agent remembers your contacts and money habits so you don't repeat yourself, across sessions and devices. Clear its memory anytime.</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '200ms' }}>
            <span className="own-tag">YOUR KEYS</span>
            <h3 className="own-col-title">No seed phrase to lose.</h3>
            <p className="own-col-body">Sign in with Google and your wallet is ready. Switch phones and the same wallet returns — nothing to write down, nothing to leak.</p>
          </div>
          <div className="own-card reveal" style={{ transitionDelay: '300ms' }}>
            <span className="own-tag">YOUR RULES</span>
            <h3 className="own-col-title">The agent obeys your limits.</h3>
            <p className="own-col-body">Approve a schedule once and Autopilot pays only that person, that amount, on that timetable. Solana caps the total it can ever spend, and you can cancel anytime.</p>
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
            <span className="uc-tag">Stream a salary · soon</span>
            <div className="uc-bubble">Stream $4,000 to alex.vel over 30 days.</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '180ms' }}>
            <span className="uc-tag">Auto-save · soon</span>
            <div className="uc-bubble">Move 10% of every payment I receive into savings.</div>
          </div>
          <div className="uc-card reveal" style={{ transitionDelay: '270ms' }}>
            <span className="uc-tag">Escrow a deal · soon</span>
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
        </div>
      </section>

      <section className="tk-section" id="token">
        <div className="who-eyebrow"><span className="who-dash"></span>THE TOKEN</div>
        <h2 className="tk-headline">Meet $VELFI. <span className="who-accent">The token behind your money agent.</span></h2>
        <div className="tk-grid">
          <div className="tk-facts reveal">
            <p className="tk-intro">$VELFI is Velfi's community token, launching on Solana with a fair launch. Hold it to unlock more of what your agent can do.</p>
            <div className="tk-rows">
              <div className="tk-row"><span>Total supply</span><b>1,000,000,000</b></div>
              <div className="tk-row"><span>Launch</span><b>Fair launch</b></div>
              <div className="tk-row"><span>Network</span><b>Solana</b></div>
            </div>
            <div className="tk-ca">
              <span className="tk-ca-label">Contract address</span>
              <div className="tk-ca-box">
                <span className="tk-ca-value">Coming soon</span>
                <span className="tk-ca-soon">Not live yet</span>
              </div>
              <p className="tk-ca-note">Only trust the address posted here and on <a href="https://x.com/velfi_xyz" target="_blank" rel="noreferrer">@velfi_xyz</a>. Any $VELFI before then is fake.</p>
            </div>
          </div>
          <div className="tk-uses">
            <div className="tk-use reveal">
              <span className="tk-use-tag">Velfi Pro</span>
              <h3 className="tk-use-title">Unlock Pro automations</h3>
              <p className="tk-use-body">Hold $VELFI to unlock team payroll, higher limits and more Autopilot rules.</p>
            </div>
            <div className="tk-use reveal" style={{ transitionDelay: '100ms' }}>
              <span className="tk-use-tag">Lower fees</span>
              <h3 className="tk-use-title">Pay fees for less</h3>
              <p className="tk-use-body">Pay swap and conversion fees in $VELFI at a discount.</p>
            </div>
            <div className="tk-use reveal" style={{ transitionDelay: '200ms' }}>
              <span className="tk-use-tag">.vel names</span>
              <h3 className="tk-use-title">Claim premium names</h3>
              <p className="tk-use-body">Use $VELFI to claim short and reserved .vel names.</p>
            </div>
            <div className="tk-use reveal" style={{ transitionDelay: '300ms' }}>
              <span className="tk-use-tag">Community</span>
              <h3 className="tk-use-title">Vote on what ships</h3>
              <p className="tk-use-body">Holders vote on the next features, tokens and integrations.</p>
            </div>
          </div>
        </div>
        <div className="tk-foot">
          <p className="tk-disclaimer">Utility is planned and rolls out as features launch. $VELFI is a community token: holding it doesn't entitle you to profits, revenue or returns, and nothing here is financial advice.</p>
          <a href="/docs/token/velfi" target="_blank" rel="noreferrer" className="tk-docs">Read the token docs <span className="fa">↗</span></a>
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
              <p>No. Your wallet is yours and Velfi never holds your balance. Every payment needs your signature, or a schedule you approved and can cancel anytime. One exception: money you send to an email that isn't on Velfi yet waits in a holding wallet Velfi manages, for up to 7 days, then lands with them when they sign up or comes back to you.</p>
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
              <p>Velfi is launching on Solana, with near-instant settlement, fees of a fraction of a cent, and stablecoins like USDC built in. More chains may come later, but Solana is our home.</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}>
              <span>Is my money safe?</span>
              <span className={`faq-icon${openFaq === 3 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 3 ? ' open' : ''}`}>
              <p>Velfi is designed so nothing moves without your approval. You sign in with Google (no seed phrase), payments run as programs on Solana, and every transaction is on-chain and verifiable.</p>
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
              <span>How do I start?</span>
              <span className={`faq-icon${openFaq === 5 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 5 ? ' open' : ''}`}>
              <p>Open <a href={APP_URL}>app.velfi.xyz</a>, sign in with Google and claim your .vel name. It runs in your browser, on desktop and phone. A mobile app is coming soon.</p>
            </div>
          </div>
          <div className="faq-item">
            <button className="faq-q" onClick={() => setOpenFaq(openFaq === 6 ? null : 6)}>
              <span>Does Velfi have a token?</span>
              <span className={`faq-icon${openFaq === 6 ? ' open' : ''}`}>+</span>
            </button>
            <div className={`faq-a${openFaq === 6 ? ' open' : ''}`}>
              <p>Yes. $VELFI is launching on Solana with a total supply of 1,000,000,000 and a fair launch. The contract address isn't live yet, so only trust the one posted on velfi.xyz and @velfi_xyz. See the <a href="/docs/token/velfi" target="_blank" rel="noreferrer">token docs</a> for details.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="wl-section" id="get-started">
        <span id="waitlist" aria-hidden="true"></span>
        <div className="wl-inner" style={{ backgroundImage: `url(${waitlistBg})` }}>
          <div className="wl-content">
            <div className="wl-icon">✦</div>
            <h2 className="wl-headline">Tell your money<br />what to do.</h2>
            <p className="wl-sub">Sign in with Google and claim your .vel name before someone else takes it.</p>
            <div className="wl-form">
              <a href={APP_URL} className="hero-cta wl-open">Open Velfi</a>
              <div className="wl-extras">
                <span className="wl-ios"> iOS · Coming soon</span>
                <span className="wl-litepaper">Want the full picture? <a href="/litepaper" target="_blank" rel="noreferrer">Read the litepaper</a>.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-cols">
          <div className="footer-col">
            <span className="footer-col-title">Product</span>
            <a href="#how-it-works">How it works</a>
            <a href="#features">Features</a>
            <a href={APP_URL}>Open the app</a>
            <a href="#security">Security</a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Resources</span>
            <a href="/docs" target="_blank" rel="noreferrer">Docs <span className="fa">↗</span></a>
            <a href="/docs/guides/sending-money" target="_blank" rel="noreferrer">Guides <span className="fa">↗</span></a>
            <a href="/litepaper" target="_blank" rel="noreferrer">Litepaper <span className="fa">↗</span></a>
            <a href="/docs/token/velfi" target="_blank" rel="noreferrer">$VELFI token <span className="fa">↗</span></a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Launching on</span>
            <a href="https://solana.com" target="_blank" rel="noreferrer">Solana <span className="fa">↗</span></a>
          </div>
          <div className="footer-col">
            <span className="footer-col-title">Company</span>
            <a href="#about">About</a>
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms of Service</a>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-copy">© 2026 Velfi. All rights reserved.</p>
        </div>

        <img src={otter} alt="" className="footer-otter reveal-otter" />
        <div className="footer-watermark">velfi</div>
      </footer>

    </div>
  )
}

export default App
