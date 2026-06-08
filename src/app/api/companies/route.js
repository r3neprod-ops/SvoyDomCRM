import { NextResponse } from 'next/server';
import {
  getCurrentUserContext,
  makeLeadToken,
  normalizeCompany,
  normalizePublicId,
  PUBLIC_ID_PATTERN,
  setAuthCookie,
} from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { logActivity } from '@/lib/admin/activityLog';

function cleanText(value, limit = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

async function uniquePublicId(sql, requested, name) {
  const base = normalizePublicId(requested || name || 'company');
  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? base : `${base.slice(0, 26)}-${index + 1}`;
    const [existing] = await sql`SELECT id FROM companies WHERE public_id = ${candidate} LIMIT 1`;
    if (!existing) return candidate;
  }
  return `${base.slice(0, 20)}-${Date.now().toString(36)}`;
}

export async function GET(request) {
  const context = await getCurrentUserContext();
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = cleanText(searchParams.get('q'), 80).toLowerCase();

  await ensureSchema();
  const sql = getSql();
  const companies = await sql`
    SELECT c.id, c.name, c.public_id, c.description, c.website_url, c.owner_id, c.created_at,
           cm.status AS membership_status, cm.role AS membership_role,
           jr.status AS request_status
    FROM companies c
    LEFT JOIN company_members cm
      ON cm.company_id = c.id
     AND cm.user_id = ${context.user.id}
    LEFT JOIN company_join_requests jr
     ON jr.company_id = c.id
     AND jr.user_id = ${context.user.id}
     AND jr.status IN ('pending', 'invited')
    WHERE (${q} = '' OR lower(c.name) LIKE ${`%${q}%`} OR lower(c.public_id) LIKE ${`%${q}%`})
    ORDER BY
      CASE WHEN cm.status = 'active' THEN 0 WHEN jr.status = 'invited' THEN 1 WHEN jr.status = 'pending' THEN 2 ELSE 3 END,
      c.created_at DESC
    LIMIT 60
  `;

  return NextResponse.json({ ok: true, companies });
}

export async function POST(request) {
  const context = await getCurrentUserContext();
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!context.user.profile_completed) {
    return NextResponse.json({ ok: false, message: 'Сначала заполните профиль и никнейм' }, { status: 428 });
  }

  const body = await request.json().catch(() => ({}));
  const name = cleanText(body.name, 100);
  const requestedPublicId = cleanText(body.public_id, 40).toLowerCase();
  const description = cleanText(body.description, 240);
  const websiteUrl = cleanText(body.website_url, 200);

  if (!name) return NextResponse.json({ ok: false, message: 'Укажите название компании' }, { status: 400 });
  if (requestedPublicId && !PUBLIC_ID_PATTERN.test(requestedPublicId)) {
    return NextResponse.json({ ok: false, message: 'ID компании: 3-32 символа, латиница, цифры, - и _' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();
  const publicId = await uniquePublicId(sql, requestedPublicId, name);

  const company = await sql.begin(async (tx) => {
    const [created] = await tx`
      INSERT INTO companies (name, public_id, lead_token, description, website_url, owner_id)
      VALUES (${name}, ${publicId}, ${makeLeadToken()}, ${description || null}, ${websiteUrl || null}, ${context.user.id})
      RETURNING id, name, public_id, lead_token, description, website_url, owner_id, created_at, updated_at
    `;
    await tx`
      INSERT INTO company_members (company_id, user_id, role, status)
      VALUES (${created.id}, ${context.user.id}, 'owner', 'active')
      ON CONFLICT (company_id, user_id)
      DO UPDATE SET role = 'owner', status = 'active', updated_at = NOW()
    `;
    await tx`UPDATE users SET active_company_id = ${created.id}, profile_completed = true WHERE id = ${context.user.id}`;
    return created;
  });

  await logActivity({
    userId: context.user.id,
    companyId: company.id,
    action: 'company_created',
    entityType: 'company',
    entityId: company.id,
    message: `${context.user.name || context.user.username} создал компанию ${company.name}`,
  });

  const response = NextResponse.json({ ok: true, company: normalizeCompany(company) }, { status: 201 });
  await setAuthCookie(response, context.user.id);
  return response;
}
