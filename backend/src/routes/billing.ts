import { Router, Request, Response } from 'express'
import { getBillingForMonth, getBillingSummary, updateBillingRow } from '../lib/billing'
import { logAction } from '../lib/audit'

const router = Router()

router.get('/', async (req: Request, res: Response) => {
  try {
    const now = new Date()
    const month = Number(req.query.month ?? now.getMonth() + 1)
    const year = Number(req.query.year ?? now.getFullYear())

    const [rows, summary] = await Promise.all([
      getBillingForMonth(month, year),
      getBillingSummary(month, year),
    ])
    res.json({ rows, summary })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    await updateBillingRow(id, req.body)
    await logAction(req.user!.id, req.user!.name, 'updated', 'billing', id)
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
