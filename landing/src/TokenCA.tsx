import { useTokenConfig, useCopy } from './tokenConfig'
import { useLang, rich } from './i18n'

// The live $VELFI contract address in the token section. The server only hands
// out an address after checking on-chain that it is a real token called VELFI;
// anything else shows UNVERIFIED. Shares one poller with the hero pill.
export default function TokenCA() {
  const cfg = useTokenConfig()
  const { copied, copy: copyText } = useCopy()
  const { t } = useLang()
  const copy = () => { if (cfg.status === 'live') copyText(cfg.address) }

  return (
    <div className="tk-ca">
      <span className="tk-ca-label">{t('caLabel')}{cfg.status === 'live' && cfg.test ? <span className="tk-ca-test">{t('tokenTestTag')}</span> : null}</span>
      {cfg.status === 'live' ? (
        <>
          <div className={cfg.test ? 'tk-ca-box tk-ca-box-live tk-ca-box-test' : 'tk-ca-box tk-ca-box-live'}>
            <span className="tk-ca-value tk-ca-addr">{cfg.address}</span>
            <button type="button" className="tk-ca-copy" onClick={copy} aria-label={t('copyCa')}>{copied ? t('copied') : t('caCopy')}</button>
          </div>
          <div className="tk-ca-links">
            <a href={`https://bscscan.com/token/${cfg.address}`} target="_blank" rel="noreferrer">{t('caScan')}</a>
            {!cfg.test && <a href={`https://pancakeswap.finance/swap?chain=bsc&outputCurrency=${cfg.address}`} target="_blank" rel="noreferrer">{t('caBuy')}</a>}
          </div>
        </>
      ) : (
        <div className="tk-ca-box">
          <span className="tk-ca-value">{cfg.status === 'unverified' ? t('caUnverifiedAddr') : t('caSoon')}</span>
          <span className={cfg.status === 'unverified' ? 'tk-ca-soon tk-ca-bad' : 'tk-ca-soon'}>{cfg.status === 'unverified' ? t('caUnverified') : t('caPending')}</span>
        </div>
      )}
      <p className="tk-ca-note">
        {rich(
          t(cfg.status === 'live' ? (cfg.test ? 'caNoteTest' : 'caNoteLive') : cfg.status === 'unverified' ? 'caNoteUnverified' : 'caNotePending'),
          { x: <a href="https://x.com/velfixyz" target="_blank" rel="noreferrer">@velfixyz</a> },
        )}
      </p>
    </div>
  )
}
