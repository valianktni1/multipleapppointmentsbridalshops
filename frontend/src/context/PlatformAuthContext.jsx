import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { apiErr } from "@/lib/api";

const PlatformAuthContext = createContext(null);
const TOKEN_KEY = "ivory_platform_token";

export function PlatformAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { setUser(false); setChecking(false); return; }
    try {
      const { data } = await api.get("/platform/me");
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
    const { data } = await api.post("/platform/login", { email, password });
    if (data.mfa_required) return { mfa_required: true, mfa_token: data.mfa_token };
    localStorage.setItem(TOKEN_KEY, data.access_token);
    await refresh();
    return { ok: true };
  };

  const verify2fa = async (mfa_token, code) => {
    const { data } = await api.post("/platform/2fa/verify", { mfa_token, code });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    await refresh();
    return { ok: true };
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(false);
  };

  return (
    <PlatformAuthContext.Provider value={{ user, checking, login, verify2fa, logout, refresh }}>
      {children}
    </PlatformAuthContext.Provider>
  );
}

export const usePlatformAuth = () => useContext(PlatformAuthContext);
export { apiErr };
