import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getAuthUser } from '@/lib/admin/auth';
import { getSql, ensureSchema } from '@/lib/admin/db';

export const dynamic = 'force-dynamic';

const STATUS_RU = { new: 'Новый', in_progress: 'В работе', closed: 'Закрыт' };

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export async function GET(request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });

  await ensureSchema();
  const sql = getSql();

  const { searchParams } = new URL(request.url);
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  const conditions = [];
  const params = [];

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`l.created_at >= $${params.length}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`l.created_at < ($${params.length}::date + interval '1 day')`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  const rows = await sql.query(
    `SELECT l.id, l.name, l.phone, l.message, l.status, l.assigned_to, l.created_at,
            u.name AS assigned_to_name,
            (SELECT text FROM comments WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1) AS last_comment
     FROM leads l
     LEFT JOIN users u ON l.assigned_to = u.id
     ${where}
     ORDER BY l.created_at DESC`,
    params
  );

  const sheetData = [
    ['№', 'Дата', 'Имя', 'Телефон', 'Сообщение', 'Статус', 'Назначен', 'Комментарий (последний)'],
    ...rows.map((r, i) => [
      i + 1,
      formatDate(r.created_at),
      r.name || '',
      r.phone || '',
      r.message || '',
      STATUS_RU[r.status] ?? r.status,
      r.assigned_to_name || '',
      r.last_comment || '',
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Column widths
  ws['!cols'] = [
    { wch: 5 },  // №
    { wch: 18 }, // Дата
    { wch: 20 }, // Имя
    { wch: 18 }, // Телефон
    { wch: 40 }, // Сообщение
    { wch: 12 }, // Статус
    { wch: 18 }, // Назначен
    { wch: 50 }, // Комментарий
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Лиды');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const from = dateFrom || 'all';
  const to = dateTo || 'all';
  const filename = dateFrom || dateTo ? `leads_${from}_${to}.xlsx` : 'leads_all.xlsx';

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
