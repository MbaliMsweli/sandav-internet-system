import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../lib/db'
import { requireAdmin } from '../middleware/auth'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const users = await query<{ id: number; name: string; username: string; role: string; created_at: string }>(
      `SELECT id, name, username, role, created_at FROM users ORDER BY name`
    )
    res.json(users)
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to load users' })
  }
})

router.post('/', requireAdmin, async (req, res) => {
  const { name, username, password, role } = req.body as { name?: string; username?: string; password?: string; role?: string }
  if (!name || !username || !password) {
    res.status(400).json({ error: 'Name, username and password are required' })
    return
  }
  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  const assignedRole = role === 'admin' ? 'admin' : 'staff'
  try {
    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username.trim().toLowerCase()])
    if (existing.length > 0) {
      res.status(409).json({ error: 'Username already taken' })
      return
    }
    const hash = await bcrypt.hash(password, 10)
    const [user] = await query<{ id: number; name: string; username: string; role: string; created_at: string }>(
      `INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)
       RETURNING id, name, username, role, created_at`,
      [name.trim(), username.trim().toLowerCase(), hash, assignedRole]
    )
    res.status(201).json(user)
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to create user' })
  }
})

router.put('/:id/password', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id)
  const { password } = req.body as { password?: string }
  if (!password || password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' })
    return
  }
  try {
    const hash = await bcrypt.hash(password, 10)
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, id])
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

router.delete('/:id', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id)
  if (req.user?.id === id) {
    res.status(400).json({ error: 'You cannot delete your own account' })
    return
  }
  try {
    await query(`DELETE FROM users WHERE id = $1`, [id])
    res.json({ ok: true })
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to delete user' })
  }
})

export default router
