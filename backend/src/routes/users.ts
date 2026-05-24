import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../lib/db'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const users = await query<{ id: number; name: string; username: string; created_at: string }>(
      `SELECT id, name, username, created_at FROM users ORDER BY name`
    )
    res.json(users)
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to load users' })
  }
})

router.post('/', async (req, res) => {
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
    const existing = await query(`SELECT id FROM users WHERE username = $1`, [username.trim().toLowerCase()])
    if (existing.length > 0) {
      res.status(409).json({ error: 'Username already taken' })
      return
    }
    const hash = await bcrypt.hash(password, 10)
    const [user] = await query<{ id: number; name: string; username: string; created_at: string }>(
      `INSERT INTO users (name, username, password_hash) VALUES ($1, $2, $3)
       RETURNING id, name, username, created_at`,
      [name.trim(), username.trim().toLowerCase(), hash]
    )
    res.status(201).json(user)
  } catch (err: unknown) {
    res.status(500).json({ error: 'Failed to create user' })
  }
})

router.put('/:id/password', async (req, res) => {
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

router.delete('/:id', async (req, res) => {
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
