'use client'
import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'

type User = {
  id: number
  name: string
  username: string
  role: string
  created_at: string
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 012.05-3.375M6.228 6.228A9.97 9.97 0 0112 5c4.477 0 8.268 2.943 9.542 7a9.97 9.97 0 01-4.254 5.284M3 3l18 18" />
    </svg>
  )
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [role, setRole] = useState<'staff' | 'admin'>('staff')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [resetId, setResetId] = useState<number | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [resetSaving, setResetSaving] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    try {
      const token = localStorage.getItem('sandav_token') ?? ''
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(base64))
      setCurrentUserId(payload.id ?? null)
      setIsAdmin(payload.role === 'admin')
    } catch {}
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch('/api/users')
      setUsers(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), username: username.trim(), password, role }),
      })
      setSuccess(`${name} has been added successfully.`)
      setName('')
      setUsername('')
      setPassword('')
      setConfirmPassword('')
      setRole('staff')
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add user')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetPassword(id: number) {
    if (resetPassword.length < 6) { setError('Password must be at least 6 characters'); return }
    setResetSaving(true)
    setError('')
    try {
      await apiFetch(`/api/users/${id}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      setSuccess('Password reset successfully.')
      setResetId(null)
      setResetPassword('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setResetSaving(false)
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete user')
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Staff Accounts</h1>

      {/* Add user form — admin only */}
      {isAdmin && <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-semibold text-gray-700 mb-4">Add New Staff Member</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="e.g. John Dlamini"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1595D8]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
              required
              placeholder="e.g. john"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1595D8]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#1595D8]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                placeholder="Re-enter password"
                className={`w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#1595D8] ${confirmPassword && confirmPassword !== password ? 'border-red-400' : 'border-gray-300'}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                <EyeIcon open={showConfirm} />
              </button>
            </div>
            {confirmPassword && confirmPassword !== password && (
              <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value as 'staff' | 'admin')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1595D8] bg-white"
            >
              <option value="staff">Staff — can use the system, cannot manage users</option>
              <option value="admin">Admin — full access, can add and remove users</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <button
            type="submit"
            disabled={saving}
            className="btn-brand px-6 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Account'}
          </button>
        </form>
      </div>}

      {/* Users list */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-700">Current Staff ({users.length})</h2>
        </div>
        {loading ? (
          <p className="px-6 py-4 text-sm text-gray-400">Loading...</p>
        ) : users.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-400">No staff accounts yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {users.map(u => (
              <li key={u.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800">{u.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${u.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                      {u.role === 'admin' ? 'Admin' : 'Staff'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">@{u.username}</p>
                </div>
                {u.id === currentUserId ? (
                  <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">You</span>
                ) : !isAdmin ? null : deleteConfirm === u.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Remove {u.name}?</span>
                    <button onClick={() => handleDelete(u.id)} className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg font-medium hover:bg-red-600">Yes</button>
                    <button onClick={() => setDeleteConfirm(null)} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-medium hover:bg-gray-200">Cancel</button>
                  </div>
                ) : resetId === u.id ? (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        value={resetPassword}
                        onChange={e => setResetPassword(e.target.value)}
                        placeholder="New password"
                        className="border border-gray-300 rounded-lg px-2 py-1 pr-7 text-xs w-36 focus:outline-none focus:ring-1 focus:ring-[#1595D8]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowResetPassword(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        <EyeIcon open={showResetPassword} />
                      </button>
                    </div>
                    <button onClick={() => handleResetPassword(u.id)} disabled={resetSaving} className="text-xs bg-[#1595D8] text-white px-3 py-1 rounded-lg font-medium hover:bg-[#1178b5] disabled:opacity-50">{resetSaving ? '...' : 'Save'}</button>
                    <button onClick={() => { setResetId(null); setResetPassword(''); setShowResetPassword(false) }} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-lg font-medium hover:bg-gray-200">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setResetId(u.id); setDeleteConfirm(null) }} className="text-xs text-[#1595D8] hover:underline font-medium">Reset password</button>
                    <button onClick={() => { setDeleteConfirm(u.id); setResetId(null) }} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
