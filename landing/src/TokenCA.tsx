import { useTokenConfig, useCopy } from './tokenConfig'

// The live $VELFI contract address in the token section. The server only hands
// out an address after checking on-chain that it is a real token called VELFI;
// anything else shows UNVERIFIED. Shares one poller with the hero pill.
export default function TokenCA() {
  const cfg = useTokenConfig()
  const { copied, copy: copyText } = useCopy()
  const copy = () => { if (cfg.status === 'live') copyText(cfg.address) }

  return (
    <div className="tk-ca">
      <span className="tk-ca-label">Contract address{cfg.status === 'live' && cfg.test ? <span className="tk-ca-test">Test · not $VELFI</span> : null}</span>
      {cfg.status === 'live' ? (
        <>
          <div className={cfg.test ? 'tk-ca-box tk-ca-box-live tk-ca-box-test' : 'tk-ca-box tk-ca-box-live'}>
            <span className="tk-ca-value tk-ca-addr">{cfg.address}</span>
            <button type="button" className="tk-ca-copy" onClick={copy} aria-label="Copy contract address">{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="tk-ca-links">
            <a href={`https://bscscan.com/token/${cfg.address}`} target="_blank" rel="noreferrer">View on BscScan</a>
            {!cfg.test && <a href={`https://pancakeswap.finance/swap?chain=bsc&outputCurrency=${cfg.address}`} target="_blank" rel="noreferrer">Buy on PancakeSwap</a>}
          </div>
        </>
      ) : (
        <div className="tk-ca-box">
          <span className="tk-ca-value">{cfg.status === 'unverified' ? 'Unverified address' : 'Coming soon'}</span>
          <span className={cfg.status === 'unverified' ? 'tk-ca-soon tk-ca-bad' : 'tk-ca-soon'}>{cfg.status === 'unverified' ? 'Unverified' : 'Pending'}</span>
        </div>
      )}
      <p className="tk-ca-note">
        {cfg.status === 'live' && cfg.test
          ? 'This is a test of the address box using USDT. It is not $VELFI and $VELFI is not live yet. Watch '
          : cfg.status === 'unverified'
          ? 'The address set here did not check out on-chain as $VELFI, so it is hidden. Do not buy anything until it shows here and on '
          : 'Only trust the address posted here and on '}
        <a href="https://x.com/velfixyz" target="_blank" rel="noreferrer">@velfixyz</a>{cfg.status === 'live' && cfg.test ? ' for the real launch.' : '.'}{cfg.status === 'live' ? '' : ' Any $VELFI before then is fake.'}
      </p>
    </div>
  )
}
