import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/admin/company';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({ searchParams }) {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) redirect('/admin/login');
  if (context.needsOnboarding) redirect('/admin/onboarding');
  return <DashboardClient user={context.user} company={context.company} initialTab={searchParams?.tab} />;
}
