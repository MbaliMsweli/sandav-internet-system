'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { apiFetch, apiUrl } from '@/lib/api'

interface RequestRow {
  id: number
  client_name: string
  location: string
  phone: string
  moved_to_permanent: number
  install_readiness: string | null
}

interface ClientRow {
  id: number
  client_status: string
}

interface BillingSummary {
  total: number
  paidCount: number
  unpaidCount: number
  totalCollected: number
}

export default function Dashboard() {
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [clients, setClients] = useState<ClientRow[]>([])
  const [billing, setBilling] = useState<BillingSummary>({ total: 0, paidCount: 0, unpaidCount: 0, totalCollected: 0 })
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const monthName = now.toLocaleString('default', { month: 'long' })
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  useEffect(() => {
    Promise.all([
      apiFetch('/api/requests'),
      apiFetch('/api/clients'),
      apiFetch(`/api/billing?month=${month}&year=${year}`),
    ]).then(([reqs, cls, bill]) => {
      setRequests(reqs)
      setClients(cls)
      setBilling(bill.summary)
    }).catch(console.error).finally(() => setLoading(false))
  }, [month, year])

  const pending = requests.filter(r => !r.moved_to_permanent)
  const activeClients = clients.filter(c => c.client_status === 'Active')
  const pendingCoverage = pending.filter(r => r.install_readiness === 'Pending Coverage')
  const notYetReady = pending.filter(r => r.install_readiness === 'Not Yet Ready')
  const readyToInstall = pending.filter(r => r.install_readiness === 'Ready To Install')

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <a
          href={apiUrl('/api/export')}
          className="text-sm text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Download Backup
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Pending Requests" value={pending.length} color="orange" href="/requests" />
        <StatCard label="Active Clients" value={activeClients.length} color="blue" href="/clients" />
        <StatCard label={`Paid in ${monthName}`} value={billing.paidCount} color="green" href="/billing" />
        <StatCard label={`Unpaid in ${monthName}`} value={billing.unpaidCount} color="red" href="/billing" />
      </div>

      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Installation Pipeline</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <ReadinessCard label="Pending Coverage" clients={pendingCoverage} color="purple" />
        <ReadinessCard label="Not Yet Ready" clients={notYetReady} color="orange" />
        <ReadinessCard label="Ready To Install" clients={readyToInstall} color="blue" />
      </div>

      {billing.unpaidCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-red-700">
              {billing.unpaidCount} client{billing.unpaidCount !== 1 ? 's' : ''} have not paid for {monthName}
            </p>
            <p className="text-sm text-red-500 mt-0.5">Go to Billing to see who needs to be called.</p>
          </div>
          <Link href="/billing" className="shrink-0 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            View Billing
          </Link>
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-orange-700">
              {pending.length} request{pending.length !== 1 ? 's' : ''} waiting to be processed
            </p>
            <p className="text-sm text-orange-500 mt-0.5">Open each request to update installation details.</p>
          </div>
          <Link href="/requests" className="shrink-0 bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors">
            View Requests
          </Link>
        </div>
      )}

      {pending.length === 0 && billing.unpaidCount === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-center">
          All caught up! No pending requests and all clients paid for {monthName}.
        </div>
      )}
    </div>
  )
}

function ReadinessCard({ label, clients, color }: {
  label: string
  clients: { id: number; client_name: string; location: string; phone: string }[]
  color: 'gray' | 'orange' | 'blue' | 'purple'
}) {
  const colors = {
    gray:   { card: 'border-gray-200 bg-gray-50',   title: 'text-gray-600',   count: 'bg-gray-200 text-gray-700',   row: 'border-gray-100' },
    orange: { card: 'border-orange-200 bg-orange-50', title: 'text-orange-700', count: 'bg-orange-200 text-orange-800', row: 'border-orange-100' },
    blue:   { card: 'border-blue-200 bg-blue-50',   title: 'text-blue-700',   count: 'bg-blue-200 text-blue-800',   row: 'border-blue-100' },
    purple: { card: 'border-purple-200 bg-purple-50', title: 'text-purple-700', count: 'bg-purple-200 text-purple-800', row: 'border-purple-100' },
  }
  const c = colors[color]
  return (
    <div className={`border rounded-xl p-4 ${c.card}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-semibold text-sm ${c.title}`}>{label}</h3>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.count}`}>{clients.length}</span>
      </div>
      {clients.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">None</p>
      ) : (
        <ul className="space-y-2">
          {clients.map(r => (
            <li key={r.id} className={`border-t ${c.row} pt-2`}>
              <p className="text-sm font-medium text-gray-800">{r.client_name}</p>
              <p className="text-xs text-gray-500">{r.location} &bull; {r.phone}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatCard({ label, value, color, href }: {
  label: string; value: number; color: 'blue' | 'green' | 'red' | 'orange'; href: string
}) {
  const colors = {
    blue: '',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  }
  const isBlue = color === 'blue'
  return (
    <Link
      href={href}
      className={`border rounded-xl p-5 text-center hover:shadow-md transition-shadow block ${isBlue ? 'text-white' : colors[color]}`}
      style={isBlue ? { backgroundColor: 'var(--brand-blue)', borderColor: 'var(--brand-blue-dark)' } : undefined}
    >
      <div className="text-4xl font-bold">{value}</div>
      <div className="text-sm mt-1 leading-tight">{label}</div>
    </Link>
  )
}
