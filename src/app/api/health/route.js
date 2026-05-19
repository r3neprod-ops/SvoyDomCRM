export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ok: true,
    revision: '2026-05-19-lead-assignment-hardening',
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
      process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
      process.env.COMMIT_SHA?.slice(0, 7) ||
      null,
  });
}
