export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ok: true,
    revision: 'dbg-20260519-2007',
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
      process.env.RENDER_GIT_COMMIT?.slice(0, 7) ||
      process.env.COMMIT_SHA?.slice(0, 7) ||
      null,
  });
}
