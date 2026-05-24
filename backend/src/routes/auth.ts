import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query, initSchema } from '../lib/db'
import { requireAuth } from '../middleware/auth'

const router = Router()

router.post('/login', async (req, res) => {
  await initSchema()
  const { username, password } = req.body as { username?: string; password?: string }
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' })
    return
  }
  try {
    const [user] = await query<{ id: number; name: string; password_hash: string; role: string }>(
      `SELECT id, name, password_hash, role FROM users WHERE username = $1`,
      [username.trim().toLowerCase()]
    )
    if (!user) {
      res.status(401).json({ error: 'Incorrect username or password' })
      return
    }
    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      res.status(401).json({ error: 'Incorrect username or password' })
      return
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role },
      process.env.JWT_SECRET ?? 'sandav_secret',
      { expiresIn: '24h' }
    )
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } })
  } catch (err: unknown) {
    console.error(err)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// Signup is disabled — users are added by admins only
router.post('/signup', (_req, res) => {
  res.status(410).json({ error: 'Self-registration is disabled. Contact your admin.' })
})

export default router
