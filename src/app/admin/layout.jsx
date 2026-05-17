export const metadata = {
  title: 'СвойДом CRM',
};

export default function AdminLayout({ children }) {
  return (
    <>
      <head>
        <link rel="manifest" href="/admin-manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="CRM" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      {children}
    </>
  );
}
