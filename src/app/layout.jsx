import './globals.css';

export const metadata = {
  title: 'СвойДом CRM',
  description: 'Панель управления лидами СвойДом',
  manifest: '/admin-manifest.json',
  appleWebApp: {
    capable: true,
    title: 'CRM',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
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
        {children}
      </body>
    </html>
  );
}
