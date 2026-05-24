import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'

dotenv.config()

import clientsRouter from './routes/clients'
import requestsRouter from './routes/requests'
import billingRouter from './routes/billing'
import dashboardRouter from './routes/dashboard'
import exportRouter from './routes/export'
import importRouter from './routes/import'
import authRouter from './routes/auth'
import usersRouter from './routes/users'
import auditRouter from './routes/audit'
import { requireAuth } from './middleware/auth'
import { initSchema } from './lib/db'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))

app.use(express.json({ limit: '10mb' }))

// Public routes (no auth required)
app.use('/api/auth', authRouter)
app.get('/health', (_req, res) => res.json({ ok: true }))

// All routes below require a valid login
app.use(requireAuth)

app.use('/api/clients',   clientsRouter)
app.use('/api/requests',  requestsRouter)
app.use('/api/billing',   billingRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/export',    exportRouter)
app.use('/api/import',    importRouter)
app.use('/api/users',     usersRouter)
app.use('/api/audit',     auditRouter)

process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err.message)
})
process.on('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason)
})

app.listen(PORT, () => {
  console.log(`Sandav backend running on http://localhost:${PORT}`)
  initSchema().catch(err => console.error('Schema init failed:', err.message))
})
