'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NavBar() {
  const router = useRouter()
  const pathname = usePathname()
  const [userName, setUserName] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const publicPages = ['/login', '/signup', '/forgot-password']
    const cleanPath = pathname.replace(/\/$/, '')
    const token = localStorage.getItem('sandav_token')
    if (!token) {
      if (!publicPages.some(p => cleanPath.endsWith(p))) router.replace('/login')
      return
    }
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      const payload = JSON.parse(atob(base64))
      setUserName(payload.name ?? null)
      setIsAdmin(payload.role === 'admin')
    } catch {}
  }, [pathname, router])

  const publicPages = ['/login', '/signup', '/forgot-password']
  const cleanPath = pathname.replace(/\/$/, '')
  if (publicPages.some(p => cleanPath.endsWith(p))) return null

  function logout() {
    localStorage.removeItem('sandav_token')
    localStorage.removeItem('sandav_user')
    router.replace('/login')
  }

  return (
    <nav className="text-white shadow-md" style={{ backgroundColor: 'var(--brand-navy)' }}>
      <div className="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/" className="font-bold text-lg tracking-tight">
          <span style={{ color: '#1595D8' }}>Sandav</span> Digital
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/requests" className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:bg-white/10">
            Requests
          </Link>
          <Link href="/clients" className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:bg-white/10">
            Clients
          </Link>
          <Link href="/billing" className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:bg-white/10">
            Billing
          </Link>
          <Link href="/import" className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:bg-white/10">
            Import
          </Link>
          {isAdmin && (
            <Link href="/users" className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors hover:bg-white/10">
              Users
            </Link>
          )}
          <div className="ml-3 pl-3 border-l border-white/20 flex items-center gap-2">
            {userName && (
              <span className="text-xs text-white/70 hidden sm:block">{userName}</span>
            )}
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-full text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
