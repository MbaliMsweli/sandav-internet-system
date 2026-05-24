'use strict'
const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
require('dotenv').config()

const app = express()
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET || 'sandav_secret'

// ── Database ──────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function query(text, params) {
  const { rows } = await pool.query(text, params)
  return rows
}

let schemaReady = false
async function initSchema() {
  if (schemaReady) return
  await query(`CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY, request_no TEXT UNIQUE NOT NULL,
    client_name TEXT NOT NULL, phone TEXT NOT NULL, location TEXT DEFAULT '',
    call_date TEXT DEFAULT '', preferred_install_date TEXT, internet_type TEXT DEFAULT '',
    install_readiness TEXT, monthly_fee REAL, installation_date TEXT,
    install_status TEXT DEFAULT 'Pending', install_fee REAL,
    payment_status TEXT DEFAULT 'Unpaid', payment_reference TEXT,
    pay_date TEXT, device_name TEXT, mac_address TEXT,
    moved_to_permanent INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY, request_id INTEGER, client_name TEXT NOT NULL,
    phone TEXT NOT NULL, location TEXT DEFAULT '', internet_type TEXT DEFAULT '',
    monthly_fee REAL DEFAULT 0, device_name TEXT, mac_address TEXT,
    payment_reference TEXT, pay_date TEXT, rocket_no TEXT,
    litebeam_ip TEXT, router_ip TEXT, client_status TEXT DEFAULT 'Active',
    active_since TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE TABLE IF NOT EXISTS billing (
    id SERIAL PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id),
    month INTEGER NOT NULL, year INTEGER NOT NULL,
    payment_status TEXT DEFAULT 'Unpaid', payment_method TEXT,
    payment_reference TEXT, notes TEXT, total_paid REAL, pay_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, month, year)
  )`)
  await query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL, user_name TEXT NOT NULL,
    action TEXT NOT NULL, table_name TEXT NOT NULL, record_id INTEGER,
    details TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log (table_name, record_id)`)
  schemaReady = true
}

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '10mb' }))

function requireAuth(req, res, next) {
  const header = req.headers['authorization']
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Not logged in' })
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Session expired — please log in again' })
  }
}

async function logAction(userId, userName, action, tableName, recordId, details) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, user_name, action, table_name, record_id, details) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, userName, action, tableName, recordId, details || null]
    )
  } catch (e) { console.error('audit log failed:', e.message) }
}

// ── Public routes ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/login', async (req, res) => {
  await initSchema()
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' })
  try {
    const [user] = await query(`SELECT id, name, password_hash FROM users WHERE username = $1`, [username.trim().toLowerCase()])
    if (!user) return res.status(401).json({ error: 'Incorrect username or password' })
    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) return res.status(401).json({ error: 'Incorrect username or password' })
    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '24h' })
    res.json({ token, user: { id: user.id, name: user.name } })
  } catch (err) { console.error(err); res.status(500).json({ error: 'Login failed' }) }
})

app.post('/api/auth/signup', async (req, res) => {
  await initSchema()
  const { name, username, password } = req.body
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password are required' })
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  try {
    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username.trim().toLowerCase()])
    if (existing.length > 0) return res.status(409).json({ error: 'Username already taken' })
    const hash = await bcrypt.hash(password, 10)
    const [user] = await query(
      `INSERT INTO users (name, username, password_hash) VALUES ($1,$2,$3) RETURNING id, name, username`,
      [name.trim(), username.trim().toLowerCase(), hash]
    )
    res.status(201).json(user)
  } catch (err) { console.error(err); res.status(500).json({ error: 'Could not create account' }) }
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }))

// ── Protected routes ──────────────────────────────────────────────────────────

app.use(requireAuth)

// Clients
app.get('/api/clients', async (_req, res) => {
  try { await initSchema(); res.json(await query(`SELECT * FROM clients ORDER BY id DESC`)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/clients', async (req, res) => {
  try {
    await initSchema()
    const body = req.body
    const phone = (body.phone || '').replace(/\s+/g, '')
    if (!phone) return res.status(400).json({ error: 'Phone number is required.' })
    const ref = (body.payment_reference || '').trim()
    if (ref) { const [d] = await query(`SELECT id, client_name FROM clients WHERE payment_reference = $1 LIMIT 1`, [ref]); if (d) return res.status(409).json({ error: `Payment reference already assigned to ${d.client_name}.` }) }
    const lbIp = (body.litebeam_ip || '').trim()
    if (lbIp) { const [d] = await query(`SELECT id, client_name FROM clients WHERE litebeam_ip = $1 LIMIT 1`, [lbIp]); if (d) return res.status(409).json({ error: `LiteBeam IP already assigned to ${d.client_name}.` }) }
    const rtIp = (body.router_ip || '').trim()
    if (rtIp) { const [d] = await query(`SELECT id, client_name FROM clients WHERE router_ip = $1 LIMIT 1`, [rtIp]); if (d) return res.status(409).json({ error: `Router IP already assigned to ${d.client_name}.` }) }
    const mac = (body.mac_address || '').trim()
    if (mac) { const [d] = await query(`SELECT id, client_name FROM clients WHERE mac_address = $1 LIMIT 1`, [mac]); if (d) return res.status(409).json({ error: `MAC Address already assigned to ${d.client_name}.` }) }
    const [client] = await query(`
      INSERT INTO clients (request_id, client_name, phone, location, internet_type, monthly_fee, device_name, mac_address, payment_reference, pay_date, rocket_no, litebeam_ip, router_ip, client_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [null, (body.client_name||'').trim()||'Unknown', phone, (body.location||'').trim(), (body.internet_type||'').trim(),
       parseFloat(body.monthly_fee)||0, body.device_name?.trim()||null, mac||null, ref||null,
       body.pay_date?.trim()||null, body.rocket_no?.trim()||null, lbIp||null, rtIp||null, body.client_status||'Active'])
    const now = new Date()
    await query(`INSERT INTO billing (client_id, month, year) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [client.id, now.getMonth()+1, now.getFullYear()])
    await logAction(req.user.id, req.user.name, 'created', 'clients', client.id)
    res.status(201).json(client)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/clients/:id', async (req, res) => {
  try { const [c] = await query(`SELECT * FROM clients WHERE id = $1`, [req.params.id]); c ? res.json(c) : res.status(404).json({ error: 'Not found' }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/clients/:id', async (req, res) => {
  try {
    const numId = Number(req.params.id)
    const data = req.body
    const phone = (data.phone || '').replace(/\s+/g, '')
    const ref = (data.payment_reference || '').trim()
    if (ref) { const [d] = await query(`SELECT id, client_name FROM clients WHERE payment_reference = $1 AND id != $2 LIMIT 1`, [ref, numId]); if (d) return res.status(409).json({ error: `Payment reference already assigned to ${d.client_name}.` }) }
    const lbIp = (data.litebeam_ip || '').trim()
    if (lbIp) { const [d] = await query(`SELECT id, client_name FROM clients WHERE litebeam_ip = $1 AND id != $2 LIMIT 1`, [lbIp, numId]); if (d) return res.status(409).json({ error: `LiteBeam IP already assigned to ${d.client_name}.` }) }
    const rtIp = (data.router_ip || '').trim()
    if (rtIp) { const [d] = await query(`SELECT id, client_name FROM clients WHERE router_ip = $1 AND id != $2 LIMIT 1`, [rtIp, numId]); if (d) return res.status(409).json({ error: `Router IP already assigned to ${d.client_name}.` }) }
    const mac = (data.mac_address || '').trim()
    if (mac) { const [d] = await query(`SELECT id, client_name FROM clients WHERE mac_address = $1 AND id != $2 LIMIT 1`, [mac, numId]); if (d) return res.status(409).json({ error: `MAC Address already assigned to ${d.client_name}.` }) }
    if (phone) data.phone = phone
    const entries = Object.entries(data).filter(([k]) => !['id','created_at','active_since'].includes(k))
    if (!entries.length) { const [c] = await query(`SELECT * FROM clients WHERE id = $1`, [numId]); return res.json(c) }
    const set = entries.map(([k], i) => `${k} = $${i+1}`).join(', ')
    const values = entries.map(([,v]) => v === '' ? null : v ?? null)
    const [updated] = await query(`UPDATE clients SET ${set} WHERE id = $${entries.length+1} RETURNING *`, [...values, numId])
    if (!updated) return res.status(404).json({ error: 'Not found' })
    await logAction(req.user.id, req.user.name, 'updated', 'clients', numId)
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/clients/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    await logAction(req.user.id, req.user.name, 'deleted', 'clients', id)
    await query(`DELETE FROM billing WHERE client_id = $1`, [id])
    await query(`DELETE FROM clients WHERE id = $1`, [id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Requests
async function nextRequestNo() {
  const [row] = await query(`SELECT COALESCE(MAX(CAST(REPLACE(request_no, 'REQ-', '') AS INTEGER)), 0) AS n FROM requests`)
  return `REQ-${String((row?.n||0)+1).padStart(3,'0')}`
}

function getMissingFields(r) {
  const required = ['client_name','phone','location','internet_type','monthly_fee','install_status','payment_status']
  const labels = { client_name:'Client Name', phone:'Phone Number', location:'Location', internet_type:'Internet Type', monthly_fee:'Monthly Fee', install_status:'Installation Status', payment_status:'Installation Fee Paid' }
  const missing = []
  for (const f of required) { if (!r[f]) missing.push(labels[f]) }
  if (r.install_status !== 'Installed') missing.push('Installation must be marked as Installed')
  if (r.payment_status !== 'Paid') missing.push('Installation fee must be marked as Paid')
  return [...new Set(missing)]
}

app.get('/api/requests', async (_req, res) => {
  try { await initSchema(); res.json(await query(`SELECT * FROM requests ORDER BY id DESC`)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/requests', async (req, res) => {
  try {
    await initSchema()
    const data = req.body
    const request_no = await nextRequestNo()
    const [request] = await query(`
      INSERT INTO requests (request_no, client_name, phone, location, call_date, preferred_install_date, internet_type, install_readiness)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [request_no, data.client_name, data.phone, data.location, data.call_date, data.preferred_install_date||null, data.internet_type, data.install_readiness||null])
    await logAction(req.user.id, req.user.name, 'created', 'requests', request.id)
    res.status(201).json(request)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/requests/:id', async (req, res) => {
  try { const [r] = await query(`SELECT * FROM requests WHERE id = $1`, [req.params.id]); r ? res.json(r) : res.status(404).json({ error: 'Not found' }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/requests/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const data = req.body
    const entries = Object.entries(data).filter(([k]) => !['id','request_no','created_at'].includes(k))
    if (!entries.length) { const [r] = await query(`SELECT * FROM requests WHERE id = $1`, [id]); return res.json(r) }
    const set = entries.map(([k], i) => `${k} = $${i+1}`).join(', ')
    const values = entries.map(([,v]) => v === '' ? null : v ?? null)
    const [updated] = await query(`UPDATE requests SET ${set} WHERE id = $${entries.length+1} RETURNING *`, [...values, id])
    if (!updated) return res.status(404).json({ error: 'Not found' })
    await logAction(req.user.id, req.user.name, 'updated', 'requests', id)
    res.json(updated)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/requests/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    await logAction(req.user.id, req.user.name, 'deleted', 'requests', id)
    await query(`DELETE FROM requests WHERE id = $1`, [id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/requests/:id/promote', async (req, res) => {
  try {
    const [request] = await query(`SELECT * FROM requests WHERE id = $1`, [req.params.id])
    if (!request) return res.status(404).json({ error: 'Not found' })
    const missing = getMissingFields(request)
    if (missing.length > 0) return res.status(400).json({ error: 'Missing required fields', missing })
    if (request.moved_to_permanent) return res.status(400).json({ error: 'Already activated' })
    const [client] = await query(`
      INSERT INTO clients (request_id, client_name, phone, location, internet_type, monthly_fee, device_name, mac_address, payment_reference, pay_date, rocket_no, litebeam_ip, router_ip, client_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'Active') RETURNING *`,
      [request.id, request.client_name, request.phone, request.location, request.internet_type, request.monthly_fee, null, null, null, null, null, null, null])
    await query(`UPDATE requests SET moved_to_permanent = 1 WHERE id = $1`, [request.id])
    await logAction(req.user.id, req.user.name, 'activated', 'requests', request.id)
    await logAction(req.user.id, req.user.name, 'created', 'clients', client.id)
    res.status(201).json(client)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Billing
async function ensureBillingRows(month, year) {
  await query(`INSERT INTO billing (client_id, month, year) SELECT id,$1,$2 FROM clients WHERE client_status = 'Active' ON CONFLICT (client_id, month, year) DO NOTHING`, [month, year])
}

app.get('/api/billing', async (req, res) => {
  try {
    await initSchema()
    const now = new Date()
    const month = Number(req.query.month || now.getMonth()+1)
    const year = Number(req.query.year || now.getFullYear())
    await ensureBillingRows(month, year)
    const rows = await query(`
      SELECT b.*, c.client_name, c.phone, c.internet_type, c.monthly_fee,
             c.payment_reference AS client_payment_reference, c.pay_date AS client_pay_date
      FROM billing b JOIN clients c ON c.id = b.client_id
      WHERE b.month = $1 AND b.year = $2 ORDER BY c.client_name ASC`, [month, year])
    const paid = rows.filter(r => r.payment_status === 'Paid')
    res.json({ rows, summary: { total: rows.length, paidCount: paid.length, unpaidCount: rows.length - paid.length, totalCollected: paid.reduce((sum, r) => sum + (r.total_paid || r.monthly_fee || 0), 0) } })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/billing/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const entries = Object.entries(req.body)
    if (entries.length > 0) {
      const set = entries.map(([k], i) => `${k} = $${i+1}`).join(', ')
      await query(`UPDATE billing SET ${set} WHERE id = $${entries.length+1}`, [...entries.map(([,v]) => v ?? null), id])
    }
    await logAction(req.user.id, req.user.name, 'updated', 'billing', id)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Dashboard
app.get('/api/dashboard', async (_req, res) => {
  try {
    await initSchema()
    const [requests, clients] = await Promise.all([
      query(`SELECT moved_to_permanent FROM requests`),
      query(`SELECT client_status FROM clients`),
    ])
    const now = new Date()
    const month = now.getMonth()+1, year = now.getFullYear()
    await ensureBillingRows(month, year)
    const billing = await query(`SELECT payment_status, total_paid, monthly_fee FROM billing WHERE month = $1 AND year = $2`, [month, year])
    const paid = billing.filter(r => r.payment_status === 'Paid')
    res.json({ pendingRequests: requests.filter(r => !r.moved_to_permanent).length, activeClients: clients.filter(c => c.client_status === 'Active').length, unpaidThisMonth: billing.length - paid.length, paidThisMonth: paid.length, totalClients: clients.length })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Export
function toCSV(rows) {
  if (!rows.length) return 'No data'
  const headers = Object.keys(rows[0])
  return [headers, ...rows.map(r => headers.map(h => { const v = String(r[h]??''); return v.includes(',')||v.includes('"')||v.includes('\n') ? `"${v.replace(/"/g,'""')}"` : v }))].map(r => r.join(',')).join('\n')
}

app.get('/api/export', async (_req, res) => {
  try {
    const [requests, clients, billing] = await Promise.all([query(`SELECT * FROM requests ORDER BY id`), query(`SELECT * FROM clients ORDER BY id`), query(`SELECT * FROM billing ORDER BY id`)])
    const date = new Date().toISOString().split('T')[0]
    res.set({ 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="sandav-backup-${date}.json"` }).send(JSON.stringify({ exportedAt: new Date().toISOString(), requests, clients, billing }, null, 2))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/export/requests', async (_req, res) => {
  try { const rows = await query('SELECT * FROM requests ORDER BY id'); const date = new Date().toISOString().split('T')[0]; res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="sandav-requests-${date}.csv"` }).send(toCSV(rows)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/export/clients', async (_req, res) => {
  try { const rows = await query('SELECT * FROM clients ORDER BY id'); const date = new Date().toISOString().split('T')[0]; res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="sandav-clients-${date}.csv"` }).send(toCSV(rows)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.get('/api/export/billing', async (req, res) => {
  try {
    const { month, year } = req.query
    const date = new Date().toISOString().split('T')[0]
    let rows, filename
    if (month && year) {
      rows = await query(`SELECT c.client_name, c.phone, c.internet_type, c.monthly_fee, b.month, b.year, b.payment_status, b.payment_method, b.payment_reference, b.total_paid, b.pay_date, b.notes FROM billing b JOIN clients c ON b.client_id = c.id WHERE b.month = $1 AND b.year = $2 ORDER BY c.client_name`, [Number(month), Number(year)])
      filename = `sandav-billing-${year}-${String(month).padStart(2,'0')}.csv`
    } else {
      rows = await query(`SELECT c.client_name, c.phone, c.internet_type, c.monthly_fee, b.month, b.year, b.payment_status, b.payment_method, b.payment_reference, b.total_paid, b.pay_date, b.notes FROM billing b JOIN clients c ON b.client_id = c.id ORDER BY b.year DESC, b.month DESC, c.client_name`)
      filename = `sandav-billing-all-${date}.csv`
    }
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${filename}"` }).send(toCSV(rows))
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Import
function parseCSV(text) {
  const input = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = []; let row = [], cur = '', inQuote = false, i = 0
  while (i < input.length) {
    const ch = input[i]
    if (inQuote) {
      if (ch === '"' && input[i+1] === '"') { cur += '"'; i += 2; continue }
      if (ch === '"') { inQuote = false; i++; continue }
      cur += ch
    } else {
      if (ch === '"' && cur === '') { inQuote = true; i++; continue }
      else if (ch === '"') { cur += ch; i++; continue }
      if (ch === ',') { row.push(cur.trim()); cur = ''; i++; continue }
      if (ch === '\n') { row.push(cur.trim()); cur = ''; if (row.some(v => v)) rows.push(row); row = []; i++; continue }
      cur += ch
    }
    i++
  }
  row.push(cur.trim()); if (row.some(v => v)) rows.push(row)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.trim())
  return rows.slice(1).map(vals => { const r = {}; headers.forEach((h, i) => { r[h] = vals[i] ?? '' }); return r })
}

function cleanMoney(val) { if (!val) return null; const n = parseFloat(val.replace(/[R,\s]/g, '')); return isNaN(n) ? null : n }

const REQUEST_COL_MAP = { 'client full name':'client_name','full name':'client_name','phone number':'phone','phone':'phone','client location':'location','location':'location','call date':'call_date','installation readiness':'install_readiness','preffered install date':'preferred_install_date','preferred install date':'preferred_install_date','internet type':'internet_type','monthly fee':'monthly_fee','installation date':'installation_date','installation status':'install_status','installation fee':'install_fee','payment status':'payment_status','payment reference':'payment_reference','pay date':'pay_date','device name':'device_name','mac address ( router)':'mac_address','mac address (router)':'mac_address','mac address':'mac_address','movedtopermanentclient':'moved_to_permanent','request no':'request_no' }
const INSTALL_MAP = { 'done':'Installed','installed':'Installed','pending':'Pending','':'Pending' }
const PAY_MAP = { 'paid':'Paid','not paid':'Unpaid','unpaid':'Unpaid','':'Unpaid' }
const READY_MAP = { 'pending coverage':'Pending Coverage','ready to install':'Ready To Install','not yet ready':'Not Yet Ready' }
function cleanStatus(val, map) { return map[(val||'').trim().toLowerCase()] ?? (val||'').trim() }

app.post('/api/import/requests', async (req, res) => {
  try {
    await initSchema()
    const rows = parseCSV(req.body.csv)
    let imported = 0, skipped = 0, activatedClients = 0
    const now = new Date(); const month = now.getMonth()+1, year = now.getFullYear()
    for (const raw of rows) {
      try {
        const data = {}
        for (const [key, val] of Object.entries(raw)) { const field = REQUEST_COL_MAP[key.toLowerCase().trim()]; if (field) data[field] = val.trim() }
        if (!data.client_name && !data.phone) { skipped++; continue }
        if (!data.phone) { skipped++; continue }
        const phone = data.phone.replace(/\s+/g, '')
        if (!phone) { skipped++; continue }
        const existsReq = await query(`SELECT id FROM requests WHERE phone = $1`, [phone])
        if (existsReq.length > 0) { skipped++; continue }
        const movedToClient = data.moved_to_permanent?.toLowerCase() === 'yes'
        let requestNo = data.request_no?.match(/REQ-\d+/)?.[0]
        if (!requestNo) { const [row] = await query(`SELECT COALESCE(MAX(CAST(REPLACE(request_no,'REQ-','') AS INTEGER)),0) AS n FROM requests`); requestNo = `REQ-${String((row?.n||0)+1).padStart(3,'0')}` }
        const existsNo = await query(`SELECT id FROM requests WHERE request_no = $1`, [requestNo])
        if (existsNo.length > 0) { const [row] = await query(`SELECT COALESCE(MAX(CAST(REPLACE(request_no,'REQ-','') AS INTEGER)),0) AS n FROM requests`); requestNo = `REQ-${String((row?.n||0)+1).padStart(3,'0')}` }
        const [reqResult] = await query(`INSERT INTO requests (request_no,client_name,phone,location,call_date,internet_type,install_readiness,preferred_install_date,installation_date,install_status,install_fee,payment_status,monthly_fee,moved_to_permanent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
          [requestNo, data.client_name||'Unknown', phone, data.location||null, data.call_date||null, data.internet_type||null, cleanStatus(data.install_readiness||'',READY_MAP)||null, data.preferred_install_date||null, data.installation_date||null, cleanStatus(data.install_status||'',INSTALL_MAP), cleanMoney(data.install_fee||''), cleanStatus(data.payment_status||'',PAY_MAP), cleanMoney(data.monthly_fee||''), movedToClient?1:0])
        imported++
        if (movedToClient && reqResult?.id) {
          const existsClient = await query(`SELECT id FROM clients WHERE phone = $1`, [phone])
          if (existsClient.length === 0) {
            const [cr] = await query(`INSERT INTO clients (request_id,client_name,phone,location,internet_type,monthly_fee,device_name,mac_address,payment_reference,pay_date,client_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Active') RETURNING id`,
              [reqResult.id, data.client_name||'Unknown', phone, data.location||null, data.internet_type||null, cleanMoney(data.monthly_fee||''), data.device_name||null, data.mac_address||null, data.payment_reference||null, data.pay_date||null])
            if (cr?.id) { await query(`INSERT INTO billing (client_id,month,year) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [cr.id, month, year]); activatedClients++ }
          }
        }
      } catch { skipped++ }
    }
    res.json({ imported, skipped, activatedClients })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

const CLIENT_COL_MAP = { 'client full name':'client_name','full name':'client_name','client name':'client_name','name':'client_name','customer name':'client_name','clients name':'client_name','phone number':'phone','phone':'phone','contact':'phone','contact number':'phone','mobile':'phone','mobile number':'phone','cell':'phone','tel':'phone','telephone':'phone','client location':'location','location':'location','address':'location','area':'location','internet type':'internet_type','package':'internet_type','service type':'internet_type','monthly fee':'monthly_fee','fee':'monthly_fee','amount':'monthly_fee','price':'monthly_fee','rate':'monthly_fee','mac address ( router)':'mac_address','mac address (router)':'mac_address','mac address':'mac_address','mac':'mac_address','device name':'device_name','device':'device_name','equipment':'device_name','payment reference':'payment_reference','reference':'payment_reference','ref':'payment_reference','pay ref':'payment_reference','payment ref':'payment_reference','pay date':'pay_date','payment date':'pay_date','date paid':'pay_date','rocket no.':'rocket_no','rocket no':'rocket_no','rocket':'rocket_no','rocket number':'rocket_no','router no.':'rocket_no','router no':'rocket_no','router number':'rocket_no','litebeam ip address':'litebeam_ip','litebeam ip':'litebeam_ip','litebeam':'litebeam_ip','router ip address':'router_ip','router ip':'router_ip','client status':'client_status','status':'client_status' }
const CLIENT_FUZZY = [{ contains:['name'], field:'client_name' },{ contains:['phone','mobile','cell','tel','contact'], field:'phone' },{ contains:['location','address','area'], field:'location' },{ contains:['internet','package','service'], field:'internet_type' },{ contains:['fee','amount','price','rate','monthly'], field:'monthly_fee' },{ contains:['mac'], field:'mac_address' },{ contains:['device','equipment'], field:'device_name' },{ contains:['reference','ref'], field:'payment_reference' },{ contains:['pay date','payment date','date paid'], field:'pay_date' },{ contains:['rocket'], field:'rocket_no' },{ contains:['litebeam'], field:'litebeam_ip' },{ contains:['router ip','router'], field:'router_ip' },{ contains:['status'], field:'client_status' }]

function resolveClientField(header) {
  const k = header.toLowerCase().trim()
  if (CLIENT_COL_MAP[k]) return CLIENT_COL_MAP[k]
  for (const rule of CLIENT_FUZZY) { if (rule.contains.some(kw => k.includes(kw))) return rule.field }
}

app.post('/api/import/clients', async (req, res) => {
  try {
    await initSchema()
    const rows = parseCSV(req.body.csv)
    const parsedRows = rows.length
    const now = new Date(); const month = now.getMonth()+1, year = now.getFullYear()
    const mapped = [], noPhoneNames = []
    for (const raw of rows) {
      const data = {}
      for (const [key, val] of Object.entries(raw)) { const field = resolveClientField(key); if (field && val.trim() && !data[field]) data[field] = val.trim() }
      const phone = data.phone?.replace(/\s+/g,'')
      if (!phone) { noPhoneNames.push(data.client_name || Object.values(raw).find(v => v.trim()) || '(blank row)'); continue }
      mapped.push({ ...data, _phone: phone })
    }
    if (mapped.length === 0) { res.json({ imported:0, updated:0, skipped:0, duplicateRefs:[], noPhoneNames, parsedRows }); return }
    const phones = mapped.map(d => d._phone)
    const existingClients = await query(`SELECT id, phone, payment_reference FROM clients WHERE phone = ANY($1)`, [phones])
    const existingByPhone = new Map(existingClients.map(c => [c.phone, c]))
    const refs = mapped.map(d => d.payment_reference).filter(Boolean)
    const existingRefs = refs.length > 0 ? await query(`SELECT id, payment_reference FROM clients WHERE payment_reference = ANY($1)`, [refs]) : []
    const refToId = new Map(existingRefs.map(c => [c.payment_reference, c.id]))
    const toInsert = [], toUpdate = [], allClientIds = []
    let skipped = 0; const duplicateRefs = []
    for (const data of mapped) {
      const existing = existingByPhone.get(data._phone)
      if (existing) {
        if (data.payment_reference) { const cid = refToId.get(data.payment_reference); if (cid && cid !== existing.id) { duplicateRefs.push(data.payment_reference); skipped++; continue } }
        toUpdate.push({ data, clientId: existing.id }); allClientIds.push(existing.id)
      } else {
        if (data.payment_reference) { const cid = refToId.get(data.payment_reference); if (cid) { duplicateRefs.push(data.payment_reference); skipped++; continue } refToId.set(data.payment_reference, -1) }
        toInsert.push(data); existingByPhone.set(data._phone, { id: -1, phone: data._phone, payment_reference: data.payment_reference || null })
      }
    }
    let imported = 0
    if (toInsert.length > 0) {
      const placeholders = toInsert.map((_, i) => { const b = i*13; return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13})` }).join(',')
      const values = toInsert.flatMap(d => [d.client_name||'Unknown', d._phone, d.location||'', d.internet_type||'', cleanMoney(d.monthly_fee||'')||0, d.device_name||null, d.mac_address||null, d.payment_reference||null, d.pay_date||null, d.rocket_no||null, d.litebeam_ip||null, d.router_ip||null, d.client_status||'Active'])
      const results = await query(`INSERT INTO clients (client_name,phone,location,internet_type,monthly_fee,device_name,mac_address,payment_reference,pay_date,rocket_no,litebeam_ip,router_ip,client_status) VALUES ${placeholders} RETURNING id`, values)
      allClientIds.push(...results.map(r => r.id)); imported = results.length
    }
    let updated = 0
    if (toUpdate.length > 0) {
      await query(`UPDATE clients SET client_name=COALESCE(NULLIF(NULLIF(clients.client_name,''),'Unknown'),v.name),location=COALESCE(clients.location,v.location),internet_type=COALESCE(clients.internet_type,v.internet_type),monthly_fee=COALESCE(clients.monthly_fee,v.fee::real),device_name=COALESCE(clients.device_name,v.device),mac_address=COALESCE(clients.mac_address,v.mac),payment_reference=COALESCE(clients.payment_reference,v.pay_ref),pay_date=COALESCE(clients.pay_date,v.pay_date),rocket_no=COALESCE(clients.rocket_no,v.rocket),litebeam_ip=COALESCE(clients.litebeam_ip,v.litebeam),router_ip=COALESCE(clients.router_ip,v.router),client_status=COALESCE(NULLIF(clients.client_status,''),v.status) FROM unnest($1::int[],$2::text[],$3::text[],$4::text[],$5::real[],$6::text[],$7::text[],$8::text[],$9::text[],$10::text[],$11::text[],$12::text[],$13::text[]) AS v(id,name,location,internet_type,fee,device,mac,pay_ref,pay_date,rocket,litebeam,router,status) WHERE clients.id=v.id`,
        [toUpdate.map(u=>u.clientId),toUpdate.map(u=>u.data.client_name||null),toUpdate.map(u=>u.data.location||null),toUpdate.map(u=>u.data.internet_type||null),toUpdate.map(u=>cleanMoney(u.data.monthly_fee||'')),toUpdate.map(u=>u.data.device_name||null),toUpdate.map(u=>u.data.mac_address||null),toUpdate.map(u=>u.data.payment_reference||null),toUpdate.map(u=>u.data.pay_date||null),toUpdate.map(u=>u.data.rocket_no||null),toUpdate.map(u=>u.data.litebeam_ip||null),toUpdate.map(u=>u.data.router_ip||null),toUpdate.map(u=>u.data.client_status||'Active')])
      updated = toUpdate.length
    }
    if (allClientIds.length > 0) await query(`INSERT INTO billing (client_id,month,year) SELECT unnest($1::int[]),$2,$3 ON CONFLICT (client_id,month,year) DO NOTHING`, [allClientIds, month, year])
    res.json({ imported, updated, skipped, duplicateRefs, noPhoneNames, parsedRows })
  } catch (err) { console.error('[import/clients]', err.message); res.status(500).json({ error: err.message }) }
})

// Users
app.get('/api/users', async (_req, res) => {
  try { res.json(await query(`SELECT id, name, username, created_at FROM users ORDER BY id`)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post('/api/users', async (req, res) => {
  try {
    const { name, username, password } = req.body
    if (!name || !username || !password) return res.status(400).json({ error: 'Name, username and password are required' })
    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username.trim().toLowerCase()])
    if (existing.length > 0) return res.status(409).json({ error: 'Username already taken' })
    const hash = await bcrypt.hash(password, 10)
    const [user] = await query(`INSERT INTO users (name, username, password_hash) VALUES ($1,$2,$3) RETURNING id, name, username, created_at`, [name.trim(), username.trim().toLowerCase(), hash])
    res.status(201).json(user)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.put('/api/users/:id/password', async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { password } = req.body
    if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
    const hash = await bcrypt.hash(password, 10)
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete('/api/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' })
    await query(`DELETE FROM users WHERE id = $1`, [id])
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// Audit
app.get('/api/audit/:table/:recordId', async (req, res) => {
  try {
    const rows = await query(`SELECT * FROM audit_log WHERE table_name = $1 AND record_id = $2 ORDER BY created_at DESC`, [req.params.table, Number(req.params.recordId)])
    res.json(rows)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── Start ─────────────────────────────────────────────────────────────────────

process.on('uncaughtException', err => console.error('uncaughtException:', err.message))
process.on('unhandledRejection', reason => console.error('unhandledRejection:', reason))

app.listen(PORT, () => {
  console.log(`Sandav backend running on port ${PORT}`)
  initSchema().catch(err => console.error('Schema init failed:', err.message))
})
