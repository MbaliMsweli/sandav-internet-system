import { Router } from 'express'
import { query } from '../lib/db'

const router = Router()

router.get('/:table/:recordId', async (req, res) => {
  const { table, recordId } = req.params
  const allowed = ['requests', 'clients', 'billing']
  if (!allowed.includes(table)) {
    res.status(400).json({ error: 'Invalid table' })
    return
  }
  try {
    const rows = await query<{
      id: number
      user_name: string
      action: string
      details: string | null
      created_at: string
    }>(
      `SELECT id, user_name, action, details, created_at
       FROM audit_log
       WHERE table_name = $1 AND record_id = $2
       ORDER BY created_at DESC`,
      [table, parseInt(recordId)]
    )
    res.json(rows)
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to load history' })
  }
})

export default router
