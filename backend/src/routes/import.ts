import { Router, Request, Response } from 'express'
import { query, initSchema } from '../lib/db'

const router = Router()

// ── Shared CSV parser ─────────────────────────────────────────────────────────

function parseCSV(text: string): Record<string, string>[] {
  const input = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  function tokenise(src: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cur = ''
    let inQuote = false
    let i = 0
    while (i < src.length) {
      const ch = src[i]
      if (inQuote) {
        if (ch === '"' && src[i + 1] === '"') { cur += '"'; i += 2; continue }
        if (ch === '"') { inQuote = false; i++; continue }
        cur += ch
      } else {
        if (ch === '"' && cur === '') { inQuote = true; i++; continue }
        else if (ch === '"') { cur += ch; i++; continue }
        if (ch === ',') { row.push(cur.trim()); cur = ''; i++; continue }
        if (ch === '\n') {
          row.push(cur.trim()); cur = ''
          if (row.some(v => v)) rows.push(row)
          row = []; i++; continue
        }
        cur += ch
      }
      i++
    }
    row.push(cur.trim())
    if (row.some(v => v)) rows.push(row)
    return rows
  }

  const rows = tokenise(input)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(vals => {
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

function cleanMoney(val: string): number | null {
  if (!val) return null
  const n = parseFloat(val.replace(/[R,\s]/g, ''))
  return isNaN(n) ? null : n
}

// ── POST /api/import/requests ─────────────────────────────────────────────────

const REQUEST_COL_MAP: Record<string, string> = {
  'client full name': 'client_name', 'full name': 'client_name',
  'phone number': 'phone', 'phone': 'phone',
  'client location': 'location', 'location': 'location',
  'call date': 'call_date',
  'installation readiness': 'install_readiness',
  'preffered install date': 'preferred_install_date',
  'preferred install date': 'preferred_install_date',
  'internet type': 'internet_type',
  'monthly fee': 'monthly_fee',
  'installation date': 'installation_date',
  'installation status': 'install_status',
  'installation fee': 'install_fee',
  'payment status': 'payment_status',
  'payment reference': 'payment_reference',
  'pay date': 'pay_date',
  'device name': 'device_name',
  'mac address ( router)': 'mac_address',
  'mac address (router)': 'mac_address',
  'mac address': 'mac_address',
  'movedtopermanentclient': 'moved_to_permanent',
  'request no': 'request_no',
}

const INSTALL_STATUS_MAP: Record<string, string> = {
  'done': 'Installed', 'installed': 'Installed', 'pending': 'Pending', '': 'Pending',
}
const PAYMENT_STATUS_MAP: Record<string, string> = {
  'paid': 'Paid', 'not paid': 'Unpaid', 'unpaid': 'Unpaid', '': 'Unpaid',
}
const READINESS_MAP: Record<string, string> = {
  'pending coverage': 'Pending Coverage',
  'ready to install': 'Ready To Install',
  'not yet ready': 'Not Yet Ready',
}

function cleanStatus(val: string, map: Record<string, string>): string {
  return map[val?.trim().toLowerCase()] ?? val?.trim() ?? ''
}

async function nextRequestNo(): Promise<string> {
  const rows = await query<{ request_no: string }>(`SELECT request_no FROM requests ORDER BY id DESC LIMIT 1`)
  if (!rows.length) return 'REQ-001'
  const match = rows[0].request_no.match(/\d+$/)
  const num = match ? parseInt(match[0], 10) : 0
  return `REQ-${String(num + 1).padStart(3, '0')}`
}

router.post('/requests', async (req: Request, res: Response) => {
  try {
    await initSchema()
    const { csv } = req.body
    const rows = parseCSV(csv)
    let imported = 0, skipped = 0, activatedClients = 0
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    for (const raw of rows) {
      try {
        const data: Record<string, string> = {}
        for (const [key, val] of Object.entries(raw)) {
          const field = REQUEST_COL_MAP[key.toLowerCase().trim()]
          if (field) data[field] = (val as string).trim()
        }

        if (!data.client_name && !data.phone) { skipped++; continue }
        if (!data.phone) { skipped++; continue }

        const phone = data.phone.replace(/\s+/g, '')
        if (!phone) { skipped++; continue }

        const existsReq = await query(`SELECT id FROM requests WHERE phone = $1`, [phone])
        if (existsReq.length > 0) { skipped++; continue }

        const movedToClient = data.moved_to_permanent?.toLowerCase() === 'yes'
        const installStatus = cleanStatus(data.install_status ?? '', INSTALL_STATUS_MAP)
        const paymentStatus = cleanStatus(data.payment_status ?? '', PAYMENT_STATUS_MAP)
        const installReadiness = cleanStatus(data.install_readiness ?? '', READINESS_MAP) || null

        let requestNo = data.request_no?.match(/REQ-\d+/)?.[0] ?? await nextRequestNo()
        const existsNo = await query(`SELECT id FROM requests WHERE request_no = $1`, [requestNo])
        if (existsNo.length > 0) requestNo = await nextRequestNo()

        const reqResult = await query<{ id: number }>(`
          INSERT INTO requests (
            request_no, client_name, phone, location, call_date, internet_type,
            install_readiness, preferred_install_date, installation_date,
            install_status, install_fee, payment_status, monthly_fee, moved_to_permanent
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          RETURNING id
        `, [
          requestNo, data.client_name || 'Unknown', phone,
          data.location || null, data.call_date || null, data.internet_type || null,
          installReadiness, data.preferred_install_date || null, data.installation_date || null,
          installStatus, cleanMoney(data.install_fee ?? ''),
          paymentStatus, cleanMoney(data.monthly_fee ?? ''),
          movedToClient ? 1 : 0,
        ])

        imported++
        const requestId = reqResult[0]?.id

        if (movedToClient && requestId) {
          const existsClient = await query(`SELECT id FROM clients WHERE phone = $1`, [phone])
          if (existsClient.length === 0) {
            const clientResult = await query<{ id: number }>(`
              INSERT INTO clients (
                request_id, client_name, phone, location, internet_type, monthly_fee,
                device_name, mac_address, payment_reference, pay_date, client_status
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Active')
              RETURNING id
            `, [
              requestId, data.client_name || 'Unknown', phone,
              data.location || null, data.internet_type || null,
              cleanMoney(data.monthly_fee ?? ''),
              data.device_name || null, data.mac_address || null,
              data.payment_reference || null, data.pay_date || null,
            ])

            if (clientResult[0]?.id) {
              await query(
                `INSERT INTO billing (client_id, month, year) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
                [clientResult[0].id, month, year]
              )
              activatedClients++
            }
          }
        }
      } catch {
        skipped++
      }
    }

    res.json({ imported, skipped, activatedClients })
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

// ── POST /api/import/clients ──────────────────────────────────────────────────

const CLIENT_COL_MAP: Record<string, string> = {
  'client full name': 'client_name', 'full name': 'client_name', 'client name': 'client_name',
  'name': 'client_name', 'customer name': 'client_name', 'clients name': 'client_name',
  'phone number': 'phone', 'phone': 'phone', 'contact': 'phone', 'contact number': 'phone',
  'mobile': 'phone', 'mobile number': 'phone', 'cell': 'phone', 'tel': 'phone', 'telephone': 'phone',
  'client location': 'location', 'location': 'location', 'address': 'location', 'area': 'location',
  'internet type': 'internet_type', 'package': 'internet_type', 'service type': 'internet_type',
  'monthly fee': 'monthly_fee', 'fee': 'monthly_fee', 'amount': 'monthly_fee', 'price': 'monthly_fee', 'rate': 'monthly_fee',
  'mac address ( router)': 'mac_address', 'mac address (router)': 'mac_address',
  'mac address': 'mac_address', 'mac': 'mac_address',
  'device name': 'device_name', 'device': 'device_name', 'equipment': 'device_name',
  'payment reference': 'payment_reference', 'reference': 'payment_reference', 'ref': 'payment_reference',
  'pay ref': 'payment_reference', 'payment ref': 'payment_reference',
  'pay date': 'pay_date', 'payment date': 'pay_date', 'date paid': 'pay_date',
  'rocket no.': 'rocket_no', 'rocket no': 'rocket_no', 'rocket': 'rocket_no', 'rocket number': 'rocket_no',
  'router no.': 'rocket_no', 'router no': 'rocket_no', 'router number': 'rocket_no',
  'litebeam ip address': 'litebeam_ip', 'litebeam ip': 'litebeam_ip', 'litebeam': 'litebeam_ip',
  'router ip address': 'router_ip', 'router ip': 'router_ip', 'router': 'router_ip',
  'client status': 'client_status', 'status': 'client_status',
}

const CLIENT_FUZZY_RULES: Array<{ contains: string[]; field: string }> = [
  { contains: ['name'],               field: 'client_name' },
  { contains: ['phone', 'mobile', 'cell', 'tel', 'contact'], field: 'phone' },
  { contains: ['location', 'address', 'area'], field: 'location' },
  { contains: ['internet', 'package', 'service'], field: 'internet_type' },
  { contains: ['fee', 'amount', 'price', 'rate', 'monthly'], field: 'monthly_fee' },
  { contains: ['mac'],                field: 'mac_address' },
  { contains: ['device', 'equipment'], field: 'device_name' },
  { contains: ['reference', 'ref'],   field: 'payment_reference' },
  { contains: ['pay date', 'payment date', 'date paid'], field: 'pay_date' },
  { contains: ['rocket'],             field: 'rocket_no' },
  { contains: ['litebeam'],           field: 'litebeam_ip' },
  { contains: ['router ip', 'router'], field: 'router_ip' },
  { contains: ['status'],             field: 'client_status' },
]

function resolveClientField(header: string): string | undefined {
  const k = header.toLowerCase().trim()
  if (CLIENT_COL_MAP[k]) return CLIENT_COL_MAP[k]
  for (const rule of CLIENT_FUZZY_RULES) {
    if (rule.contains.some(kw => k.includes(kw))) return rule.field
  }
  return undefined
}

function mapClientRow(raw: Record<string, string>) {
  const mapped: Record<string, string> = {}
  for (const [key, val] of Object.entries(raw)) {
    const field = resolveClientField(key)
    if (field && val.trim() && !mapped[field]) mapped[field] = val.trim()
  }
  return mapped
}

type MappedClientRow = ReturnType<typeof mapClientRow> & { _phone: string }

router.post('/clients', async (req: Request, res: Response) => {
  try {
    await initSchema()
    const { csv } = req.body
    const rows = parseCSV(csv)
    const parsedRows = rows.length
    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const mapped: MappedClientRow[] = []
    const noPhoneNames: string[] = []

    for (const raw of rows) {
      const data = mapClientRow(raw)
      const phone = data.phone?.replace(/\s+/g, '')
      if (!phone) {
        noPhoneNames.push(data.client_name || Object.values(raw).find(v => v.trim()) || '(blank row)')
        continue
      }
      mapped.push({ ...data, _phone: phone })
    }

    if (mapped.length === 0) {
      res.json({ imported: 0, updated: 0, skipped: 0, duplicateRefs: [], noPhoneNames, parsedRows }); return
    }

    const phones = mapped.map(d => d._phone)
    const existingClients = await query<{ id: number; phone: string; payment_reference: string | null }>(
      `SELECT id, phone, payment_reference FROM clients WHERE phone = ANY($1)`, [phones]
    )
    const existingByPhone = new Map(existingClients.map(c => [c.phone, c]))

    const refs = mapped.map(d => d.payment_reference).filter(Boolean) as string[]
    const existingRefs = refs.length > 0
      ? await query<{ id: number; payment_reference: string }>(
          `SELECT id, payment_reference FROM clients WHERE payment_reference = ANY($1)`, [refs]
        )
      : []
    const refToId = new Map(existingRefs.map(c => [c.payment_reference, c.id]))

    const macs  = [...new Set(mapped.map(d => d.mac_address).filter(Boolean))] as string[]
    const lbIps = [...new Set(mapped.map(d => d.litebeam_ip).filter(Boolean))] as string[]
    const rtIps = [...new Set(mapped.map(d => d.router_ip).filter(Boolean))] as string[]

    const macRows = macs.length > 0 ? await query<{ id: number; mac_address: string }>(`SELECT id, mac_address FROM clients WHERE mac_address = ANY($1)`, [macs]) : []
    const lbRows  = lbIps.length > 0 ? await query<{ id: number; litebeam_ip: string }>(`SELECT id, litebeam_ip FROM clients WHERE litebeam_ip = ANY($1)`, [lbIps]) : []
    const rtRows  = rtIps.length > 0 ? await query<{ id: number; router_ip: string }>(`SELECT id, router_ip FROM clients WHERE router_ip = ANY($1)`, [rtIps]) : []

    const macToId = new Map(macRows.map(r => [r.mac_address, r.id]))
    const lbToId  = new Map(lbRows.map(r => [r.litebeam_ip, r.id]))
    const rtToId  = new Map(rtRows.map(r => [r.router_ip, r.id]))

    function networkConflict(data: MappedClientRow, ownId: number): string | null {
      if (data.mac_address) { const c = macToId.get(data.mac_address); if (c !== undefined && c !== ownId) return `MAC ${data.mac_address}` }
      if (data.litebeam_ip) { const c = lbToId.get(data.litebeam_ip);  if (c !== undefined && c !== ownId) return `Litebeam IP ${data.litebeam_ip}` }
      if (data.router_ip)   { const c = rtToId.get(data.router_ip);    if (c !== undefined && c !== ownId) return `Router IP ${data.router_ip}` }
      return null
    }

    const toInsert: MappedClientRow[] = []
    const toUpdate: Array<{ data: MappedClientRow; clientId: number }> = []
    let skipped = 0
    const duplicateRefs: string[] = []
    const duplicateNetwork: string[] = []
    const allClientIds: number[] = []

    for (const data of mapped) {
      const existingClient = existingByPhone.get(data._phone)
      const label = data.client_name || data._phone

      if (existingClient) {
        if (data.payment_reference) {
          const conflictId = refToId.get(data.payment_reference)
          if (conflictId && conflictId !== existingClient.id) { duplicateRefs.push(data.payment_reference); skipped++; continue }
        }
        const netErr = networkConflict(data, existingClient.id)
        if (netErr) duplicateNetwork.push(`${label}: ${netErr}`)
        toUpdate.push({ data, clientId: existingClient.id })
        allClientIds.push(existingClient.id)
      } else {
        if (data.payment_reference) {
          const conflictId = refToId.get(data.payment_reference)
          if (conflictId) { duplicateRefs.push(data.payment_reference); skipped++; continue }
          refToId.set(data.payment_reference, -1)
        }
        const netErr = networkConflict(data, -1)
        if (netErr) duplicateNetwork.push(`${label}: ${netErr}`)
        if (data.mac_address) macToId.set(data.mac_address, 0)
        if (data.litebeam_ip) lbToId.set(data.litebeam_ip, 0)
        if (data.router_ip)   rtToId.set(data.router_ip, 0)
        toInsert.push(data)
        existingByPhone.set(data._phone, { id: -1, phone: data._phone, payment_reference: data.payment_reference || null })
      }
    }

    let imported = 0
    if (toInsert.length > 0) {
      const placeholders = toInsert.map((_, i) => {
        const b = i * 13
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13})`
      }).join(',')
      const values = toInsert.flatMap(d => [
        d.client_name || 'Unknown', d._phone, d.location || '',
        d.internet_type || '', cleanMoney(d.monthly_fee ?? '') ?? 0,
        d.device_name || null, d.mac_address || null, d.payment_reference || null,
        d.pay_date || null, d.rocket_no || null, d.litebeam_ip || null,
        d.router_ip || null, d.client_status || 'Active',
      ])
      const results = await query<{ id: number }>(
        `INSERT INTO clients (client_name, phone, location, internet_type, monthly_fee, device_name, mac_address, payment_reference, pay_date, rocket_no, litebeam_ip, router_ip, client_status) VALUES ${placeholders} RETURNING id`,
        values
      )
      allClientIds.push(...results.map(r => r.id))
      imported = results.length
    }

    let updated = 0
    if (toUpdate.length > 0) {
      await query(`
        UPDATE clients SET
          client_name       = COALESCE(NULLIF(NULLIF(clients.client_name, ''), 'Unknown'), v.name),
          location          = COALESCE(clients.location,          v.location),
          internet_type     = COALESCE(clients.internet_type,     v.internet_type),
          monthly_fee       = COALESCE(clients.monthly_fee,       v.fee::real),
          device_name       = COALESCE(clients.device_name,       v.device),
          mac_address       = COALESCE(clients.mac_address,       v.mac),
          payment_reference = COALESCE(clients.payment_reference, v.pay_ref),
          pay_date          = COALESCE(clients.pay_date,          v.pay_date),
          rocket_no         = COALESCE(clients.rocket_no,         v.rocket),
          litebeam_ip       = COALESCE(clients.litebeam_ip,       v.litebeam),
          router_ip         = COALESCE(clients.router_ip,         v.router),
          client_status     = COALESCE(NULLIF(clients.client_status, ''), v.status)
        FROM unnest(
          $1::int[], $2::text[], $3::text[], $4::text[], $5::real[],
          $6::text[], $7::text[], $8::text[], $9::text[],
          $10::text[], $11::text[], $12::text[], $13::text[]
        ) AS v(id, name, location, internet_type, fee, device, mac, pay_ref, pay_date, rocket, litebeam, router, status)
        WHERE clients.id = v.id
      `, [
        toUpdate.map(u => u.clientId),
        toUpdate.map(u => u.data.client_name || null),
        toUpdate.map(u => u.data.location || null),
        toUpdate.map(u => u.data.internet_type || null),
        toUpdate.map(u => cleanMoney(u.data.monthly_fee ?? '')),
        toUpdate.map(u => u.data.device_name || null),
        toUpdate.map(u => u.data.mac_address || null),
        toUpdate.map(u => u.data.payment_reference || null),
        toUpdate.map(u => u.data.pay_date || null),
        toUpdate.map(u => u.data.rocket_no || null),
        toUpdate.map(u => u.data.litebeam_ip || null),
        toUpdate.map(u => u.data.router_ip || null),
        toUpdate.map(u => u.data.client_status || 'Active'),
      ])
      updated = toUpdate.length
    }

    if (allClientIds.length > 0) {
      await query(
        `INSERT INTO billing (client_id, month, year) SELECT unnest($1::int[]), $2, $3 ON CONFLICT (client_id, month, year) DO NOTHING`,
        [allClientIds, month, year]
      )
    }

    res.json({ imported, updated, skipped, duplicateRefs, duplicateNetwork, noPhoneNames, parsedRows })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[import/clients]', msg)
    res.status(500).json({ error: msg })
  }
})

export default router
