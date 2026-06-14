import AppLock from './AppLock';

export const metadata = {
  title: 'СвойДом CRM',
};

export default function AdminLayout({ children }) {
  return <AppLock>{children}</AppLock>;
}
