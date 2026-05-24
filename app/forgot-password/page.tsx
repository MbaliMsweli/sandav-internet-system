'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4" style={{ backgroundColor: 'var(--brand-navy)' }}>
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Forgot Password</h1>
          <p className="text-sm text-gray-500 mt-1">We'll help you get back in</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  placeholder="Enter your username"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1595D8]"
                />
              </div>
              <button type="submit"
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--brand-navy)' }}>
                Submit
              </button>
              <p className="text-center text-sm text-gray-500">
                <Link href="/login" className="text-[#1595D8] hover:underline">Back to sign in</Link>
              </p>
            </form>
          ) : (
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center w-12 h-12 bg-blue-50 rounded-full mx-auto">
                <svg className="w-6 h-6 text-[#1595D8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-gray-800">Contact your administrator</p>
                <p className="text-sm text-gray-500 mt-2">
                  Please contact your Sandav Digital administrator and ask them to reset the password for account{' '}
                  <span className="font-medium text-gray-700">@{username}</span>.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  They can reset it from the <span className="font-medium">Users</span> page.
                </p>
              </div>
              <Link href="/login"
                className="block w-full py-2.5 rounded-lg text-sm font-semibold text-white text-center"
                style={{ backgroundColor: 'var(--brand-navy)' }}>
                Back to Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
