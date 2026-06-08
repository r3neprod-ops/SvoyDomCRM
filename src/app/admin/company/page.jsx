import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/admin/company';
import CompanyClient from './CompanyClient';

export const dynamic = 'force-dynamic';

export default async function CompanyPage() {
  const context = await getCurrentUserContext({ requireCompany: true });
  if (!context.user) redirect('/admin/login');
  if (context.needsOnboarding) redirect('/admin/onboarding');

  return <CompanyClient user={context.user} />;
}
