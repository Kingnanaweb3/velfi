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
import { CLUSTER, MODE, feePayer, feePayerLamports } from './lib/solana.js'
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
    chain: CLUSTER,
    mode: MODE,
    routes: ['/auth', '/users', '/account', '/streams', '/schedule', '/agent', '/tx']
  })
})

// For uptime monitors: fails (503) when the fee payer is running low.
app.get('/health', async (req, res) => {
  try {
    const sol = (await feePayerLamports()) / 1e9
    const min = Number(process.env.MIN_FEE_PAYER_SOL || 0.05)
    res.status(sol >= min ? 200 : 503).json({ ok: sol >= min, cluster: CLUSTER, mode: MODE, feePayer: feePayer().publicKey.toBase58(), feePayerSol: sol, minSol: min })
  } catch (e) {
    res.status(503).json({ ok: false, cluster: CLUSTER, mode: MODE, error: 'cannot reach Solana RPC' })
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

app.listen(PORT, () => {
  startScheduleRunner()
  startInviteRunner()
  console.log(`Vel.fi backend running on port ${PORT}`)
})
