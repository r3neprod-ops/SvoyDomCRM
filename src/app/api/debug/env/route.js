export async function GET() {
  return Response.json({
    hasVapidPublic: !!process.env.VAPID_PUBLIC_KEY || !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    hasVapidPrivate: !!process.env.VAPID_PRIVATE_KEY,
    hasVapidSubject: !!process.env.VAPID_SUBJECT,
    vapidPublicLen: (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').length,
    vapidSubjectValue: process.env.VAPID_SUBJECT || null,
  });
}
