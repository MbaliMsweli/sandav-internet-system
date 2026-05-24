import { Router, Request, Response } from 'express'
import { query } from '../lib/db'

const router = Router()

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return 'No data'
  const headers = Object.keys(rows[0])
  return [
    headers,
    ...rows.map(r => headers.map(h => {
      const v = String(r[h] ?? '')
      return v.includes(',') || v.includes('"') || v.includes('\n')
        ? `"${v.replace(/"/g, '""')}"` : v
    })),
  ].map(r => r.join(',')).join('\n')
}

// GET /api/export — full JSON backup
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [requests, clients, billing] = await Promise.all([
      query(`SELECT * FROM requests ORDER BY id`),
      query(`SELECT * FROM clients ORDER BY id`),
      query(`SELECT * FROM billing ORDER BY id`),
    ])
    const data = { exportedAt: new Date().toISOString(), requests, clients, billing }
    const date = new Date().toISOString().split('T')[0]
    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="sandav-backup-${date}.json"`,
    }).send(JSON.stringify(data, null, 2))
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// GET /api/export/requests — CSV
router.get('/requests', async (_req: Request, res: Response) => {
  try {
    const rows = await query('SELECT * FROM requests ORDER BY id')
    const date = new Date().toISOString().split('T')[0]
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="sandav-requests-${date}.csv"`,
    }).send(toCSV(rows))
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// GET /api/export/clients — CSV
router.get('/clients', async (_req: Request, res: Response) => {
  try {
    const rows = await query('SELECT * FROM clients ORDER BY id')
    const date = new Date().toISOString().split('T')[0]
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="sandav-clients-${date}.csv"`,
    }).send(toCSV(rows))
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// GET /api/export/billing?month=5&year=2025 — CSV for a specific month or all
router.get('/billing', async (req: Request, res: Response) => {
  try {
    const month = req.query.month as string | undefined
    const year = req.query.year as string | undefined
    const date = new Date().toISOString().split('T')[0]

    let rows: Record<string, unknown>[]
    let filename: string

    if (month && year) {
      rows = await query(
        `SELECT c.client_name, c.phone, c.internet_type, c.monthly_fee,
                b.month, b.year, b.payment_status, b.payment_method,
                b.payment_reference, b.total_paid, b.pay_date, b.notes
         FROM billing b
         JOIN clients c ON b.client_id = c.id
         WHERE b.month = $1 AND b.year = $2
         ORDER BY c.client_name`,
        [Number(month), Number(year)]
      )
      filename = `sandav-billing-${year}-${String(month).padStart(2, '0')}.csv`
    } else {
      rows = await query(
        `SELECT c.client_name, c.phone, c.internet_type, c.monthly_fee,
                b.month, b.year, b.payment_status, b.payment_method,
                b.payment_reference, b.total_paid, b.pay_date, b.notes
         FROM billing b
         JOIN clients c ON b.client_id = c.id
         ORDER BY b.year DESC, b.month DESC, c.client_name`
      )
      filename = `sandav-billing-all-${date}.csv`
    }

    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    }).send(toCSV(rows))
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
