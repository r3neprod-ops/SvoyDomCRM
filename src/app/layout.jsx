import './globals.css';
import ServiceWorkerRegistration from './ServiceWorkerRegistration';

export const metadata = {
  title: 'СвойДом CRM',
  description: 'Панель управления лидами СвойДом',
  applicationName: 'СвойДом CRM',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'СвойДом CRM',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/icon-192.png',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#0f172a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
