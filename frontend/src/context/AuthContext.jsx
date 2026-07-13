import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { apiErr, currentTenantSlug } from "@/lib/api";

const AuthContext = createContext(null);
const TOKEN_KEY = "ivory_tenant_token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = anon, obj = user
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || !currentTenantSlug()) { setUser(false); setChecking(false); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      localStorage.removeItem(TOKEN_KEY);
      setUser(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.mfa_required) return { mfa_required: true, mfa_token: data.mfa_token };
    localStorage.setItem(TOKEN_KEY, data.access_token);
    await refresh();
    return { ok: true };
  };

  const verify2fa = async (mfa_token, code) => {
    const { data } = await api.post("/auth/2fa/verify", { mfa_token, code });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    await refresh();
    return { ok: true };
  };

  const loginWithToken = async (token) => {
    localStorage.setItem(TOKEN_KEY, token);
    await refresh();
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, checking, login, verify2fa, loginWithToken, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
export { apiErr };
