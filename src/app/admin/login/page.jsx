import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getAuthUser } from '@/lib/admin/auth';
import LoginForm from './LoginForm';

export default async function LoginPage() {
  const user = await getAuthUser();
  if (user) {
    redirect('/admin/dashboard');
  }
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
