'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ThemeCtx = createContext({ theme: 'light', toggle: () => {} });
export const useTheme = () => useContext(ThemeCtx);

function applyTheme(t) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  document.documentElement.style.colorScheme = t;
}

export function ThemeProvider({ children }) {
  // Start with 'light'; the anti-FOUC inline script already applied the real class
  // before hydration, so there's no visual flash.
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const saved = localStorage.getItem('crm-theme');
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initial = saved ?? (sysDark ? 'dark' : 'light');
    setTheme(initial);
    applyTheme(initial);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      // Enable smooth CSS transition only during the switch
      document.documentElement.classList.add('theme-transitioning');
      applyTheme(next);
      localStorage.setItem('crm-theme', next);
      setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350);
      return next;
    });
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}
