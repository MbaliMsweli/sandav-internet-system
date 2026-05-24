import { Pool } from 'pg'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const u = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/db')

function loadCert(): string | undefined {
  if (process.env.DATABASE_CA_CERT) return process.env.DATABASE_CA_CERT
  const path = join(process.cwd(), 'ca-certificate.crt')
  if (existsSync(path)) return readFileSync(path).toString()
  return undefined
}

const cert = loadCert()
const pool = new Pool({
  host: u.hostname,
  port: parseInt(u.port) || 5432,
  database: u.pathname.slice(1),
  user: u.username || 'doadmin',
  password: u.password,
  ssl: cert ? { rejectUnauthorized: true, ca: cert } : { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
})

pool.on('error', (err) => {
  console.error('pg pool error (idle client):', err.message)
})

export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

let schemaPromise: Promise<void> | null = null

export function initSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = _createSchema().catch(err => {
      schemaPromise = null
      throw err
    })
  }
  return schemaPromise
}

async function _createSchema() {
  const [row] = await query<{ c: string }>(
    `SELECT COUNT(*)::int AS c FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY(ARRAY['requests','clients','billing'])`
  )

  if (Number(row?.c) >= 3) {
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS install_readiness TEXT`).catch(() => {})
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS preferred_install_date TEXT`).catch(() => {})
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS monthly_fee REAL`).catch(() => {})
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS installation_date TEXT`).catch(() => {})
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS install_fee REAL`).catch(() => {})
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS payment_reference TEXT`).catch(() => {})
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS pay_date TEXT`).catch(() => {})
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS device_name TEXT`).catch(() => {})
    await query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS mac_address TEXT`).catch(() => {})
    await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS rocket_no TEXT`).catch(() => {})
    await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS litebeam_ip TEXT`).catch(() => {})
    await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS router_ip TEXT`).catch(() => {})
    await query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_status TEXT DEFAULT 'Active'`).catch(() => {})
    // auth + audit tables (migrations for existing DBs)
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (NOW()::TEXT)
      )
    `).catch(() => {})
    await query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        table_name TEXT NOT NULL,
        record_id INTEGER NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT (NOW()::TEXT)
      )
    `).catch(() => {})
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(table_name, record_id)`).catch(() => {})
    // role migration
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff'`).catch(() => {})
    await query(`UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users) AND role = 'staff'`).catch(() => {})
    return
  }

  await query(`
    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      request_no TEXT UNIQUE NOT NULL,
      client_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      location TEXT,
      call_date TEXT,
      preferred_install_date TEXT,
      internet_type TEXT,
      install_readiness TEXT,
      monthly_fee REAL,
      installation_date TEXT,
      install_status TEXT DEFAULT 'Pending',
      install_fee REAL,
      payment_status TEXT DEFAULT 'Unpaid',
      payment_reference TEXT,
      pay_date TEXT,
      device_name TEXT,
      mac_address TEXT,
      moved_to_permanent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (NOW()::TEXT)
    )
  `)
  await query(`ALTER TABLE requests ALTER COLUMN location DROP NOT NULL`).catch(() => {})
  await query(`ALTER TABLE requests ALTER COLUMN call_date DROP NOT NULL`).catch(() => {})
  await query(`ALTER TABLE requests ALTER COLUMN internet_type DROP NOT NULL`).catch(() => {})

  await query(`CREATE INDEX IF NOT EXISTS idx_requests_phone ON requests(phone)`).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone)`).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_clients_payment_ref ON clients(payment_reference)`).catch(() => {})
  await query(`CREATE INDEX IF NOT EXISTS idx_billing_month_year ON billing(month, year)`).catch(() => {})

  await query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      request_id INTEGER REFERENCES requests(id),
      client_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      location TEXT NOT NULL,
      internet_type TEXT NOT NULL,
      monthly_fee REAL NOT NULL,
      device_name TEXT,
      mac_address TEXT,
      payment_reference TEXT,
      pay_date TEXT,
      rocket_no TEXT,
      litebeam_ip TEXT,
      router_ip TEXT,
      client_status TEXT DEFAULT 'Active',
      active_since TEXT DEFAULT (NOW()::TEXT),
      created_at TEXT DEFAULT (NOW()::TEXT)
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS billing (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      payment_status TEXT DEFAULT 'Unpaid',
      payment_method TEXT,
      payment_reference TEXT,
      notes TEXT,
      total_paid REAL,
      pay_date TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT),
      UNIQUE(client_id, month, year)
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      created_at TEXT DEFAULT (NOW()::TEXT)
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT (NOW()::TEXT)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(table_name, record_id)`).catch(() => {})
}
