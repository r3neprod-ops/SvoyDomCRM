/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,jsx}',
    './src/components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        crm: {
          bg: 'var(--crm-bg)',
          surface: 'var(--crm-surface)',
          surfaceStrong: 'var(--crm-surface-strong)',
          border: 'var(--crm-border)',
          text: 'var(--crm-text)',
          muted: 'var(--crm-text-muted)',
          accent: 'var(--crm-accent)',
          success: 'var(--crm-success)',
          warning: 'var(--crm-warning)',
          danger: 'var(--crm-danger)',
        },
      },
      boxShadow: {
        crmCard: 'var(--crm-shadow-card)',
        crmGlow: 'var(--crm-shadow-glow)',
      },
      borderRadius: {
        crmLg: 'var(--crm-radius-lg)',
        crmXl: 'var(--crm-radius-xl)',
        crm2xl: '1.5rem',
      },
    },
  },
  plugins: [],
};
