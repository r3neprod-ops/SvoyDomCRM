import Script from 'next/script';
import './globals.css';

export const metadata = {
  title: 'Покупка недвижимости в Луганске под ключ — под ваш бюджет',
  description: 'Полное сопровождение покупки недвижимости в Луганске: подберём вариант под ваш бюджет и проведём за руку от первого шага до сделки. Всю суету берём на себя.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'СвойДом',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/icon-192.png',
    other: [
      { rel: 'icon', url: '/favicon-96x96.png', sizes: '96x96' },
    ],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#000000',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="СвойДом" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Preload hero image for mobile — speeds up LCP on slow connections */}
        <link
          rel="preload"
          as="image"
          href="/_next/image?url=%2Fimages%2Fhero.webp&w=828&q=60"
          fetchPriority="high"
          media="(max-width: 768px)"
        />
      </head>
      <body>
        {children}

        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=109129738', 'ym');

            ym(109129738, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
          `}
        </Script>

        <noscript>
          <div>
            <img
              src="https://mc.yandex.ru/watch/109129738"
              style={{ position: 'absolute', left: '-9999px' }}
              alt=""
            />
          </div>
        </noscript>

        <Script id="register-sw" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js'); }`}
        </Script>
      </body>
    </html>
  );
}
