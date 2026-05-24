import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { query, initSchema } from './lib/db'

const NAME = 'Sandav Admin'
const USERNAME = 'admin'
const PASSWORD = 'SandavISP2026'

async function main() {
  await initSchema()
  const existing = await query<{ id: number }>('SELECT id FROM users WHERE username = $1', [USERNAME])
  if (existing.length > 0) {
    console.log('Admin user already exists — nothing to do.')
    console.log('Use the Users page in the app to manage accounts.')
    process.exit(0)
  }
  const hash = await bcrypt.hash(PASSWORD, 10)
  await query(
    `INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
    [NAME, USERNAME, hash]
  )
  console.log('Admin account created.')
  console.log(`  Username : ${USERNAME}`)
  console.log(`  Password : ${PASSWORD}`)
  console.log('Log in and change the password immediately via the Users page.')
  process.exit(0)
}

main().catch(e => {
  console.error('Seed failed:', e instanceof Error ? e.message : e)
  process.exit(1)
})
