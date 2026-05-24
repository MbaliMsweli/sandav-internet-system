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
    const [user] = await query<{ id: number; name: string; password_hash: string }>(
      `SELECT id, name, password_hash FROM users WHERE username = $1`,
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
      { id: user.id, name: user.name },
      process.env.JWT_SECRET ?? 'sandav_secret',
      { expiresIn: '24h' }
    )
    res.json({ token, user: { id: user.id, name: user.name } })
  } catch (err: unknown) {
    console.error(err)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

router.post('/signup', async (req, res) => {
  await initSchema()
  const { name, username, password } = req.body as { name?: string; username?: string; password?: string }
  if (!name || !username || !password) {
    res.status(400).json({ error: 'Name, username and password are required' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  try {
    const bcrypt = await import('bcryptjs')
    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username.trim().toLowerCase()])
    if (existing.length > 0) {
      res.status(409).json({ error: 'Username already taken' })
      return
    }
    const hash = await bcrypt.default.hash(password, 10)
    const [user] = await query<{ id: number; name: string; username: string }>(
      `INSERT INTO users (name, username, password_hash) VALUES ($1, $2, $3) RETURNING id, name, username`,
      [name.trim(), username.trim().toLowerCase(), hash]
    )
    res.status(201).json(user)
  } catch (err: unknown) {
    console.error(err)
    res.status(500).json({ error: 'Could not create account' })
  }
})

export default router
