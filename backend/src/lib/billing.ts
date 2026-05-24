import { query, initSchema } from './db'

export interface BillingRow {
  id: number
  client_id: number
  month: number
  year: number
  payment_status: string
  payment_method: string | null
  payment_reference: string | null
  notes: string | null
  total_paid: number | null
  pay_date: string | null
  created_at: string
  client_name?: string
  phone?: string
  internet_type?: string
  monthly_fee?: number
  client_payment_reference?: string | null
  client_pay_date?: string | null
}

export async function getBillingForMonth(month: number, year: number): Promise<BillingRow[]> {
  await initSchema()
  await ensureBillingRows(month, year)
  return query<BillingRow>(`
    SELECT b.*, c.client_name, c.phone, c.internet_type, c.monthly_fee,
           c.payment_reference AS client_payment_reference, c.pay_date AS client_pay_date
    FROM billing b
    JOIN clients c ON c.id = b.client_id
    WHERE b.month = $1 AND b.year = $2
    ORDER BY c.client_name ASC
  `, [month, year])
}

export async function getBillingSummary(month: number, year: number) {
  const rows = await getBillingForMonth(month, year)
  const paid = rows.filter(r => r.payment_status === 'Paid')
  return {
    total: rows.length,
    paidCount: paid.length,
    unpaidCount: rows.length - paid.length,
    totalCollected: paid.reduce((sum, r) => sum + (r.total_paid ?? r.monthly_fee ?? 0), 0),
  }
}

export async function updateBillingRow(id: number, data: {
  payment_status?: string
  payment_method?: string | null
  payment_reference?: string | null
  notes?: string | null
  total_paid?: number | null
  pay_date?: string | null
}): Promise<void> {
  const entries = Object.entries(data)
  if (entries.length === 0) return
  const set = entries.map(([k], i) => `${k} = $${i + 1}`).join(', ')
  const values = entries.map(([, v]) => v ?? null)
  await query(`UPDATE billing SET ${set} WHERE id = $${entries.length + 1}`, [...values, id])
}

async function ensureBillingRows(month: number, year: number): Promise<void> {
  await query(`
    INSERT INTO billing (client_id, month, year)
    SELECT id, $1, $2 FROM clients WHERE client_status = 'Active'
    ON CONFLICT (client_id, month, year) DO NOTHING
  `, [month, year])
}
