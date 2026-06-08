import express from 'express'
import supabase from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'

const router = express.Router()

// POST /schedule/create
router.post('/create', requireAuth, async (req, res) => {
  try {
    const {
      recipient, amount, token,
      scheduleType, frequency, intervalDays,
      timeOfDay, daysOfWeek, occurrences
    } = req.body

    if (!recipient || !amount || !scheduleType) {
      return res.status(400).json({ error: 'recipient, amount, scheduleType required' })
    }

    const nextRunAt = new Date(Date.now() + 60 * 1000) // next minute as placeholder

    const { data, error } = await supabase
      .from('scheduled_payments')
      .insert({
        user_address: req.user.address,
        recipient,
        amount,
        token: token || 'SUI',
        schedule_type: scheduleType,
        frequency,
        interval_days: intervalDays,
        time_of_day: timeOfDay,
        days_of_week: daysOfWeek,
        occurrences,
        next_run_at: nextRunAt,
        status: 'active'
      })
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, schedule: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /schedule/list
router.get('/list', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scheduled_payments')
      .select('*')
      .eq('user_address', req.user.address)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ schedules: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /schedule/:id/pause
router.patch('/:id/pause', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scheduled_payments')
      .update({ status: 'paused' })
      .eq('id', req.params.id)
      .eq('user_address', req.user.address)
      .select()
      .single()

    if (error) throw error
    res.json({ success: true, schedule: data })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /schedule/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('scheduled_payments')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id)
      .eq('user_address', req.user.address)

    if (error) throw error
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
