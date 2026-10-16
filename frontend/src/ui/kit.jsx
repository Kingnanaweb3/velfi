// Small visual building blocks for every Velfi screen. No data in here:
// screens fetch, these draw. Styles live in velfi.css.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// The Velfi mark (four bars).
export function Logo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="currentColor" aria-hidden="true">
      <rect x="11.4" y="9" width="3.2" height="18" rx="0.6" />
      <rect x="18.4" y="9" width="3.2" height="22" rx="0.6" />
      <rect x="25.4" y="9" width="3.2" height="18" rx="0.6" />
      <rect x="9" y="18.4" width="22" height="3.2" rx="0.6" />
    </svg>
  )
}

// Screen header: avatar or back button on the left, a small label over the title, buttons on the right.
export function Top({ left, eyebrow, title, right }) {
  return (
    <header className="top">
      {left}
      <div className="top-title">
        {eyebrow && <small>{eyebrow}</small>}
        <b>{title}</b>
      </div>
      {right}
    </header>
  )
}

// ── Money ────────────────────────────────────────────────────────────────
export const fmtUsd = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtAmt = (n) => {
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n ?? '')
  if (v === 0) return '0'
  return Math.abs(v) >= 1 ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : Number(v.toPrecision(3)).toString()
}

// Each digit is a column 0-9 that slides into place. Screen readers get the whole amount once.
export function RollingMoney({ value, hidden = false }) {
  const text = fmtUsd(value)
  if (hidden) return <span aria-label="Balance hidden">••••••</span>
  const [whole, cents = '00'] = text.split('.')
  const roll = (str, cls = '') => str.split('').map((ch, i) => /\d/.test(ch)
    ? <span key={`${cls}${str.length - i}`} className="roll" aria-hidden="true">
        <span className="roll-col" style={{ transform: `translateY(-${Number(ch) * 10}%)` }}>{'0123456789'.split('').map(d => <span key={d}>{d}</span>)}</span>
      </span>
    : <span key={`${cls}s${str.length - i}`} className="roll-sym" aria-hidden="true">{ch}</span>)
  return <span className="rolling" role="text" aria-label={text}>{roll(whole)}<span className="roll-cents">{roll(`.${cents}`, 'c')}</span></span>
}

