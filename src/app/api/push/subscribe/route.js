import { getSql, ensureSchema } from '@/lib/admin/db';
import { getCurrentUserContext, onboardingResponse } from '@/lib/admin/company';

function detectPlatform(userAgent = '') {
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os')) return 'macos';
  return 'unknown';
}

function isValidSubscription(subscription) {
  return Boolean(
    subscription?.endpoint &&
    subscription?.keys?.p256dh &&
    subscription?.keys?.auth
  );
}

export async function POST(request) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return Response.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;

  let subscription;
  try {
    ({ subscription } = await request.json());
  } catch {
    return Response.json({ ok: false, message: 'Некорректный JSON' }, { status: 400 });
  }

  if (!isValidSubscription(subscription)) {
    return Response.json({ ok: false, message: 'Браузер вернул неполную push-подписку' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();
  const userAgent = request.headers.get('user-agent') || '';
  const platform = detectPlatform(userAgent);

  const [row] = await sql`
    INSERT INTO push_subscriptions (endpoint, subscription, user_id, company_id, user_agent, platform, updated_at)
    VALUES (${subscription.endpoint}, ${sql.json(subscription)}, ${user.id}, ${companyId}, ${userAgent}, ${platform}, NOW())
    ON CONFLICT (endpoint) DO UPDATE SET
      subscription = EXCLUDED.subscription,
      user_id = EXCLUDED.user_id,
      company_id = EXCLUDED.company_id,
      user_agent = EXCLUDED.user_agent,
      platform = EXCLUDED.platform,
      updated_at = NOW(),
      last_error_at = NULL,
      last_error = NULL,
      last_status_code = NULL
    RETURNING id, endpoint, platform, created_at, updated_at
  `;

  return Response.json({ ok: true, subscription: row });
}

export async function DELETE(request) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) return Response.json({ ok: false }, { status: 401 });
  if (context.needsOnboarding) return onboardingResponse();
  const { user, companyId } = context;

  let endpoint;
  try {
    ({ endpoint } = await request.json());
  } catch {
    return Response.json({ ok: false, message: 'Некорректный JSON' }, { status: 400 });
  }

  await ensureSchema();
  const sql = getSql();

  if (endpoint) {
    await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint} AND user_id = ${user.id} AND company_id = ${companyId}`;
  } else {
    await sql`DELETE FROM push_subscriptions WHERE user_id = ${user.id} AND company_id = ${companyId}`;
  }

  return Response.json({ ok: true });
}
