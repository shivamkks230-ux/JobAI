import { Platform } from "react-native";

export const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
export const API = `${BASE}/api`;

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

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errMessage(body: any, status: number) {
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return `${d[0].loc?.slice(-1)[0] ?? "Field"}: ${d[0].msg}`;
  return status >= 500 ? "Server error. Please retry." : "Something went wrong";
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, "No internet connection. Check your network and retry.");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && token && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, errMessage(data, res.status));
  }
  return data as T;
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
