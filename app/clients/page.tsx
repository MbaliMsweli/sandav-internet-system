'use client'
import { useState, useEffect, useCallback } from 'react'
import { apiFetch, apiUrl } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Client {
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

// ── Add-client form helpers ───────────────────────────────────────────────────

const EMPTY_FORM: Record<string, string> = {
  client_name: '', phone: '', location: '', internet_type: '',
  monthly_fee: '', device_name: '', payment_reference: '',
  pay_date: '', rocket_no: '', mac_address: '', litebeam_ip: '', router_ip: '', client_status: 'Active',
}

const SHEET_COLUMNS: (string | null)[] = [
  'client_name', 'device_name', 'phone', 'payment_reference',
  'internet_type', 'monthly_fee', 'pay_date', 'location',
  'client_status', 'rocket_no', 'litebeam_ip', 'router_ip', 'mac_address',
]

const HEADER_MAP: Record<string, string> = {
  'client full name': 'client_name', 'full name': 'client_name', 'client name': 'client_name', 'name': 'client_name',
  'phone number': 'phone', 'phone': 'phone', 'contact': 'phone', 'mobile': 'phone',
  'client location': 'location', 'location': 'location', 'address': 'location', 'area': 'location',
  'internet type': 'internet_type', 'package': 'internet_type',
  'monthly fee': 'monthly_fee', 'fee': 'monthly_fee', 'amount': 'monthly_fee',
  'device name': 'device_name', 'device': 'device_name', 'equipment': 'device_name',
  'payment reference': 'payment_reference', 'reference': 'payment_reference', 'ref': 'payment_reference',
  'pay date': 'pay_date', 'payment date': 'pay_date', 'date paid': 'pay_date',
  'rocket no.': 'rocket_no', 'rocket no': 'rocket_no', 'rocket': 'rocket_no', 'rocket number': 'rocket_no',
  'router no.': 'rocket_no', 'router no': 'rocket_no', 'router number': 'rocket_no',
  'litebeam ip address': 'litebeam_ip', 'litebeam ip': 'litebeam_ip', 'litebeam': 'litebeam_ip',
  'router ip address': 'router_ip', 'router ip': 'router_ip',
  'mac address': 'mac_address', 'mac': 'mac_address',
  'client status': 'client_status', 'status': 'client_status',
}

function parseSheetRow(text: string): Record<string, string> {
  const lines = text.trim().split(/\r?\n/)
  const result: Record<string, string> = { ...EMPTY_FORM }
  if (lines.length >= 2) {
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase())
    const values  = lines[lines.length - 1].split('\t').map(v => v.trim())
    headers.forEach((h, i) => {
      const field = HEADER_MAP[h]
      if (field && values[i]) result[field] = values[i]
    })
  } else {
    const values = lines[0].split('\t').map(v => v.trim())
    values.forEach((v, i) => {
      const field = SHEET_COLUMNS[i]
      if (!field || !v) return
      if (field === 'phone') result.phone = v.replace(/\s+/g, '')
      else if (field === 'internet_type') result.internet_type = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()
      else if (field === 'monthly_fee') result.monthly_fee = v.replace(/[R\s,]/g, '')
      else if (field === 'client_status') result.client_status = v.charAt(0).toUpperCase() + v.slice(1).toLowerCase()
      else result[field] = v
    })
  }
  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function needsJobCard(c: Client) { return !c.payment_reference || !c.device_name }

function missingJobCardFields(c: Client): string[] {
  const m: string[] = []
  if (!c.payment_reference) m.push('Payment Reference')
  if (!c.device_name) m.push('Device Name')
  return m
}

function needsNetworkDetails(c: Client) { return !c.rocket_no || !c.litebeam_ip || !c.router_ip }

function missingNetworkFields(c: Client): string[] {
  const m: string[] = []
  if (!c.rocket_no) m.push('Rocket No.')
  if (!c.litebeam_ip) m.push('LiteBeam IP')
  if (!c.router_ip) m.push('Router IP')
  return m
}

function matches(c: Client, q: string) {
  const s = q.toLowerCase()
  return [c.client_name, c.phone, c.location, c.internet_type, c.payment_reference, c.device_name, c.rocket_no, c.litebeam_ip, c.router_ip]
    .some(v => v?.toLowerCase().includes(s))
}

// ── Field component (shared by add + edit forms) ──────────────────────────────

function Field({ label, name, type = 'text', value, onChange, required, placeholder, mono }: {
  label: string; name: string; type?: string; value: string
  onChange: (v: string) => void; required?: boolean; placeholder?: string; mono?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}{required && <span className="text-red-400"> *</span>}</label>
      <input
        name={name} type={type} value={value} required={required} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function SelectField({ label, name, value, onChange, options }: {
  label: string; name: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
      <select name={name} value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState<Record<string, string>>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [selected, setSelected] = useState<Client | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState('')
  const [history, setHistory] = useState<{ id: number; user_name: string; action: string; created_at: string }[]>([])

  const reload = useCallback(() => {
    apiFetch('/api/clients').then(setClients).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  function openDetail(c: Client) {
    setSelected(c)
    setEditForm({
      client_name: c.client_name, phone: c.phone, location: c.location,
      internet_type: c.internet_type, monthly_fee: String(c.monthly_fee ?? ''),
      client_status: c.client_status,
      payment_reference: c.payment_reference ?? '', pay_date: c.pay_date ?? '',
      device_name: c.device_name ?? '', rocket_no: c.rocket_no ?? '',
      litebeam_ip: c.litebeam_ip ?? '', router_ip: c.router_ip ?? '',
      mac_address: c.mac_address ?? '',
    })
    setEditMsg('')
    setConfirmDelete(false)
    setDeleteMsg('')
    setHistory([])
    apiFetch(`/api/audit/clients/${c.id}`).then(setHistory).catch(() => {})
  }

  function closeDetail() { setSelected(null); setConfirmDelete(false) }

  function setField(k: string, v: string) { setForm(f => ({ ...f, [k]: v })) }
  function setEditField(k: string, v: string) { setEditForm(f => ({ ...f, [k]: v })) }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    setSaving(true)
    try {
      await apiFetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setShowAdd(false)
      setForm(EMPTY_FORM)
      reload()
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setEditSaving(true)
    setEditMsg('')
    try {
      await apiFetch(`/api/clients/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      closeDetail()
      reload()
    } catch (err: unknown) {
      setEditMsg(err instanceof Error ? err.message : 'Error saving.')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (!selected) return
    setDeleting(true)
    setDeleteMsg('')
    try {
      await apiFetch(`/api/clients/${selected.id}`, { method: 'DELETE' })
      closeDetail()
      reload()
    } catch (err: unknown) {
      setDeleteMsg(err instanceof Error ? err.message : 'Could not delete. Please try again.')
      setConfirmDelete(false)
    } finally {
      setDeleting(false)
    }
  }

  const q = search.trim()
  const filtered = q ? clients.filter(c => matches(c, q)) : clients
  const active = filtered.filter(c => c.client_status === 'Active')
  const inactive = filtered.filter(c => c.client_status !== 'Active')
  const pendingJobCard = active.filter(needsJobCard)
  const pendingNetwork = active.filter(c => !needsJobCard(c) && needsNetworkDetails(c))
  const complete = active.filter(c => !needsJobCard(c) && !needsNetworkDetails(c))

  if (loading) return <div className="text-center py-16 text-gray-400">Loading…</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-800">Active Clients</h1>
        <div className="flex items-center gap-2">
          <a href={apiUrl('/api/export/clients')} className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Download CSV
          </a>
          <span className="text-sm text-gray-400">{clients.filter(c => c.client_status === 'Active').length} client{clients.filter(c => c.client_status === 'Active').length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <button onClick={() => { setShowAdd(true); setFormError('') }}
        className="btn-brand w-full py-3 rounded-xl text-sm font-bold mb-5 flex items-center justify-center gap-2">
        <span className="text-lg leading-none">+</span> Add Client Manually
      </button>

      {/* Alerts */}
      {!q && pendingJobCard.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-2 flex items-center gap-3">
          <span className="text-orange-500 text-xl shrink-0">&#9888;</span>
          <p className="text-sm text-orange-700 font-medium">
            {pendingJobCard.length} client{pendingJobCard.length !== 1 ? 's are' : ' is'} waiting for job card details
          </p>
        </div>
      )}
      {!q && pendingNetwork.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="text-blue-400 text-xl shrink-0">&#9432;</span>
          <p className="text-sm text-blue-700 font-medium">
            {pendingNetwork.length} client{pendingNetwork.length !== 1 ? 's are' : ' is'} missing network details (Rocket No., LiteBeam IP, Router IP)
          </p>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input type="text" placeholder="Search by name, phone, payment reference, IP address, MAC, location..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none" />
        {q && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>}
      </div>

      {q && <p className="text-sm text-gray-500 mb-3">{filtered.length === 0 ? 'No clients found' : `${filtered.length} result${filtered.length !== 1 ? 's' : ''} for "${q}"`}</p>}
      {clients.length === 0 && <div className="text-center py-16 text-gray-400"><p className="text-lg">No active clients yet</p><p className="text-sm mt-1">Clients appear here once a request is activated</p></div>}

      {/* Awaiting job card */}
      {!q && pendingJobCard.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">Awaiting Job Card</p>
          <div className="space-y-3">{pendingJobCard.map(c => <ClientCard key={c.id} c={c} onOpen={openDetail} />)}</div>
        </div>
      )}

      {/* Network details pending */}
      {!q && pendingNetwork.length > 0 && (
        <div className="mb-6">
          <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">Network Details Pending</p>
          <div className="space-y-3">{pendingNetwork.map(c => <ClientCard key={c.id} c={c} onOpen={openDetail} />)}</div>
        </div>
      )}

      {/* Complete active clients */}
      {(!q ? complete : active).length > 0 && (
        <div>
          {!q && (pendingJobCard.length > 0 || pendingNetwork.length > 0) && complete.length > 0 && <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Complete</p>}
          <div className="space-y-3">{(!q ? complete : active).map(c => <ClientCard key={c.id} c={c} onOpen={openDetail} />)}</div>
        </div>
      )}

      {/* Inactive clients */}
      {inactive.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 font-medium">
            Show {inactive.length} inactive client{inactive.length !== 1 ? 's' : ''}
          </summary>
          <div className="space-y-2 mt-3">
            {inactive.map(c => (
              <button key={c.id} onClick={() => openDetail(c)}
                className="block w-full text-left bg-gray-50 border border-gray-100 rounded-xl p-4 hover:shadow-sm opacity-60">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-700">{c.client_name}</span>
                    <p className="text-sm text-gray-400">{c.phone} &bull; {c.location}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">{c.client_status}</span>
                </div>
              </button>
            ))}
          </div>
        </details>
      )}

      {/* ── Add Client Modal ──────────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <h2 className="text-lg font-bold text-gray-800">Add Client Manually</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleAdd} className="overflow-y-auto p-5 space-y-4">
              {formError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-medium">{formError}</div>}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Paste a row from Google Sheets</label>
                <textarea rows={2} placeholder="In Google Sheets: select header row + client row, Ctrl+C, paste here"
                  className="w-full border border-blue-200 bg-blue-50 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none placeholder-gray-400"
                  onPaste={e => { e.preventDefault(); const text = e.clipboardData.getData('text'); if (text.includes('\t')) { setForm(parseSheetRow(text)); setFormError(''); e.currentTarget.value = '' } }} />
                <p className="text-xs text-gray-400 mt-1">Tip: select both the header row and the client row (2 rows) before copying.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><Field label="Client Full Name" name="client_name" value={form.client_name} onChange={v => setField('client_name', v)} required /></div>
                <Field label="Phone Number" name="phone" value={form.phone} onChange={v => setField('phone', v)} required />
                <Field label="Location" name="location" value={form.location} onChange={v => setField('location', v)} />
                <SelectField label="Internet Type" name="internet_type" value={form.internet_type} onChange={v => setField('internet_type', v)} options={['', 'Home', 'Business']} />
                <Field label="Monthly Fee (R)" name="monthly_fee" type="number" value={form.monthly_fee} onChange={v => setField('monthly_fee', v)} placeholder="e.g. 350" />
                <Field label="Device Name" name="device_name" value={form.device_name} onChange={v => setField('device_name', v)} placeholder="e.g. LiteBeam 5AC" />
                <Field label="Payment Reference" name="payment_reference" value={form.payment_reference} onChange={v => setField('payment_reference', v)} placeholder="e.g. ABCD1234" />
                <Field label="Pay Date" name="pay_date" value={form.pay_date} onChange={v => setField('pay_date', v)} placeholder="e.g. 2024-01-15" />
                <Field label="Rocket No." name="rocket_no" value={form.rocket_no} onChange={v => setField('rocket_no', v)} placeholder="e.g. R-042" />
                <Field label="LiteBeam IP" name="litebeam_ip" value={form.litebeam_ip} onChange={v => setField('litebeam_ip', v)} placeholder="e.g. 192.168.1.10" mono />
                <Field label="Router IP Address" name="router_ip" value={form.router_ip} onChange={v => setField('router_ip', v)} placeholder="e.g. 192.168.0.1" mono />
                <Field label="MAC Address" name="mac_address" value={form.mac_address} onChange={v => setField('mac_address', v)} placeholder="e.g. AA:BB:CC:DD:EE:FF" mono />
                <SelectField label="Client Status" name="client_status" value={form.client_status} onChange={v => setField('client_status', v)} options={['Active', 'Inactive']} />
              </div>
              <div className="flex gap-3 pt-2 pb-1 shrink-0">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 rounded-xl btn-brand text-sm font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Add Client'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Client Detail Modal ───────────────────────────────────────────── */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="text-lg font-bold text-gray-800">{selected.client_name}</h2>
                <p className="text-xs text-gray-400">Active since {selected.active_since.split('T')[0]}</p>
              </div>
              <button onClick={closeDetail} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto p-5 space-y-4">

              <form onSubmit={handleSave} className="space-y-4">
                {/* Client Info */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4">
                  <h3 className="font-semibold text-gray-700 mb-4 text-xs uppercase tracking-wide">Client Info</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2"><Field label="Client Full Name" name="client_name" value={editForm.client_name ?? ''} onChange={v => setEditField('client_name', v)} required /></div>
                    <Field label="Phone Number" name="phone" type="tel" value={editForm.phone ?? ''} onChange={v => setEditField('phone', v)} required />
                    <Field label="Location" name="location" value={editForm.location ?? ''} onChange={v => setEditField('location', v)} />
                    <SelectField label="Internet Type" name="internet_type" value={editForm.internet_type ?? ''} onChange={v => setEditField('internet_type', v)} options={['Home', 'Business']} />
                    <Field label="Monthly Fee (R)" name="monthly_fee" type="number" value={editForm.monthly_fee ?? ''} onChange={v => setEditField('monthly_fee', v)} required />
                    <SelectField label="Client Status" name="client_status" value={editForm.client_status ?? 'Active'} onChange={v => setEditField('client_status', v)} options={['Active', 'Inactive', 'Suspended']} />
                  </div>
                </div>

                {/* Job Card */}
                <div className={`rounded-2xl p-4 border-2 ${(selected.payment_reference && selected.device_name) ? 'bg-white border-gray-200' : 'bg-orange-50 border-orange-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-700 text-xs uppercase tracking-wide">Job Card Details</h3>
                    {!(selected.payment_reference && selected.device_name) && <span className="text-xs bg-orange-200 text-orange-700 px-2 py-0.5 rounded-full font-medium">Pending</span>}
                  </div>
                  <p className="text-xs text-gray-400 mb-4">Fill this from the job card the technician brings back</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Payment Reference" name="payment_reference" value={editForm.payment_reference ?? ''} onChange={v => setEditField('payment_reference', v)} placeholder="e.g. SA201" />
                    <Field label="Pay Date" name="pay_date" type="date" value={editForm.pay_date ?? ''} onChange={v => setEditField('pay_date', v)} />
                    <Field label="Device Name" name="device_name" value={editForm.device_name ?? ''} onChange={v => setEditField('device_name', v)} placeholder="e.g. Rocka Feela Home" />
                    <Field label="Rocket No." name="rocket_no" value={editForm.rocket_no ?? ''} onChange={v => setEditField('rocket_no', v)} placeholder="e.g. R-042" />
                    <Field label="LiteBeam IP" name="litebeam_ip" value={editForm.litebeam_ip ?? ''} onChange={v => setEditField('litebeam_ip', v)} placeholder="e.g. 192.168.1.10" mono />
                    <Field label="Router IP Address" name="router_ip" value={editForm.router_ip ?? ''} onChange={v => setEditField('router_ip', v)} placeholder="e.g. 192.168.0.1" mono />
                    <Field label="MAC Address" name="mac_address" value={editForm.mac_address ?? ''} onChange={v => setEditField('mac_address', v)} placeholder="e.g. AA:BB:CC:DD:EE:FF" mono />
                  </div>
                </div>

                {editMsg && <p className={`text-sm font-medium ${editMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{editMsg}</p>}

                <button type="submit" disabled={editSaving} className="w-full btn-brand py-3 rounded-lg font-semibold transition-colors disabled:opacity-50">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </form>

              {confirmDelete ? (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 text-center">
                  {deleteMsg && <p className="text-sm text-red-700 font-medium mb-2">{deleteMsg}</p>}
                  <p className="font-semibold text-red-800 mb-3">Delete {selected.client_name}? This cannot be undone.</p>
                  <div className="flex gap-3 justify-center">
                    <button type="button" onClick={handleDelete} disabled={deleting} className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                      {deleting ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors">Cancel</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)}
                  className="w-full bg-white border border-red-300 text-red-600 py-2.5 rounded-lg font-medium hover:bg-red-50 transition-colors">
                  Delete Client
                </button>
              )}

              {history.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">History</p>
                  <ul className="space-y-2">
                    {history.map(h => (
                      <li key={h.id} className="flex items-start gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0 mt-1.5" />
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

// ── Client card component ─────────────────────────────────────────────────────

function ClientCard({ c, onOpen }: { c: Client; onOpen: (c: Client) => void }) {
  const jobPending = needsJobCard(c)
  const netPending = !jobPending && needsNetworkDetails(c)
  const missingJob = jobPending ? missingJobCardFields(c) : []
  const missingNet = netPending ? missingNetworkFields(c) : []

  const borderClass = jobPending ? 'bg-orange-50 border-orange-200' : netPending ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'

  return (
    <button onClick={() => onOpen(c)} className={`block w-full text-left rounded-xl p-4 hover:shadow-md transition-shadow border ${borderClass}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-800">{c.client_name}</span>
            {jobPending && <span className="text-xs px-2 py-0.5 rounded-full bg-orange-200 text-orange-800 font-medium">Job Card Pending</span>}
            {netPending && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Network Details Pending</span>}
            {!jobPending && !netPending && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Active</span>}
          </div>
          <p className="text-sm text-gray-500 mt-1">{c.phone} &bull; {c.location} &bull; {c.internet_type}</p>
          {jobPending && <p className="text-xs text-orange-600 mt-1 font-medium">Still needed: {missingJob.join(', ')}</p>}
          {netPending && <p className="text-xs text-blue-600 mt-1 font-medium">Still needed: {missingNet.join(', ')}</p>}
          {!jobPending && !netPending && (
            <div className="flex flex-wrap gap-x-3 mt-1">
              {c.payment_reference && <p className="text-xs text-gray-400">Ref: {c.payment_reference}</p>}
              {c.litebeam_ip && <p className="text-xs text-gray-400 font-mono">LiteBeam IP: {c.litebeam_ip}</p>}
              {c.router_ip && <p className="text-xs text-gray-400 font-mono">Router IP: {c.router_ip}</p>}
              {c.mac_address && <p className="text-xs text-gray-400 font-mono">MAC: {c.mac_address}</p>}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-semibold text-gray-700">R{c.monthly_fee}/mo</p>
          {c.device_name && <p className="text-xs text-gray-400 mt-1">{c.device_name}</p>}
        </div>
      </div>
    </button>
  )
}
