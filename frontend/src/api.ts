import Constants from "expo-constants";
import { Platform } from "react-native";

function resolveBase(): string | null {
  const env = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (env) return env.replace(/\/+$/, "");
  // Expo Go / dev preview fallback: /api on the Metro host is proxied to the backend.
  // Standalone builds (APK/AAB) have no hostUri and must bundle EXPO_PUBLIC_BACKEND_URL.
  const host = Constants.expoConfig?.hostUri;
  if (host) {
    const scheme = /:\d+$/.test(host) && !host.includes("emergentagent.com") ? "http" : "https";
    return `${scheme}://${host}`;
  }
  return null;
}

export const BASE = resolveBase();
export const API = BASE ? `${BASE}/api` : "";

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setToken(t: string | null) {
  token = t;
}
export function getToken() {
  return token;
}
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

export type ApiErrorKind = "config" | "network" | "timeout" | "http";

export class ApiError extends Error {
  status: number;
  kind: ApiErrorKind;
  constructor(status: number, message: string, kind: ApiErrorKind = "http") {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

// A release build must talk to a public HTTPS backend. localhost / 10.0.2.2 / plain http
// only work in an emulator or are blocked by Android's cleartext policy.
export function backendConfigProblem(): string | null {
  if (!BASE) return "This build was created without the server address (EXPO_PUBLIC_BACKEND_URL). Open the app via the Expo Go QR code, or set it in Deployment → Secrets, redeploy and generate a new build.";
  if (!/^https:\/\//i.test(BASE) && Platform.OS !== "web") return `Backend URL must use HTTPS (current: ${BASE}).`;
  if (/localhost|127\.0\.0\.1|10\.0\.2\.2/.test(BASE) && Platform.OS !== "web") return `Backend URL points to a local address (${BASE}) that a phone cannot reach.`;
  return null;
}

export const backendHost = () => (BASE ?? "not set").replace(/^https?:\/\//, "");

const STATUS_MSG: Record<number, string> = {
  400: "Please check the information entered.",
  401: "Invalid email or password.",
  403: "You are not authorized to perform this action.",
  404: "Requested service was not found.",
  409: "An account with this email already exists.",
  429: "Too many attempts. Please wait a moment and try again.",
};

function errMessage(body: any, status: number) {
  if (status >= 502 && status <= 504) return "Server is temporarily unavailable. Please try again.";
  if (status >= 500) return "Something went wrong on the server. Please try again.";
  const d = body?.detail;
  // Prefer the server's specific, user-safe explanation (e.g. "Password must be at least 8 characters").
  if (typeof d === "string" && d) return d;
  if (Array.isArray(d) && d[0]?.msg) return `${d[0].loc?.slice(-1)[0] ?? "Field"}: ${d[0].msg}`;
  return STATUS_MSG[status] ?? "Something went wrong. Please try again.";
}

const isAuthPath = (p: string) => p.startsWith("/auth") || p === "/health";

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: any; form?: FormData; timeoutMs?: number } = {},
): Promise<T> {
  const cfg = backendConfigProblem();
  if (cfg) throw new ApiError(0, cfg, "config");
  const method = opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const timeoutMs = opts.timeoutMs ?? (opts.form ? 120000 : /^\/(ai|coach)/.test(path) ? 90000 : 30000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  const debug = isAuthPath(path);
  if (debug) console.log(`AUTH_DEBUG -> ${method} ${backendHost()}/api${path}`);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    const timedOut = e?.name === "AbortError";
    if (debug) console.log(`AUTH_DEBUG x ${method} /api${path} ${timedOut ? "TIMEOUT" : "NETWORK_ERROR"} after ${Date.now() - started}ms: ${e?.message}`);
    if (timedOut) throw new ApiError(0, "Server is taking too long to respond. Please try again.", "timeout");
    throw new ApiError(0, "Unable to connect to the server. Please check your internet connection.", "network");
  }
  clearTimeout(timer);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (debug) console.log(`AUTH_DEBUG <- ${method} /api${path} ${res.status} in ${Date.now() - started}ms${res.ok ? "" : ` detail=${typeof data?.detail === "string" ? data.detail : res.status}`}`);
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, errMessage(data, res.status));
  }
  return data as T;
}

// Connectivity probe used by the login screen diagnostics.
export async function checkHealth(): Promise<{ ok: boolean; message: string; ms: number }> {
  const t = Date.now();
  try {
    await api("/health", { timeoutMs: 10000 });
    return { ok: true, message: `Connected to ${backendHost()}`, ms: Date.now() - t };
  } catch (e: any) {
    return { ok: false, message: `${e.message} (${backendHost()})`, ms: Date.now() - t };
  }
}

export async function uploadFile(path: string, file: { uri: string; name: string; mimeType?: string | null; file?: any }) {
  const form = new FormData();
  if (Platform.OS === "web") {
    const blob = file.file ?? (await (await fetch(file.uri)).blob());
    form.append("file", blob, file.name);
  } else {
    form.append("file", { uri: file.uri, name: file.name, type: file.mimeType ?? "application/octet-stream" } as any);
  }
  return api(path, { form });
}

export function fileUrl(fileId?: string | null, download = false) {
  if (!fileId) return null;
  return `${API}/files/${fileId}?token=${encodeURIComponent(token ?? "")}${download ? "&download=1" : ""}`;
}

export function formatSalary(min?: number | null, max?: number | null, period?: string) {
  if (!min && !max) return "Not disclosed";
  const f = (v: number) =>
    period === "monthly" ? `₹${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `₹${(v / 100000).toFixed(v % 100000 ? 1 : 0)}L`;
  const range = min && max ? `${f(min)}–${f(max)}` : f((max || min) as number);
  return `${range}${period === "monthly" ? "/mo" : " PA"}`;
}

export function formatExp(min?: number | null, max?: number | null) {
  if (min == null && max == null) return "Any experience";
  if (!min && !max) return "Fresher";
  return max != null ? `${min ?? 0}–${max} yrs` : `${min}+ yrs`;
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export const label = (s?: string | null) => (s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "");
