'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, apiUrl } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Request {
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

// ── Activation logic (mirrors backend getMissingFields) ───────────────────────

const REQUIRED_TO_ACTIVATE = [
  'client_name', 'phone', 'location', 'internet_type', 'monthly_fee',
  'install_status', 'payment_status',
  'payment_reference', 'pay_date', 'device_name', 'mac_address',
] as const

const FIELD_LABELS: Record<string, string> = {
  client_name: 'Client Name', phone: 'Phone Number', location: 'Location',
  internet_type: 'Internet Type', monthly_fee: 'Monthly Fee',
  install_status: 'Installation Status', payment_status: 'Installation Fee Paid',
  payment_reference: 'Payment Reference', pay_date: 'Payment Date',
  device_name: 'Device Name', mac_address: 'MAC Address',
}

function getMissingFields(r: Request): string[] {
  const missing: string[] = []
  for (const f of REQUIRED_TO_ACTIVATE) {
    if (!r[f as keyof Request]) missing.push(FIELD_LABELS[f])
  }
  if (r.install_status !== 'Installed') missing.push('Installation must be marked as Installed')
  if (r.payment_status !== 'Paid') missing.push('Installation fee must be marked as Paid')
  return [...new Set(missing)]
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Installed: 'bg-blue-100 text-blue-800',
  Complete: 'bg-green-100 text-green-800',
}

// ── Field component ───────────────────────────────────────────────────────────

