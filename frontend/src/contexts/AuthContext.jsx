import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';
import { unsubscribeOnLogout } from '../utils/push';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      api.get('/me')
        .then(({ data }) => setUser(data))
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (token) => {
    localStorage.setItem('token', token);
    return api.get('/me').then(({ data }) => {
      setUser(data);
      return data;
    });
  };

  // 이 기기의 웹푸시 구독을 먼저 지운다(토큰 필요) — 호출부는 await 후 이동
  const logout = async () => {
    await unsubscribeOnLogout();
    localStorage.removeItem('token');
    setUser(null);
  };

  // 프로필(닉네임·아바타) 저장 후 응답(/me 형태)으로 바로 갱신
  const updateUser = (data) => setUser(data);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
