import { getSql } from './db';

export async function logActivity({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  message,
  meta = null,
} = {}) {
  if (!action || !message) return;

  try {
    const sql = getSql();
    await sql`
      INSERT INTO activity_logs (user_id, action, entity_type, entity_id, message, meta)
      VALUES (
        ${userId},
        ${action},
        ${entityType},
        ${entityId},
        ${message},
        ${meta ? sql.json(meta) : null}
      )
    `;
  } catch (error) {
    console.error('[activityLog] insert failed:', error?.message || error);
  }
}
