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
          panel: 'var(--crm-panel)',
          surface: 'var(--crm-surface)',
          surfaceStrong: 'var(--crm-surface-strong)',
          'surface-strong': 'var(--crm-surface-strong)',
          'surface-soft': 'var(--crm-surface-soft)',
          border: 'var(--crm-border)',
          'border-strong': 'var(--crm-border-strong)',
          text: 'var(--crm-text)',
          muted: 'var(--crm-text-muted)',
          accent: 'var(--crm-accent)',
          'accent-strong': 'var(--crm-accent-strong)',
          success: 'var(--crm-success)',
          warning: 'var(--crm-warning)',
          danger: 'var(--crm-danger)',
          info: 'var(--crm-info)',
        },
      },
      boxShadow: {
        crmCard: 'var(--crm-shadow-card)',
        crmSoft: 'var(--crm-shadow-soft)',
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
