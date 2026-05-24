import { Router, Request, Response } from 'express'
import { getAllRequests, getRequest, createRequest, updateRequest, deleteRequest, getMissingFields, markMoved } from '../lib/requests'
import { createClient } from '../lib/clients'
import { logAction } from '../lib/audit'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  try {
    const requests = await getAllRequests()
    res.json(requests)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const request = await createRequest(req.body)
    await logAction(req.user!.id, req.user!.name, 'created', 'requests', request.id)
    res.status(201).json(request)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const request = await getRequest(Number(req.params.id))
    if (!request) { res.status(404).json({ error: 'Not found' }); return }
    res.json(request)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    const updated = await updateRequest(id, req.body)
    if (!updated) { res.status(404).json({ error: 'Not found' }); return }
    await logAction(req.user!.id, req.user!.name, 'updated', 'requests', id)
    res.json(updated)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    await logAction(req.user!.id, req.user!.name, 'deleted', 'requests', id)
    await deleteRequest(id)
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

router.post('/:id/promote', async (req: Request, res: Response) => {
  try {
    const request = await getRequest(Number(req.params.id))
    if (!request) { res.status(404).json({ error: 'Not found' }); return }

    const missing = getMissingFields(request)
    if (missing.length > 0) {
      res.status(400).json({ error: 'Missing required fields', missing }); return
    }

    if (request.moved_to_permanent) {
      res.status(400).json({ error: 'Already activated' }); return
    }

    const client = await createClient({
      request_id: request.id,
      client_name: request.client_name,
      phone: request.phone,
      location: request.location,
      internet_type: request.internet_type,
      monthly_fee: request.monthly_fee!,
      device_name: request.device_name,
      mac_address: request.mac_address,
      payment_reference: request.payment_reference,
      pay_date: request.pay_date,
      rocket_no: request.rocket_no,
      litebeam_ip: request.litebeam_ip,
      router_ip: request.router_ip,
      client_status: 'Active',
    })

    await markMoved(request.id)
    await logAction(req.user!.id, req.user!.name, 'activated', 'requests', request.id)
    await logAction(req.user!.id, req.user!.name, 'created', 'clients', client.id)
    res.status(201).json(client)
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

export default router
