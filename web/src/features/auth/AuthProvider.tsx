import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../../lib/api";
import type { User } from "../../lib/types";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");

  // Boot: resolve the session from the cookie.
  useEffect(() => {
    let cancelled = false;
    api
      .get<User>("/auth/me")
      .then((me) => {
        if (!cancelled) {
          setUser(me);
          setStatus("authenticated");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const me = await api.post<User>("/auth/login", { username, password });
    setUser(me);
    setStatus("authenticated");
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const me = await api.post<User>("/auth/register", { username, password });
    setUser(me);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
