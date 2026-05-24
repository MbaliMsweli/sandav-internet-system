import { query, initSchema } from './db'

export interface Client {
  id: number
  request_id: number | null
  client_name: string
  phone: string
  location: string
  internet_type: string
  monthly_fee: number
  device_name: string | null
  mac_address: string | null
  payment_reference: string | null
  pay_date: string | null
  rocket_no: string | null
  litebeam_ip: string | null
  router_ip: string | null
  client_status: string
  active_since: string
  created_at: string
}

export async function getAllClients(): Promise<Client[]> {
  await initSchema()
  return query<Client>(`SELECT * FROM clients ORDER BY id DESC`)
}

export async function getClient(id: number): Promise<Client | undefined> {
  await initSchema()
  const rows = await query<Client>(`SELECT * FROM clients WHERE id = $1`, [id])
  return rows[0]
}

export async function createClient(data: Omit<Client, 'id' | 'active_since' | 'created_at'>): Promise<Client> {
  await initSchema()
  const rows = await query<Client>(`
    INSERT INTO clients (request_id, client_name, phone, location, internet_type,
      monthly_fee, device_name, mac_address, payment_reference, pay_date,
      rocket_no, litebeam_ip, router_ip, client_status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
    data.request_id ?? null, data.client_name, data.phone, data.location,
    data.internet_type, data.monthly_fee, data.device_name ?? null,
    data.mac_address ?? null, data.payment_reference ?? null, data.pay_date ?? null,
    data.rocket_no ?? null, data.litebeam_ip ?? null, data.router_ip ?? null,
    data.client_status ?? 'Active',
  ])
  return rows[0]
}

export async function updateClient(id: number, data: Partial<Omit<Client, 'id' | 'created_at' | 'active_since'>>): Promise<Client | undefined> {
  await initSchema()
  const entries = Object.entries(data).filter(([k]) => !['id', 'created_at', 'active_since'].includes(k))
  if (entries.length === 0) return getClient(id)
  const set = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values = entries.map(([, v]) => (v === '' ? null : v ?? null))
  const rows = await query<Client>(
    `UPDATE clients SET ${set} WHERE id = $${entries.length + 1} RETURNING *`,
    [...values, id]
  )
  return rows[0]
}

export async function deleteClient(id: number): Promise<void> {
  await query(`DELETE FROM billing WHERE client_id = $1`, [id])
  await query(`DELETE FROM clients WHERE id = $1`, [id])
}
