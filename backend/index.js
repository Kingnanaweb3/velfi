// Load .env before any other module reads process.env (imports run first).
import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import accountRouter from './routes/account.js'
import streamsRouter from './routes/streams.js'
import scheduleRouter from './routes/schedule.js'
import agentRouter from './routes/agent.js'
import txRouter from './routes/tx.js'
import { startScheduleRunner } from './lib/schedule.js'
import { startInviteRunner } from './lib/invites.js'
import { CLUSTER, MODE, CHAIN_ID, feePayer, feePayerWei, checkTokens } from './lib/bnb.js'
import { TOKEN_LIST } from './lib/tokens.js'
import { startupProblems } from './lib/config.js'

const app = express()
const PORT = process.env.PORT || 3001

// Only the Velfi app may call this API from a browser. APP_ORIGINS is a comma list,
// e.g. https://app.velfi.xyz,https://velfi.xyz
const ORIGINS = String(process.env.APP_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
app.use(cors(ORIGINS.length ? { origin: ORIGINS } : {}))
app.disable('x-powered-by')
app.use(express.json({ limit: '200kb' }))

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'Vel.fi Backend', 
    version: '1.0.0',
    chain: 'bnb',
    network: CLUSTER,
    chainId: CHAIN_ID,
    mode: MODE,
    routes: ['/auth', '/users', '/account', '/streams', '/schedule', '/agent', '/tx']
  })
})

// For uptime monitors: fails (503) when the gas wallet is running low.
app.get('/health', async (req, res) => {
  try {
    const bnb = Number(await feePayerWei()) / 1e18
    const min = Number(process.env.MIN_GAS_WALLET_BNB || 0.02)
    res.status(bnb >= min ? 200 : 503).json({ ok: bnb >= min, chain: 'bnb', network: CLUSTER, mode: MODE, gasWallet: feePayer().address, gasWalletBnb: bnb, minBnb: min })
  } catch (e) {
    res.status(503).json({ ok: false, chain: 'bnb', network: CLUSTER, mode: MODE, error: 'cannot reach the BNB Chain RPC' })
  }
})

app.use('/auth', authRouter)
app.use('/users', usersRouter)
app.use('/account', accountRouter)
app.use('/streams', streamsRouter)
app.use('/schedule', scheduleRouter)
app.use('/agent', agentRouter)
app.use('/tx', txRouter)

const problems = startupProblems(process.env)
if (problems.fatal.length) {
  console.error('Velfi will not start:\n - ' + problems.fatal.join('\n - '))
  process.exit(1)
}
for (const w of problems.warn) console.warn('⚠️ ', w)

// A wrong token address is a wrong token: check decimals on the chain first.
const tokenProblems = await checkTokens(TOKEN_LIST).catch(e => [`could not check tokens: ${e.message}`])
if (tokenProblems.length) {
  if (process.env.BNB_NETWORK === 'mainnet') { console.error('Velfi will not start:\n - ' + tokenProblems.join('\n - ')); process.exit(1) }
  for (const w of tokenProblems) console.warn('⚠️ ', w)
}

app.listen(PORT, () => {
  let gas = 'not set'
  try { gas = feePayer().address } catch {}
  console.log(`Chain: BNB ${CLUSTER} (chain id ${CHAIN_ID}), gas wallet ${gas}`)
  startScheduleRunner()
  startInviteRunner()
  console.log(`Vel.fi backend running on port ${PORT}`)
})