// The one dark card per screen. A soft light follows the pointer; it tilts a little.
export function Vault({ label, labelExtra, amount, hidden, sub, top, actions, children }) {
  const ref = useRef(null)
  const size = Math.abs(Number(amount) || 0) >= 1_000_000 ? 'xl' : Math.abs(Number(amount) || 0) >= 100_000 ? 'lg' : ''
  const move = (e) => {
    const el = ref.current
    if (!el || reducedMotion() || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${x * 100}%`); el.style.setProperty('--my', `${y * 100}%`)
    el.style.setProperty('--rx', `${(0.5 - y) * 4}deg`); el.style.setProperty('--ry', `${(x - 0.5) * 6}deg`)
  }
  const leave = () => { ref.current?.style.setProperty('--rx', '0deg'); ref.current?.style.setProperty('--ry', '0deg') }
  return (
    <section ref={ref} className={`vault ${size}`} onPointerMove={move} onPointerLeave={leave}>
      <div className="vault-top">
        <span className="vault-label">{label}{labelExtra}</span>
        {top}
      </div>
      {amount !== undefined && <p className="vault-amt">{amount === null ? '—' : <RollingMoney value={amount} hidden={hidden} />}</p>}
      {sub && <p className="vault-sub">{sub}</p>}
      {children}
      {actions && <div className="vault-actions">{actions}</div>}
    </section>
  )
}

// ── Tiles, cards ─────────────────────────────────────────────────────────
export function Tile({ tone = 'lav', icon, value, unit, label, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={`tile tile-${tone}`} onClick={onClick}>
      {icon && <span className="tile-icon" aria-hidden="true">{icon}</span>}
      <b key={String(value)} className="swap">{value}{unit && <small>{unit}</small>}</b>
      <span className="tile-label">{label}</span>
    </Tag>
  )
}

export function NextCard({ tone = 'sky', eyebrow, title, chips = [], action, art }) {
  return (
    <section className={`next next-${tone}`}>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h3>{title}</h3>
      {chips.length > 0 && <div className="chips-row">{chips.map((c, i) => <span key={i} className="chip-mono">{c}</span>)}</div>}
      {action && <button className="round-btn" aria-label={action.label} onClick={action.onClick}>{action.icon}</button>}
      {art && <div className="next-art" aria-hidden="true">{art}</div>}
    </section>
  )
}

export function Panel({ children, className = '', ...rest }) {
  return <section className={`panel ${className}`} {...rest}>{children}</section>
}

export function SectionTitle({ title, sub, action }) {
  return (
    <div className="section-title">
      <div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
      {action}
    </div>
  )
}

// One list row. Pass `onClick` or `href` to make it tappable.
export function Row({ icon, tone = '', title, sub, end, endSub, endTone = '', chevron, onClick, href, className = '' }) {
  const inner = (
    <>
      {icon !== undefined && <span className={`dot ${tone}`} aria-hidden="true">{icon}</span>}
      <span className="grow"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {(end !== undefined || endSub) && <span className="end">{end !== undefined && <b className={endTone}>{end}</b>}{endSub && <small>{endSub}</small>}</span>}
      {chevron && <span className="chev" aria-hidden="true">{chevron}</span>}
    </>
  )
  if (href) return <a className={`row ${className}`} href={href} target="_blank" rel="noreferrer">{inner}</a>
  if (onClick) return <button className={`row ${className}`} onClick={onClick}>{inner}</button>
  return <div className={`row ${className}`}>{inner}</div>
}

export function Empty({ title, children }) {
  return <div className="empty"><b>{title}</b>{children && <p>{children}</p>}</div>
}

// ── Controls ─────────────────────────────────────────────────────────────
export function Seg({ label, options, value, onChange }) {
  const index = Math.max(0, options.findIndex(o => o.id === value))
  return (
    <div className="seg" role="tablist" aria-label={label} style={{ '--n': options.length, '--i': index }}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map(o => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? 'on' : ''} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  )
}

export function SegBar({ used, cap }) {
  const ratio = cap > 0 ? Math.max(0, Math.min(1, used / cap)) : 0
  const lit = Math.round(ratio * 12)
  return (
    <div className="segbar" role="progressbar" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={used}>
      {Array.from({ length: 12 }, (_, i) => <i key={i} className={i < lit ? 'on' : ''} style={{ animationDelay: `${i * 0.03}s` }} />)}
      {cap > 0 && ratio < 1 && <em style={{ left: `${ratio * 100}%` }} />}
    </div>
  )
}

export function Pill({ tone = '', children }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

// ── Sheet ────────────────────────────────────────────────────────────────
// A dialog that slides up on phones and sits in the middle on desktop.
export function Sheet({ open, onClose, label, title, pale = false, children, dismissable = true }) {
  const cardRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) closeRef.current?.() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    setTimeout(() => cardRef.current?.focus(), 30)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [open, dismissable])
  if (!open) return null
  return (
    <div className="sheet" onClick={() => dismissable && onClose?.()}>
      <div ref={cardRef} tabIndex={-1} className={`sheet-card ${pale ? 'pale' : ''}`} role="dialog" aria-modal="true" aria-label={label || title} onClick={e => e.stopPropagation()}>
        <span className="grab" aria-hidden="true" />
        {title && (
          <div className="sheet-head">
            <span />
            <h2>{title}</h2>
            <button className="done" onClick={onClose}>Done</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function CloseButton({ onClick, label = 'Close' }) {
  return <button className="circle-btn" aria-label={label} onClick={onClick}><X size={20} strokeWidth={1.9} /></button>
}

// ── Toasts ───────────────────────────────────────────────────────────────
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [list, setList] = useState([])
  const toast = useCallback((t) => {
    const item = typeof t === 'string' ? { text: t } : t
    const id = Math.random().toString(36).slice(2)
    setList(l => [...l.slice(-2), { id, ...item }])
    setTimeout(() => setList(l => l.filter(x => x.id !== id)), item.ms || 6200)
  }, [])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map(t => (
          <div key={t.id} className={`toast ${t.tone || ''}`}>
            <span>{t.text}</span>
            {t.href && <a href={t.href} target="_blank" rel="noreferrer">{t.linkText || 'View'}</a>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// ── Copy ─────────────────────────────────────────────────────────────────
export function useCopy() {
  const [copied, setCopied] = useState('')
  const copy = useCallback(async (text, key = 'x') => {
    try { await navigator.clipboard.writeText(text) } catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') } catch {} ; ta.remove()
    }
    setCopied(key); setTimeout(() => setCopied(''), 1600)
  }, [])
  return { copied, copy }
}

export function Skeleton({ h = 20, w = '100%', r = 18, style }) {
  return <div className="sk" style={{ height: h, width: w, borderRadius: r, ...style }} aria-hidden="true" />
}
