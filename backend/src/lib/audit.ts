import { query } from './db'

export async function logAction(
  userId: number,
  userName: string,
  action: string,
  tableName: string,
  recordId: number,
  details?: string
) {
  await query(
    `INSERT INTO audit_log (user_id, user_name, action, table_name, record_id, details)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, userName, action, tableName, recordId, details ?? null]
  ).catch(err => console.error('audit log error:', err.message))
}
