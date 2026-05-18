export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return Response.json({ ok: false, message: 'VAPID_PUBLIC_KEY is not configured' }, { status: 500 });
  }
  return Response.json({ ok: true, publicKey });
}
