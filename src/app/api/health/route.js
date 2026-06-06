export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ok: true,
    revision: process.env.APP_REVISION || 'svoydom-crm',
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
      process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
      process.env.COMMIT_SHA?.slice(0, 7) ||
      null,
  });
}
