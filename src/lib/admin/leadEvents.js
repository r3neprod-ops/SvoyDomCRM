export async function addLeadEvent(sql, { leadId, userId = null, companyId = null, type, message, meta = null }) {
  if (!leadId || !type || !message) return [];
  return sql`
    INSERT INTO lead_events (lead_id, user_id, company_id, type, message, meta)
    VALUES (${leadId}, ${userId}, ${companyId}, ${type}, ${message}, ${meta ? JSON.stringify(meta) : null})
    RETURNING id, lead_id, user_id, company_id, type, message, meta, created_at
  `;
}
