import { query, initSchema } from './db'

export interface Request {
  id: number
  request_no: string
  client_name: string
  phone: string
  location: string
  call_date: string
  preferred_install_date: string | null
  internet_type: string
  install_readiness: string | null
  monthly_fee: number | null
  installation_date: string | null
  install_status: string
  install_fee: number | null
  payment_status: string
  payment_reference: string | null
  pay_date: string | null
  device_name: string | null
  mac_address: string | null
  rocket_no: string | null
  litebeam_ip: string | null
  router_ip: string | null
  moved_to_permanent: number
  created_at: string
}

export const REQUIRED_TO_ACTIVATE = [
  'client_name', 'phone', 'location', 'internet_type',
  'monthly_fee', 'install_status', 'payment_status',
  'payment_reference', 'pay_date', 'device_name', 'mac_address',
] as const

const FIELD_LABELS: Record<string, string> = {
  client_name: 'Client Name',
  phone: 'Phone Number',
  location: 'Location',
  internet_type: 'Internet Type',
  monthly_fee: 'Monthly Fee',
  install_status: 'Installation Status',
  payment_status: 'Installation Fee Paid',
  payment_reference: 'Payment Reference',
  pay_date: 'Payment Date',
  device_name: 'Device Name',
  mac_address: 'MAC Address',
}

export function getMissingFields(r: Request): string[] {
  const missing: string[] = []
  for (const f of REQUIRED_TO_ACTIVATE) {
    if (!r[f as keyof Request]) missing.push(FIELD_LABELS[f])
  }
  if (r.install_status !== 'Installed') missing.push('Installation must be marked as Installed')
  if (r.payment_status !== 'Paid') missing.push('Installation fee must be marked as Paid')
  return [...new Set(missing)]
}

async function nextRequestNo(): Promise<string> {
  const [row] = await query<{ n: number }>(
    `SELECT COALESCE(MAX(CAST(REPLACE(request_no, 'REQ-', '') AS INTEGER)), 0) AS n FROM requests`
  )
  return `REQ-${String((row?.n ?? 0) + 1).padStart(3, '0')}`
}

export async function getAllRequests(): Promise<Request[]> {
  await initSchema()
  return query<Request>(`SELECT * FROM requests ORDER BY id DESC`)
}

export async function getRequest(id: number): Promise<Request | undefined> {
  await initSchema()
  const rows = await query<Request>(`SELECT * FROM requests WHERE id = $1`, [id])
  return rows[0]
}

export async function createRequest(data: {
  client_name: string; phone: string; location: string; call_date: string
  preferred_install_date?: string; internet_type: string; install_readiness?: string
}): Promise<Request> {
  await initSchema()
  const request_no = await nextRequestNo()
  const rows = await query<Request>(`
    INSERT INTO requests (request_no, client_name, phone, location, call_date, preferred_install_date, internet_type, install_readiness)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [request_no, data.client_name, data.phone, data.location, data.call_date,
      data.preferred_install_date ?? null, data.internet_type, data.install_readiness ?? null])
  return rows[0]
}

export async function updateRequest(id: number, data: Partial<Omit<Request, 'id' | 'request_no' | 'created_at'>>): Promise<Request | undefined> {
  await initSchema()
  const entries = Object.entries(data).filter(([k]) => !['id', 'request_no', 'created_at'].includes(k))
  if (entries.length === 0) return getRequest(id)
  const set = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values = entries.map(([, v]) => (v === '' ? null : v ?? null))
  const rows = await query<Request>(
    `UPDATE requests SET ${set} WHERE id = $${entries.length + 1} RETURNING *`,
    [...values, id]
  )
  return rows[0]
}

export async function markMoved(id: number): Promise<void> {
  await query(`UPDATE requests SET moved_to_permanent = 1 WHERE id = $1`, [id])
}

export async function deleteRequest(id: number): Promise<void> {
  await query(`DELETE FROM requests WHERE id = $1`, [id])
}
