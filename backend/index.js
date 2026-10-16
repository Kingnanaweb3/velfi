import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
dotenv.config()

import authRouter from './routes/auth.js'
import usersRouter from './routes/users.js'
import accountRouter from './routes/account.js'
import paymentsRouter from './routes/payments.js'
import streamsRouter from './routes/streams.js'
import scheduleRouter from './routes/schedule.js'
import agentRouter from './routes/agent.js'
import txRouter from './routes/tx.js'
import { startScheduleRunner } from './lib/schedule.js'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json({ limit: '200kb' }))

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'Vel.fi Backend', 
    version: '1.0.0',
    chain: process.env.SOLANA_CLUSTER || 'devnet',
    routes: ['/auth', '/users', '/account', '/payments', '/streams', '/schedule', '/agent', '/tx']
  })
})

app.use('/auth', authRouter)
app.use('/users', usersRouter)
app.use('/account', accountRouter)
app.use('/payments', paymentsRouter)
app.use('/streams', streamsRouter)
app.use('/schedule', scheduleRouter)
app.use('/agent', agentRouter)
app.use('/tx', txRouter)

app.listen(PORT, () => {
  startScheduleRunner()
  console.log(`Vel.fi backend running on port ${PORT}`)
})
