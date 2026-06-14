import './globals.css';
import InstallAppPrompt from './InstallAppPrompt';
import ServiceWorkerRegistration from './ServiceWorkerRegistration';
import { ThemeProvider } from './ThemeProvider';

// Runs synchronously before React hydration to prevent theme flash
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('crm-theme')||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;}catch(e){}})();`;

export const metadata = {
  title: 'CRM24',
  description: 'CRM для лидов, команды, чатов и компаний',
  applicationName: 'CRM24',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'CRM24',
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
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#07111f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        {/* Anti-FOUC: apply saved theme before React paints */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ThemeProvider>
          <ServiceWorkerRegistration />
          {children}
          <InstallAppPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
