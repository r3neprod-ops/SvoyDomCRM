import { getSql, ensureSchema } from './db';
import { addLeadEvent } from './leadEvents';

function buildMessage(answers) {
  if (!answers || typeof answers !== 'object') return '';
  const parts = [];
  if (answers.propertyType)    parts.push(`Тип: ${answers.propertyType}`);
  if (answers.apartmentType)   parts.push(`Планировка: ${answers.apartmentType}`);
  if (answers.budgetPreset)    parts.push(`Бюджет: ${answers.budgetPreset}`);
  if (answers.downPaymentType) parts.push(`Взнос: ${answers.downPaymentType}`);
  if (answers.telegram)        parts.push(`Telegram: ${answers.telegram}`);
  return parts.join(', ');
}

export async function addLead(payload) {
  await ensureSchema();
  const sql = getSql();
  const answers = payload?.answers && typeof payload.answers === 'object' ? payload.answers : {};
  const name    = payload?.name  || answers?.name  || '';
  const phone   = payload?.phone || answers?.phone || '';
  const message = buildMessage(answers);

  const [row] = await sql`
    INSERT INTO leads (name, phone, message, status)
    VALUES (${name}, ${phone}, ${message}, 'new')
    RETURNING id
  `;
  await addLeadEvent(sql, {
    leadId: row.id,
    type: 'created',
    message: 'Лид создан',
    meta: { source: payload?.pageUrl || null },
  });

  return { id: row.id, name, phone, message, status: 'new' };
}

export async function getLeads() {
  await ensureSchema();
  const sql = getSql();
  return sql`
    SELECT l.*, u.name AS assigned_to_name
    FROM leads l
    LEFT JOIN users u ON l.assigned_to = u.id
    ORDER BY l.created_at DESC
  `;
}
