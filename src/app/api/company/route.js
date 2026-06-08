import { NextResponse } from 'next/server';
import { getCurrentUserContext, makeLeadToken, normalizeCompany, PUBLIC_ID_PATTERN } from '@/lib/admin/company';
import { ensureSchema, getSql } from '@/lib/admin/db';
import { canManageTeam } from '@/lib/admin/roles';
import { logActivity } from '@/lib/admin/activityLog';

function cleanText(value, limit = 160) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function publicCompany(company) {
  return normalizeCompany(company);
}

export async function GET() {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) {
    return NextResponse.json({ ok: false, redirectTo: '/admin/onboarding' }, { status: 428 });
  }

  await ensureSchema();
  const sql = getSql();
  const members = await sql`
    SELECT u.id, u.name, u.username, u.email, u.phone, u.avatar_url, u.is_active,
           cm.role, cm.status, cm.created_at
    FROM company_members cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.company_id = ${context.companyId}
      AND cm.status = 'active'
    ORDER BY
      CASE cm.role
        WHEN 'owner' THEN 0
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'agent' THEN 3
        ELSE 9
      END,
      u.name
  `;

  const requests = canManageTeam(context.user)
    ? await sql`
        SELECT r.id, r.status, r.message, r.created_at, r.updated_at,
               u.id AS user_id, u.name, u.username, u.email, u.avatar_url
        FROM company_join_requests r
        JOIN users u ON u.id = r.user_id
        WHERE r.company_id = ${context.companyId}
          AND r.status = 'pending'
        ORDER BY r.created_at ASC
      `
    : [];

  return NextResponse.json({
    ok: true,
    company: publicCompany(context.company),
    members,
    requests,
    canManage: canManageTeam(context.user),
  });
}

export async function PATCH(request) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return NextResponse.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return NextResponse.json({ ok: false }, { status: 428 });
  if (!canManageTeam(context.user)) return NextResponse.json({ ok: false }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = cleanText(body.name, 100);
  const publicId = cleanText(body.public_id, 40).toLowerCase();
  const description = cleanText(body.description, 240);
  const websiteUrl = cleanText(body.website_url, 200);
  const rotateLeadToken = body.rotate_lead_token === true;

  if (!name) return NextResponse.json({ ok: false, message: 'Укажите название компании' }, { status: 400 });
  if (!PUBLIC_ID_PATTERN.test(publicId)) {
    return NextResponse.json({ ok: false, message: 'ID компании: 3-32 символа, латиница, цифры, - и _' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();
  const [existing] = await sql`
    SELECT id
    FROM companies
    WHERE public_id = ${publicId}
      AND id <> ${context.companyId}
    LIMIT 1
  `;
  if (existing) return NextResponse.json({ ok: false, message: 'Этот ID компании уже занят' }, { status: 409 });

  const [company] = rotateLeadToken
    ? await sql`
        UPDATE companies
        SET name = ${name},
            public_id = ${publicId},
            description = ${description || null},
            website_url = ${websiteUrl || null},
            lead_token = ${makeLeadToken()},
            updated_at = NOW()
        WHERE id = ${context.companyId}
        RETURNING id, name, public_id, lead_token, description, website_url, owner_id, created_at, updated_at
      `
    : await sql`
        UPDATE companies
        SET name = ${name},
            public_id = ${publicId},
            description = ${description || null},
            website_url = ${websiteUrl || null},
            updated_at = NOW()
        WHERE id = ${context.companyId}
        RETURNING id, name, public_id, lead_token, description, website_url, owner_id, created_at, updated_at
      `;

  await logActivity({
    userId: context.user.id,
    companyId: context.companyId,
    action: rotateLeadToken ? 'company_updated_token_rotated' : 'company_updated',
    entityType: 'company',
    entityId: context.companyId,
    message: `${context.user.name || context.user.username} обновил настройки компании ${company.name}`,
  });

  return NextResponse.json({ ok: true, company: publicCompany(company) });
}
