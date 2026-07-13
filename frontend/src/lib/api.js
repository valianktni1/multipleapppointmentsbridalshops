import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const RESERVED = new Set(["superadmin", "admin", "api", "platform", "static", "assets", "www", "app", "booking", ""]);

export function currentTenantSlug() {
  const seg = window.location.pathname.split("/").filter(Boolean)[0];
  if (!seg || RESERVED.has(seg)) return null;
  return seg;
}

const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const isPlatform = window.location.pathname.startsWith("/superadmin");
  const token = isPlatform
    ? localStorage.getItem("ivory_platform_token")
    : localStorage.getItem("ivory_tenant_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const t = currentTenantSlug();
  if (t && !config.headers["X-Tenant"]) config.headers["X-Tenant"] = t;
  return config;
});

export function apiErr(e, fallback = "Something went wrong. Please try again.") {
  const d = e?.response?.data?.detail;
  if (d == null) return e?.message || fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(" ");
  if (d?.msg) return d.msg;
  return String(d);
}

export default api;
