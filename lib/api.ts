const BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('sandav_token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string> ?? {}),
      ...authHeaders(),
    },
  })
  if (res.status === 401) {
    localStorage.removeItem('sandav_token')
    localStorage.removeItem('sandav_user')
    window.location.href = '/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`)
  }
  return res.json()
}

export function apiUrl(path: string): string {
  return `${BASE}${path}`
}
