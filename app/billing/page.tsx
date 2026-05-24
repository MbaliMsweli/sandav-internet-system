'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch, apiUrl } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BillingRow {
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

interface Summary { total: number; paidCount: number; unpaidCount: number; totalCollected: number }

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [rows, setRows] = useState<BillingRow[]>([])
  const [current, setCurrent] = useState<Summary>({ total: 0, paidCount: 0, unpaidCount: 0, totalCollected: 0 })
  const [prev, setPrev] = useState<Summary>({ total: 0, paidCount: 0, unpaidCount: 0, totalCollected: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [payingId, setPayingId] = useState<number | null>(null)
  const [payForm, setPayForm] = useState({ payment_method: 'EFT', pay_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear  = month === 1 ? year - 1 : year

  const reload = useCallback(() => {
    setLoading(true)
    Promise.all([
      apiFetch(`/api/billing?month=${month}&year=${year}`),
      apiFetch(`/api/billing?month=${prevMonth}&year=${prevYear}`),
    ]).then(([cur, prv]) => {
      setRows(cur.rows)
      setCurrent(cur.summary)
      setPrev(prv.summary)
    }).catch(console.error).finally(() => setLoading(false))
  }, [month, year, prevMonth, prevYear])

  useEffect(() => { reload() }, [reload])

  async function markPaid(row: BillingRow) {
    setSaving(true)
    try {
      await apiFetch(`/api/billing/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'Paid',
          payment_reference: row.client_payment_reference || null,
          payment_method: payForm.payment_method || null,
          pay_date: payForm.pay_date || null,
          notes: payForm.notes || null,
          total_paid: row.monthly_fee,
        }),
      })
      setPayingId(null)
      setPayForm({ payment_method: 'EFT', pay_date: '', notes: '' })
      reload()
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteRow(id: number) {
    setDeleting(true)
    try {
      await apiFetch(`/api/billing/${id}`, { method: 'DELETE' })
      setConfirmDeleteId(null)
      reload()
    } finally {
      setDeleting(false)
    }
  }

  async function markUnpaid(row: BillingRow) {
    await apiFetch(`/api/billing/${row.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_status: 'Unpaid', payment_reference: null, payment_method: null, pay_date: null, notes: null, total_paid: null }),
    })
    reload()
  }

  const q = search.trim().toLowerCase()
  const visibleRows = q
    ? rows.filter(r =>
        (r.client_name ?? '').toLowerCase().includes(q) ||
        (r.phone ?? '').toLowerCase().includes(q) ||
        (r.client_payment_reference ?? '').toLowerCase().includes(q) ||
        (r.payment_reference ?? '').toLowerCase().includes(q)
      )
    : rows

  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Billing</h1>

      {/* Month selector */}
      <div className="flex items-center gap-3 mb-6 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <a href={apiUrl(`/api/export/billing?month=${month}&year=${year}`)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors shrink-0">
          Download {MONTHS[month - 1]} CSV
        </a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label={`Paid (${MONTHS[month - 1]})`} value={`${current.paidCount}/${current.total}`} color="green" />
        <SummaryCard label={`Unpaid (${MONTHS[month - 1]})`} value={`${current.unpaidCount}/${current.total}`} color="red" />
        <SummaryCard label="Collected" value={`R${current.totalCollected.toLocaleString()}`} color="blue" />
        <SummaryCard label={`Paid in ${MONTHS[prevMonth - 1]}`} value={`${prev.paidCount}/${prev.total}`} color="gray" />
      </div>

      {loading && <div className="text-center py-8 text-gray-400">Loading…</div>}

      {!loading && (
        <>
          {rows.length > 0 && (
            <input type="search" placeholder="Search by name, phone or payment reference..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" />
          )}

          {rows.length === 0 && <div className="text-center py-16 text-gray-400"><p>No active clients for this month.</p></div>}
          {rows.length > 0 && visibleRows.length === 0 && <div className="text-center py-16 text-gray-400"><p>No clients match your search.</p></div>}

          <div className="space-y-3">
            {visibleRows.map(row => (
              <div key={row.id}>
                <div className={`bg-white border rounded-xl p-4 ${row.payment_status === 'Unpaid' ? 'border-red-200' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">{row.client_name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.payment_status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {row.payment_status}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{row.phone} &bull; {row.internet_type}</p>
                      {row.payment_status === 'Paid' && row.payment_reference && (
                        <p className="text-xs text-gray-400 mt-1">Ref: {row.payment_reference} &bull; {row.pay_date}</p>
                      )}
                      {row.notes && <p className="text-xs text-gray-400 mt-1">Note: {row.notes}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-700">R{row.monthly_fee}/mo</p>
                      {row.payment_status === 'Paid' ? (
                        <button onClick={() => markUnpaid(row)} className="text-xs text-gray-400 hover:text-red-500 mt-2 underline">Mark Unpaid</button>
                      ) : (
                        <button onClick={() => { setPayingId(payingId === row.id ? null : row.id); setPayForm(f => ({ ...f, pay_date: row.client_pay_date ?? '' })) }}
                          className="mt-2 bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                          Mark Paid
                        </button>
                      )}
                      <button onClick={() => setConfirmDeleteId(confirmDeleteId === row.id ? null : row.id)}
                        className="text-xs text-gray-300 hover:text-red-400 mt-1 underline block ml-auto">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>

                {confirmDeleteId === row.id && (
                  <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mt-1 text-center">
                    <p className="font-semibold text-red-800 mb-3">Remove {row.client_name} from this month&apos;s billing? This cannot be undone.</p>
                    <div className="flex gap-3 justify-center">
                      <button onClick={() => handleDeleteRow(row.id)} disabled={deleting}
                        className="bg-red-600 text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                        {deleting ? 'Removing...' : 'Yes, Remove'}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)}
                        className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg text-sm font-semibold hover:bg-gray-300 transition-colors">Cancel</button>
                    </div>
                  </div>
                )}

                {payingId === row.id && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-1 space-y-3">
                    <p className="font-semibold text-green-700 text-sm">Record payment for {row.client_name}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Payment Reference</label>
                        <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                          {row.client_payment_reference || <span className="text-gray-400 italic">Not set on client profile</span>}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                        <select value={payForm.payment_method} onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                          <option>EFT</option><option>Cash</option><option>Card</option><option>SnapScan</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Actual Payment Date{row.client_pay_date && <span className="text-gray-400 font-normal ml-1">(usual: {row.client_pay_date})</span>}
                        </label>
                        <input type="date" value={payForm.pay_date} onChange={e => setPayForm(f => ({ ...f, pay_date: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                        <input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" placeholder="e.g. paid late" />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => markPaid(row)} disabled={saving}
                        className="bg-green-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                        {saving ? 'Saving...' : 'Confirm Payment'}
                      </button>
                      <button onClick={() => setPayingId(null)} className="bg-gray-200 text-gray-700 px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-300 transition-colors">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: 'green' | 'red' | 'blue' | 'gray' }) {
  const colors = {
    green: 'bg-green-50 border-green-200 text-green-700',
    red:   'bg-red-50 border-red-200 text-red-700',
    blue:  'bg-blue-50 border-blue-200 text-blue-700',
    gray:  'bg-gray-50 border-gray-300 text-gray-600',
  }
  return (
    <div className={`${colors[color]} border rounded-xl p-4 text-center`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  )
}
