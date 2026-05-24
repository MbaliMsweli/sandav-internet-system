import { Router, Request, Response } from 'express'
import { getAllClients, createClient, getClient, updateClient, deleteClient } from '../lib/clients'
import { query, initSchema } from '../lib/db'
import { logAction } from '../lib/audit'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  try {
    const clients = await getAllClients()
    res.json(clients)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    await initSchema()
    const body = req.body

    const phone = (body.phone ?? '').replace(/\s+/g, '')
    if (!phone) { res.status(400).json({ error: 'Phone number is required.' }); return }

    const ref = (body.payment_reference ?? '').trim()
    if (ref) {
      const [dupRef] = await query<{ id: number; client_name: string }>(
        `SELECT id, client_name FROM clients WHERE payment_reference = $1 LIMIT 1`, [ref]
      )
      if (dupRef) { res.status(409).json({ error: `This payment reference is already assigned to ${dupRef.client_name}.` }); return }
    }

    const lbIp = (body.litebeam_ip ?? '').trim()
    if (lbIp) {
      const [dupLb] = await query<{ id: number; client_name: string }>(
        `SELECT id, client_name FROM clients WHERE litebeam_ip = $1 LIMIT 1`, [lbIp]
      )
      if (dupLb) { res.status(409).json({ error: `This LiteBeam IP is already assigned to ${dupLb.client_name}.` }); return }
    }

    const rtIp = (body.router_ip ?? '').trim()
    if (rtIp) {
      const [dupRt] = await query<{ id: number; client_name: string }>(
        `SELECT id, client_name FROM clients WHERE router_ip = $1 LIMIT 1`, [rtIp]
      )
      if (dupRt) { res.status(409).json({ error: `This Router IP is already assigned to ${dupRt.client_name}.` }); return }
    }

    const mac = (body.mac_address ?? '').trim()
    if (mac) {
      const [dupMac] = await query<{ id: number; client_name: string }>(
        `SELECT id, client_name FROM clients WHERE mac_address = $1 LIMIT 1`, [mac]
      )
      if (dupMac) { res.status(409).json({ error: `This MAC Address is already assigned to ${dupMac.client_name}.` }); return }
    }

    const client = await createClient({
      request_id: null,
      client_name: (body.client_name ?? '').trim() || 'Unknown',
      phone,
      location: (body.location ?? '').trim(),
      internet_type: (body.internet_type ?? '').trim(),
      monthly_fee: parseFloat(body.monthly_fee) || 0,
      device_name: body.device_name?.trim() || null,
      mac_address: mac || null,
      payment_reference: ref || null,
      pay_date: body.pay_date?.trim() || null,
      rocket_no: body.rocket_no?.trim() || null,
      litebeam_ip: lbIp || null,
      router_ip: rtIp || null,
      client_status: body.client_status ?? 'Active',
    })

    const now = new Date()
    await query(
      `INSERT INTO billing (client_id, month, year) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [client.id, now.getMonth() + 1, now.getFullYear()]
    )

    await logAction(req.user!.id, req.user!.name, 'created', 'clients', client.id)
    res.status(201).json(client)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  const client = await getClient(Number(req.params.id))
  if (!client) { res.status(404).json({ error: 'Not found' }); return }
  res.json(client)
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const numId = Number(req.params.id)
    const data = req.body

    const phone = (data.phone ?? '').replace(/\s+/g, '')

    const ref = (data.payment_reference ?? '').trim()
    if (ref) {
      const [dup] = await query<{ id: number; client_name: string }>(
        `SELECT id, client_name FROM clients WHERE payment_reference = $1 AND id != $2 LIMIT 1`, [ref, numId]
      )
      if (dup) { res.status(409).json({ error: `This payment reference is already assigned to ${dup.client_name}.` }); return }
    }

    const lbIp = (data.litebeam_ip ?? '').trim()
    if (lbIp) {
      const [dup] = await query<{ id: number; client_name: string }>(
        `SELECT id, client_name FROM clients WHERE litebeam_ip = $1 AND id != $2 LIMIT 1`, [lbIp, numId]
      )
      if (dup) { res.status(409).json({ error: `This LiteBeam IP is already assigned to ${dup.client_name}.` }); return }
    }

    const rtIp = (data.router_ip ?? '').trim()
    if (rtIp) {
      const [dup] = await query<{ id: number; client_name: string }>(
        `SELECT id, client_name FROM clients WHERE router_ip = $1 AND id != $2 LIMIT 1`, [rtIp, numId]
      )
      if (dup) { res.status(409).json({ error: `This Router IP is already assigned to ${dup.client_name}.` }); return }
    }

    const mac = (data.mac_address ?? '').trim()
    if (mac) {
      const [dup] = await query<{ id: number; client_name: string }>(
        `SELECT id, client_name FROM clients WHERE mac_address = $1 AND id != $2 LIMIT 1`, [mac, numId]
      )
      if (dup) { res.status(409).json({ error: `This MAC Address is already assigned to ${dup.client_name}.` }); return }
    }

    if (phone) data.phone = phone
    const updated = await updateClient(numId, data)
    if (!updated) { res.status(404).json({ error: 'Not found' }); return }
    await logAction(req.user!.id, req.user!.name, 'updated', 'clients', numId)
    res.json(updated)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    await logAction(req.user!.id, req.user!.name, 'deleted', 'clients', id)
    await deleteClient(id)
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
