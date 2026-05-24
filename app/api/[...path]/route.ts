import { NextRequest, NextResponse } from 'next/server'

const BACKEND = 'http://164.92.118.103:3001'

async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname
  const search = req.nextUrl.search
  const url = `${BACKEND}${path}${search}`

  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    if (!['host', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
      headers[key] = value
    }
  })

  const body =
    req.method !== 'GET' && req.method !== 'HEAD' ? await req.text() : undefined

  const res = await fetch(url, { method: req.method, headers, body })
  const data = await res.text()

  return new NextResponse(data, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const DELETE = proxy
export const PATCH = proxy
