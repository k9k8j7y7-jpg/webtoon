import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

function getInitialTheme() {
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.innerWidth < 640 ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);
  const [userChose, setUserChose] = useState(() => !!localStorage.getItem('theme'));

  const applyTheme = useCallback((t) => {
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, []);

  // 초기 적용
  useEffect(() => { applyTheme(theme); }, []);

  // 폭 변화 시: 사용자가 정한 적 없으면 폭 기준 재판정
  useEffect(() => {
    const onResize = () => {
      if (userChose) return;
      const next = window.innerWidth < 640 ? 'dark' : 'light';
      setThemeState(next);
      applyTheme(next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [userChose, applyTheme]);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      setUserChose(true);
      applyTheme(next);
      return next;
    });
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
