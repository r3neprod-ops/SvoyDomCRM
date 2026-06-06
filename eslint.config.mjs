import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'public/sw.js'],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      'import/no-anonymous-default-export': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];
