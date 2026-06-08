import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { getAuthUser, signToken } from './auth';
import { ensureSchema, getSql } from './db';

export const PUBLIC_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,31}$/;
export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

export function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/^@+/, '').toLowerCase();
}

export function normalizePublicId(value, fallback = 'company') {
  const base = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return PUBLIC_ID_PATTERN.test(base) ? base : `${base || 'company'}-${Date.now().toString(36)}`.slice(0, 32);
}

export function makeLeadToken() {
  return `crm_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function normalizeCompany(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    public_id: row.public_id,
    lead_token: row.lead_token,
    description: row.description || '',
    website_url: row.website_url || '',
    owner_id: row.owner_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getCurrentUserContext({ requireCompany = false } = {}) {
  const tokenUser = await getAuthUser();
  if (!tokenUser) return { user: null, company: null, companyId: null };

  await ensureSchema();
  const sql = getSql();
  const [row] = await sql`
    SELECT
      u.id,
      u.username,
      u.role AS global_role,
      u.name,
      u.email,
      u.phone,
      u.status_text,
      u.avatar_url,
      COALESCE(u.profile_completed, false) AS profile_completed,
      u.active_company_id,
      cm.role AS membership_role,
      cm.status AS membership_status,
      c.id AS company_id,
      c.name AS company_name,
      c.public_id AS company_public_id,
      c.lead_token AS company_lead_token,
      c.description AS company_description,
      c.website_url AS company_website_url,
      c.owner_id AS company_owner_id,
      c.created_at AS company_created_at,
      c.updated_at AS company_updated_at
    FROM users u
    LEFT JOIN company_members cm
      ON cm.user_id = u.id
     AND cm.company_id = u.active_company_id
     AND cm.status = 'active'
    LEFT JOIN companies c ON c.id = cm.company_id
    WHERE u.id = ${tokenUser.id}
    LIMIT 1
  `;

  if (!row) return { user: null, company: null, companyId: null };

  let activeRow = row;
  if (!activeRow.company_id) {
    const [membership] = await sql`
      SELECT cm.company_id, cm.role, c.name, c.public_id, c.lead_token, c.description, c.website_url, c.owner_id, c.created_at, c.updated_at
      FROM company_members cm
      JOIN companies c ON c.id = cm.company_id
      WHERE cm.user_id = ${tokenUser.id}
        AND cm.status = 'active'
      ORDER BY cm.created_at ASC
      LIMIT 1
    `;
    if (membership) {
      await sql`UPDATE users SET active_company_id = ${membership.company_id} WHERE id = ${tokenUser.id}`;
      activeRow = {
        ...activeRow,
        active_company_id: membership.company_id,
        membership_role: membership.role,
        membership_status: 'active',
        company_id: membership.company_id,
        company_name: membership.name,
        company_public_id: membership.public_id,
        company_lead_token: membership.lead_token,
        company_description: membership.description,
        company_website_url: membership.website_url,
        company_owner_id: membership.owner_id,
        company_created_at: membership.created_at,
        company_updated_at: membership.updated_at,
      };
    }
  }

  const role = activeRow.membership_role || activeRow.global_role || 'agent';
  const user = {
    id: activeRow.id,
    username: activeRow.username,
    role,
    name: activeRow.name,
    email: activeRow.email || '',
    phone: activeRow.phone || '',
    status_text: activeRow.status_text || '',
    avatar_url: activeRow.avatar_url || '',
    profile_completed: Boolean(activeRow.profile_completed),
    active_company_id: activeRow.company_id || null,
  };
  const company = activeRow.company_id
    ? normalizeCompany({
        id: activeRow.company_id,
        name: activeRow.company_name,
        public_id: activeRow.company_public_id,
        lead_token: activeRow.company_lead_token,
        description: activeRow.company_description,
        website_url: activeRow.company_website_url,
        owner_id: activeRow.company_owner_id,
        created_at: activeRow.company_created_at,
        updated_at: activeRow.company_updated_at,
      })
    : null;

  if (requireCompany && (!user.profile_completed || !company)) {
    return { user, company, companyId: null, needsOnboarding: true };
  }

  return { user, company, companyId: company?.id || null, needsOnboarding: !user.profile_completed || !company };
}

export function onboardingResponse() {
  return NextResponse.json({ ok: false, code: 'ONBOARDING_REQUIRED', redirectTo: '/admin/onboarding' }, { status: 428 });
}

export async function setAuthCookie(response, userId) {
  const sql = getSql();
  const [row] = await sql`
    SELECT u.id, u.username, u.name, COALESCE(u.profile_completed, false) AS profile_completed,
           u.active_company_id, COALESCE(cm.role, u.role) AS role
    FROM users u
    LEFT JOIN company_members cm
      ON cm.user_id = u.id
     AND cm.company_id = u.active_company_id
     AND cm.status = 'active'
    WHERE u.id = ${userId}
    LIMIT 1
  `;
  if (!row) return response;
  const token = await signToken({
    id: row.id,
    role: row.role,
    name: row.name,
    username: row.username,
    profile_completed: Boolean(row.profile_completed),
    active_company_id: row.active_company_id || null,
  });
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });
  return response;
}

export async function findCompanyByLeadKey(key) {
  const token = String(key || '').trim();
  if (!token) return null;
  await ensureSchema();
  const sql = getSql();
  const [company] = await sql`
    SELECT id, name, public_id, lead_token
    FROM companies
    WHERE lead_token = ${token}
       OR public_id = ${token}
    LIMIT 1
  `;
  return company || null;
}
