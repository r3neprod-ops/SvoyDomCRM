import { redirect } from 'next/navigation';
import { getCurrentUserContext } from '@/lib/admin/company';
import OnboardingClient from './OnboardingClient';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const context = await getCurrentUserContext();
  if (!context.user) redirect('/admin/login');
  if (!context.needsOnboarding) redirect('/admin/dashboard');

  return <OnboardingClient initialUser={context.user} initialCompany={context.company} />;
}
