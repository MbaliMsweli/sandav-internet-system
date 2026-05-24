import { Router, Request, Response } from 'express'
import { getAllRequests } from '../lib/requests'
import { getAllClients } from '../lib/clients'
import { getBillingSummary } from '../lib/billing'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  try {
    const [requests, clients] = await Promise.all([getAllRequests(), getAllClients()])
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()
    const billing = await getBillingSummary(month, year)

    res.json({
      pendingRequests: requests.filter(r => !r.moved_to_permanent).length,
      activeClients: clients.filter(c => c.client_status === 'Active').length,
      unpaidThisMonth: billing.unpaidCount,
      paidThisMonth: billing.paidCount,
      totalClients: clients.length,
    })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
