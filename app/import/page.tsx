'use client'
import { useState } from 'react'
import { apiFetch } from '@/lib/api'

type Tab = 'requests' | 'clients'

type ImportResult = {
  imported: number
  skipped: number
  updated?: number
  activatedClients?: number
  duplicatePhones?: string[]
  duplicateRefs?: string[]
  duplicateNetwork?: string[]
  noPhoneNames?: string[]
  parsedRows?: number
}

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>('requests')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')

  async function handleImport() {
    if (!file) return
    setLoading(true)
    setResult(null)
    setError('')
    const csv = await file.text()
    try {
      const body = await apiFetch(`/api/import/${tab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      })
      setResult(body)
      setFile(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? `Import failed: ${err.message}` : 'Import failed. Please check the file and try again.')
    } finally {
      setLoading(false)
    }
  }

  const requestCols = [
    'Client Full Name', 'Phone Number', 'Client Location', 'Call Date',
    'Internet Type', 'Installation Readiness', 'Preferred Install Date',
    'Monthly Fee', 'Installation Date', 'Installation Status',
    'Installation Fee', 'Payment Status',
  ]
  const clientCols = [
    'Client Full Name', 'Phone Number', 'Client Location', 'Internet Type',
    'Monthly Fee', 'Device Name', 'MAC Address (Router)', 'Payment Reference',
    'Pay Date', 'ROCKET NO.', 'LITEBEAM IP ADDRESS', 'ROUTER IP ADDRESS', 'Client Status',
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Import from Google Sheets</h1>
      <p className="text-sm text-gray-500 mb-6">Export your Google Sheet as CSV (File → Download → CSV), then upload it here.</p>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['requests', 'clients'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setFile(null); setResult(null); setError('') }}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
            style={tab === t ? { backgroundColor: 'var(--brand-navy)' } : undefined}
          >
            {t === 'requests' ? 'Requests Sheet' : 'Active Clients Sheet'}
          </button>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-5">
        {/* Column guide */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Expected columns in your CSV</p>
          <div className="flex flex-wrap gap-1.5">
            {(tab === 'requests' ? requestCols : clientCols).map(col => (
              <span key={col} className="text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{col}</span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Column names are matched flexibly — extra columns are ignored. Phone number is used to detect duplicates.</p>
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Select CSV file</label>
          <input
            type="file"
            accept=".csv,.xlsx,.xls,.txt,text/csv,text/plain"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null); setError('') }}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:text-white file:cursor-pointer file:bg-[#1595D8] hover:file:bg-[#1178b5]"
          />
          {file
            ? <p className="text-xs text-green-600 mt-2 font-medium">Selected: {file.name}</p>
            : <p className="text-xs text-gray-400 mt-2">No file selected — click "Choose File" above, then click Import</p>
          }
        </div>

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-green-700">Import complete!</p>
            <p className="text-sm text-green-600">
              {result.imported} new record{result.imported !== 1 ? 's' : ''} imported
              {result.updated ? `, ${result.updated} existing updated with missing details` : ''}
              {result.activatedClients ? `, ${result.activatedClients} moved to Active Clients` : ''}
            </p>
            {result.parsedRows !== undefined && (
              <p className="text-xs text-gray-400">CSV rows parsed by the system: {result.parsedRows}</p>
            )}
            {result.skipped > 0 && (
              <p className="text-sm text-gray-500">{result.skipped} skipped</p>
            )}
            {result.duplicatePhones && result.duplicatePhones.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                <p className="text-xs font-semibold text-yellow-700 mb-1">Phone numbers already in the system ({result.duplicatePhones.length}):</p>
                <p className="text-xs text-yellow-600">{result.duplicatePhones.join(', ')}</p>
              </div>
            )}
            {result.duplicateRefs && result.duplicateRefs.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mt-2">
                <p className="text-xs font-semibold text-orange-700 mb-1">Payment references already in the system ({result.duplicateRefs.length}):</p>
                <p className="text-xs text-orange-600">{result.duplicateRefs.join(', ')}</p>
              </div>
            )}
            {result.duplicateNetwork && result.duplicateNetwork.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mt-2">
                <p className="text-xs font-semibold text-purple-700 mb-1">
                  Network details already assigned to another client ({result.duplicateNetwork.length} skipped):
                </p>
                <p className="text-xs text-purple-600">{result.duplicateNetwork.join(' · ')}</p>
              </div>
            )}
            {result.noPhoneNames && result.noPhoneNames.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-2">
                <p className="text-xs font-semibold text-red-700 mb-1">
                  {result.noPhoneNames.length} row{result.noPhoneNames.length !== 1 ? 's' : ''} skipped — no phone number found:
                </p>
                <p className="text-xs text-red-600">{result.noPhoneNames.join(', ')}</p>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="btn-brand w-full py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? 'Importing...' : `Import ${tab === 'requests' ? 'Requests' : 'Active Clients'}`}
        </button>
      </div>
    </div>
  )
}
