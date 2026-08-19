"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { getCurrentUser, logout as apiLogout, type AuthUser } from "./api";

// A plain (non-httpOnly) marker distinct from the actual session cookie, used only to tell
// "the session expired since we last saw the user logged in" apart from "never logged in" -
// the real cookie is httpOnly and unreadable from JS, so there's no other way to make that
// distinction after a fresh page load.
const HAD_SESSION_KEY = "inkline_had_session";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  sessionExpired: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  const applyResult = useCallback((current: AuthUser | null) => {
    if (current) {
      localStorage.setItem(HAD_SESSION_KEY, "1");
      setSessionExpired(false);
    } else if (localStorage.getItem(HAD_SESSION_KEY)) {
      localStorage.removeItem(HAD_SESSION_KEY);
      setSessionExpired(true);
    }
    setUser(current);
  }, []);

  const refresh = useCallback(async () => {
    applyResult(await getCurrentUser());
  }, [applyResult]);

  useEffect(() => {
    let cancelled = false;

    getCurrentUser().then((current) => {
      if (cancelled) return;
      applyResult(current);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [applyResult]);

  const logout = useCallback(async () => {
    await apiLogout();
    localStorage.removeItem(HAD_SESSION_KEY);
    setSessionExpired(false);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, sessionExpired, refresh, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
