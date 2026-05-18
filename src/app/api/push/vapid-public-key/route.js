import { getVapidPublicKey } from '@/lib/admin/pushConfig';

export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return Response.json({
      ok: false,
      code: 'vapid_public_key_missing',
      message: 'VAPID_PUBLIC_KEY or NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured',
    }, { status: 500 });
  }
  return Response.json({ ok: true, publicKey });
}