function Field({ label, name, type = 'text', value, onChange, required, placeholder }: {
  label: string; name: string; type?: string; value: string
  onChange?: (v: string) => void; required?: boolean; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
      <input name={name} type={type} value={value} required={required} placeholder={placeholder}
        onChange={e => onChange?.(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RequestsPage() {
  const router = useRouter()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ client_name: '', phone: '', location: '', call_date: '', internet_type: '', install_readiness: '', preferred_install_date: '' })
  const [newSaving, setNewSaving] = useState(false)
  const [newError, setNewError] = useState('')
  const [selected, setSelected] = useState<Request | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [installReadiness, setInstallReadiness] = useState('')
  const [saving, setSaving] = useState(false)
  const [activating, setActivating] = useState(false)
  const [msg, setMsg] = useState('')
  const [confirmActivate, setConfirmActivate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [history, setHistory] = useState<{ id: number; user_name: string; action: string; created_at: string }[]>([])

  const reload = useCallback(() => {
    apiFetch('/api/requests').then(setRequests).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  function openDetail(r: Request) {
    setSelected(r)
    setInstallReadiness(r.install_readiness ?? '')
    setEditForm({
      client_name: r.client_name, phone: r.phone, location: r.location,
      call_date: r.call_date, preferred_install_date: r.preferred_install_date ?? '',
      internet_type: r.internet_type, install_readiness: r.install_readiness ?? '',
      install_status: r.install_status, installation_date: r.installation_date ?? '',
      monthly_fee: String(r.monthly_fee ?? ''), install_fee: String(r.install_fee ?? ''),
      payment_status: r.payment_status,
      payment_reference: r.payment_reference ?? '',
      pay_date: r.pay_date ?? '',
      device_name: r.device_name ?? '',
      mac_address: r.mac_address ?? '',
      rocket_no: r.rocket_no ?? '',
      litebeam_ip: r.litebeam_ip ?? '',
      router_ip: r.router_ip ?? '',
    })
    setMsg('')
    setConfirmActivate(false)
    setConfirmDelete(false)
    setHistory([])
    apiFetch(`/api/audit/requests/${r.id}`).then(setHistory).catch(() => {})
  }

  function closeDetail() { setSelected(null) }

  function setEF(k: string, v: string) { setEditForm(f => ({ ...f, [k]: v })) }

  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNewSaving(true)
    setNewError('')
    try {
      await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      })
      setShowNew(false)
      setNewForm({ client_name: '', phone: '', location: '', call_date: '', internet_type: '', install_readiness: '', preferred_install_date: '' })
      reload()
    } catch (err: unknown) {
      setNewError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setNewSaving(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    setMsg('')
    try {
      await apiFetch(`/api/requests/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, install_readiness: installReadiness }),
      })
      closeDetail()
      reload()
    } catch {
      setMsg('Error saving. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    setMsg('')
    try {
      await apiFetch(`/api/requests/${selected.id}`, { method: 'DELETE' })
      closeDetail()
      reload()
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : 'Could not delete. Please try again.')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  async function handleActivate() {
    if (!selected) return
    setActivating(true)
    try {
      await apiFetch(`/api/requests/${selected.id}/promote`, { method: 'POST' })
      closeDetail()
      reload()
      router.push('/clients')
    } catch {
      setActivating(false)
      setMsg('Could not activate. Please check all fields are filled.')
    }
  }

  const active = requests.filter(r => !r.moved_to_permanent)
  const done = requests.filter(r => r.moved_to_permanent)

  const selectedMissing = selected ? getMissingFields(selected) : []
  const canActivate = selected ? selectedMissing.length === 0 && !selected.moved_to_permanent : false
  const showInstallSections = installReadiness === 'Ready To Install'

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Requests</h1>
        <div className="flex items-center gap-2">
          <a href={apiUrl('/api/export/requests')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Download CSV
          </a>
          <button onClick={() => { setShowNew(true); setNewError('') }}
            className="btn-brand px-5 py-2 rounded-lg font-medium transition-colors">
            + New Request
          </button>
        </div>
      </div>

      {active.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No pending requests</p>
          <p className="text-sm mt-1">Click <strong>+ New Request</strong> to add one</p>
        </div>
      )}

      {/* Active requests list */}
      <div className="space-y-3">
        {active.map(r => {
          const notReady = r.install_readiness === 'Pending Coverage' || r.install_readiness === 'Not Yet Ready'
          const missing = notReady ? [] : getMissingFields(r)
          const canAct = !notReady && missing.length === 0
          return (
            <button key={r.id} onClick={() => openDetail(r)}
              className="block w-full text-left bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{r.client_name}</span>
                    <span className="text-xs text-gray-400">{r.request_no}</span>
                    {r.install_readiness === 'Pending Coverage' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">Pending Coverage</span>
                    ) : notReady ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">{r.install_readiness}</span>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.install_status] ?? 'bg-gray-100 text-gray-600'}`}>{r.install_status}</span>
                    )}
                    {canAct && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">Ready to Activate</span>}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{r.phone} &bull; {r.location} &bull; {r.internet_type}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm text-gray-400">{r.call_date}</p>
                  {!canAct && !notReady && missing.length > 0 && <p className="text-xs text-orange-500 mt-1">{missing.length} field{missing.length !== 1 ? 's' : ''} missing</p>}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Completed requests */}
      {done.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 font-medium">
            Show {done.length} completed request{done.length !== 1 ? 's' : ''}
          </summary>
          <div className="space-y-2 mt-3">
            {done.map(r => (
              <button key={r.id} onClick={() => openDetail(r)}
                className="block w-full text-left bg-gray-50 border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow opacity-70">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-700">{r.client_name}</span>
                    <span className="text-xs text-gray-400 ml-2">{r.request_no}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Activated</span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{r.phone} &bull; {r.location}</p>
              </button>
            ))}
          </div>
        </details>
      )}

      {/* ── New Request Modal ─────────────────────────────────────────────── */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-800">New Request</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleNewSubmit} className="overflow-y-auto p-5 space-y-4">
              {newError && <p className="text-red-500 text-sm">{newError}</p>}
              <Field label="Client Full Name" name="client_name" value={newForm.client_name} onChange={v => setNewForm(f => ({ ...f, client_name: v }))} required />
              <Field label="Phone Number" name="phone" type="tel" value={newForm.phone} onChange={v => setNewForm(f => ({ ...f, phone: v }))} required />
              <Field label="Location" name="location" value={newForm.location} onChange={v => setNewForm(f => ({ ...f, location: v }))} required placeholder="e.g. Zone 3, Mthatha" />
              <Field label="Call Date" name="call_date" type="date" value={newForm.call_date} onChange={v => setNewForm(f => ({ ...f, call_date: v }))} required />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Internet Type <span className="text-red-500">*</span></label>
                <select name="internet_type" required value={newForm.internet_type} onChange={e => setNewForm(f => ({ ...f, internet_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select type...</option>
                  <option>Home</option>
                  <option>Business</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Installation Readiness</label>
                <select name="install_readiness" value={newForm.install_readiness} onChange={e => setNewForm(f => ({ ...f, install_readiness: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select...</option>
                  <option>Pending Coverage</option>
                  <option>Ready To Install</option>
                  <option>Not Yet Ready</option>
                </select>
              </div>
              <Field label="Preferred Install Date" name="preferred_install_date" type="date" value={newForm.preferred_install_date} onChange={v => setNewForm(f => ({ ...f, preferred_install_date: v }))} />
              <div className="flex gap-3 pt-2 pb-1 shrink-0">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={newSaving} className="flex-1 py-3 rounded-xl btn-brand text-sm font-semibold disabled:opacity-50">{newSaving ? 'Saving…' : 'Save Request'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Request Detail Modal ──────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{selected.client_name}</h2>
                <p className="text-xs text-gray-400">{selected.request_no}</p>
              </div>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">

              {!!selected.moved_to_permanent && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 font-medium">
                  This client has been activated and moved to Active Clients.
                </div>
              )}

              {canActivate && !confirmActivate && (
                <div className="bg-green-50 border-2 border-green-400 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-green-700">All fields filled — ready to activate!</p>
                    <p className="text-sm text-green-600 mt-0.5">Click Activate Client to move them to Active Clients.</p>
                  </div>
                  <button onClick={() => setConfirmActivate(true)} className="shrink-0 bg-green-600 text-white px-5 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors">
                    Activate Client
                  </button>
                </div>
              )}

              {confirmActivate && (
                <div className="bg-green-50 border-2 border-green-400 rounded-xl p-4 text-center">
                  <p className="font-semibold text-green-800 mb-3">Are you sure you want to activate {selected.client_name}?</p>
                  <div className="flex gap-3 justify-center">
                    <button type="button" onClick={handleActivate} disabled={activating} className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
                      {activating ? 'Activating...' : 'Yes, Activate'}
                    </button>
                    <button type="button" onClick={() => setConfirmActivate(false)} className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors">Cancel</button>
                  </div>
                </div>
              )}

              {selectedMissing.length > 0 && !selected.moved_to_permanent && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                  <p className="font-semibold text-orange-700 mb-2">Still needed before activation:</p>
                  <ul className="flex flex-wrap gap-2">
                    {selectedMissing.map(f => <li key={f} className="bg-orange-100 text-orange-700 text-xs px-3 py-1 rounded-full">{f}</li>)}
                  </ul>
                </div>
              )}

              <form onSubmit={handleSave} className="bg-white border border-gray-200 rounded-2xl p-4">
                <h3 className="font-semibold text-gray-700 mb-4 text-xs uppercase tracking-wide">Client Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Client Full Name" name="client_name" value={editForm.client_name ?? ''} onChange={v => setEF('client_name', v)} required />
                  <Field label="Phone Number" name="phone" type="tel" value={editForm.phone ?? ''} onChange={v => setEF('phone', v)} required />
                  <Field label="Location" name="location" value={editForm.location ?? ''} onChange={v => setEF('location', v)} required />
                  <Field label="Call Date" name="call_date" type="date" value={editForm.call_date ?? ''} onChange={v => setEF('call_date', v)} required />
                  <Field label="Preferred Install Date" name="preferred_install_date" type="date" value={editForm.preferred_install_date ?? ''} onChange={v => setEF('preferred_install_date', v)} />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Internet Type <span className="text-red-500">*</span></label>
                    <select name="internet_type" value={editForm.internet_type ?? ''} onChange={e => setEF('internet_type', e.target.value)} required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select type...</option>
                      <option>Home</option>
                      <option>Business</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Installation Readiness</label>
                    <select name="install_readiness" value={installReadiness} onChange={e => { setInstallReadiness(e.target.value); setEF('install_readiness', e.target.value) }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select...</option>
                      <option>Pending Coverage</option>
                      <option>Ready To Install</option>
                      <option>Not Yet Ready</option>
                    </select>
                  </div>
                </div>

                {!showInstallSections && installReadiness && installReadiness !== 'Ready To Install' && (
                  <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
                    {installReadiness === 'Pending Coverage'
                      ? 'This client is waiting for coverage. No installation details needed yet.'
                      : 'This client is not yet ready to install. No installation details needed yet.'}
                  </div>
                )}

                {showInstallSections && (
                  <>
                    <h3 className="font-semibold text-gray-700 mb-4 mt-6 text-xs uppercase tracking-wide">Installation</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Installation Status <span className="text-red-500">*</span></label>
                        <select name="install_status" value={editForm.install_status ?? 'Pending'} onChange={e => setEF('install_status', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option>Pending</option>
                          <option>Installed</option>
                        </select>
                      </div>
                      <Field label="Installation Date" name="installation_date" type="date" value={editForm.installation_date ?? ''} onChange={v => setEF('installation_date', v)} />
                      <Field label="Monthly Fee (R)" name="monthly_fee" type="number" value={editForm.monthly_fee ?? ''} onChange={v => setEF('monthly_fee', v)} placeholder="e.g. 399" />
                    </div>
                    <h3 className="font-semibold text-gray-700 mb-1 mt-6 text-xs uppercase tracking-wide">Installation Fee Payment</h3>
                    <p className="text-xs text-gray-400 mb-4">Fill once the client has paid the R1,900 installation fee</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Installation Fee (R)" name="install_fee" type="number" value={editForm.install_fee ?? '1900'} onChange={v => setEF('install_fee', v)} />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Has Client Paid? <span className="text-red-500">*</span></label>
                        <select name="payment_status" value={editForm.payment_status ?? 'Unpaid'} onChange={e => setEF('payment_status', e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option>Unpaid</option>
                          <option>Paid</option>
                        </select>
                      </div>
                    </div>

                    <h3 className="font-bold text-red-600 mb-1 mt-6 text-xs uppercase tracking-wide">Job Card Details</h3>
                    <p className="text-xs text-gray-400 mb-4">All fields required before client can be activated</p>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Device Name" name="device_name" value={editForm.device_name ?? ''} onChange={v => setEF('device_name', v)} required placeholder="e.g. MikroTik hAP" />
                      <Field label="MAC Address" name="mac_address" value={editForm.mac_address ?? ''} onChange={v => setEF('mac_address', v)} required placeholder="e.g. AA:BB:CC:DD:EE:FF" />
                      <Field label="Payment Reference" name="payment_reference" value={editForm.payment_reference ?? ''} onChange={v => setEF('payment_reference', v)} required placeholder="e.g. POP12345" />
                      <Field label="Payment Date" name="pay_date" type="date" value={editForm.pay_date ?? ''} onChange={v => setEF('pay_date', v)} required />
                    </div>
                  </>
                )}

                {msg && <p className={`mt-4 text-sm font-medium ${msg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{msg}</p>}

                <button type="submit" disabled={saving || selected.moved_to_permanent === 1}
                  className="mt-6 w-full btn-brand py-3 rounded-lg font-semibold transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>

                {!selected.moved_to_permanent && (
                  confirmDelete ? (
                    <div className="mt-3 bg-red-50 border-2 border-red-300 rounded-xl p-4 text-center">
                      <p className="font-semibold text-red-800 mb-3">Delete this request for {selected.client_name}? This cannot be undone.</p>
                      <div className="flex gap-3 justify-center">
                        <button type="button" onClick={handleDelete} disabled={deleting} className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                          {deleting ? 'Deleting...' : 'Yes, Delete'}
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(false)} className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)}
                      className="mt-3 w-full bg-white border border-red-300 text-red-600 py-2.5 rounded-lg font-medium hover:bg-red-50 transition-colors">
                      Delete Request
                    </button>
                  )
                )}
              </form>

              {history.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">History</p>
                  <ul className="space-y-2">
                    {history.map(h => (
                      <li key={h.id} className="flex items-start gap-2">
                        <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0 mt-1.5" />
                        <span className="text-xs text-gray-600">
                          <span className="font-medium text-gray-700">{h.user_name}</span>
                          {' '}{h.action} this record{' '}
                          <span className="text-gray-400">&mdash; {new Date(h.created_at).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
