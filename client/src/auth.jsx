import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking
  useEffect(() => { api.me().then((r) => setUser(r.user), () => setUser(null)); }, []);
  const value = {
    user,
    setUser,
    async login(empId, password) { const r = await api.login(empId, password); setUser(r.user); return r.user; },
    async logout() { await api.logout().catch(() => {}); setUser(null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
