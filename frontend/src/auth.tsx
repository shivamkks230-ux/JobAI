import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { api, setToken, setUnauthorizedHandler } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = "jm_session_token";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "candidate" | "recruiter" | "admin";
  phone?: string;
  company_id?: string;
  company?: any;
  profile_completion?: number;
  photo_file_id?: string;
  unread_notifications?: number;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (body: any) => Promise<void>;
  googleLogin: () => Promise<void>;
  logout: (all?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  clearLocal: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({} as Ctx);
export const useAuth = () => useContext(AuthContext);

const extractSessionId = (url?: string | null) => url?.match(/[?#&]session_id=([^&#]+)/)?.[1] ?? null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const sent = useRef(new Set<string>());

  const clearLocal = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    queryClient.clear();
    setUser(null);
  }, []);

  const applySession = useCallback(async (token: string, u: User) => {
    await storage.secureSet(TOKEN_KEY, token);
    setToken(token);
    setUser(u);
  }, []);

  const exchange = useCallback(
    async (sessionId: string) => {
      if (sent.current.has(sessionId)) return;
      sent.current.add(sessionId);
      const res = await api("/auth/session", { body: { session_id: sessionId } });
      await applySession(res.session_token, res.user);
    },
    [applySession],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearLocal();
    });
    (async () => {
      try {
        if (Platform.OS === "web" && typeof window !== "undefined") {
          const sid = extractSessionId(window.location.href);
          if (sid) {
            await exchange(sid);
            const clean = window.location.href.replace(/[?#&]session_id=[^&#]+/, "");
            window.history.replaceState(window.history.state, "", clean);
            return;
          }
        } else {
          const sid = extractSessionId(await Linking.getInitialURL());
          if (sid) {
            await exchange(sid);
            return;
          }
        }
        const t = await storage.secureGet(TOKEN_KEY, null as string | null);
        if (t) {
          setToken(t);
          const me = await api<User>("/auth/me");
          setUser(me);
        }
      } catch {
        await clearLocal();
      } finally {
        setLoading(false);
      }
    })();
  }, [clearLocal, exchange]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api("/auth/login", { body: { email, password } });
      await applySession(res.token, res.user);
    },
    [applySession],
  );

  const register = useCallback(
    async (body: any) => {
      const res = await api("/auth/register", { body });
      await applySession(res.token, res.user);
    },
    [applySession],
  );

  const googleLogin = useCallback(async () => {
    if (Platform.OS === "web") {
      const redirect = window.location.origin + "/";
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
      return;
    }
    const redirect = Linking.createURL("");
    let captured: string | null = null;
    const sub = Linking.addEventListener("url", (e) => {
      captured = e.url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(
        `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`,
        redirect,
      );
      const url = (result as any).url ?? captured ?? (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (sid) await exchange(sid);
    } finally {
      sub.remove();
    }
  }, [exchange]);

  const logout = useCallback(
    async (all = false) => {
      try {
        await api(all ? "/auth/logout-all" : "/auth/logout", { method: "POST" });
      } catch {}
      await clearLocal();
    },
    [clearLocal],
  );

  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>("/auth/me"));
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, googleLogin, logout, refresh, clearLocal }}>
      {children}
    </AuthContext.Provider>
  );
}
