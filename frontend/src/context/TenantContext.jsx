import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Outlet } from "react-router-dom";
import api from "@/lib/api";

const TenantCtx = createContext(null);
export const useTenant = () => useContext(TenantCtx);

function applyBranding(branding) {
  if (!branding) return;
  const root = document.documentElement;
  if (branding.primary_color) root.style.setProperty("--gold", branding.primary_color);
  if (branding.accent_color) root.style.setProperty("--gold-deep", branding.accent_color);
}

function resetBranding() {
  const root = document.documentElement;
  root.style.removeProperty("--gold");
  root.style.removeProperty("--gold-deep");
}

export default function TenantLayout() {
  const { tenant: slug } = useParams();
  const [tenant, setTenant] = useState(null); // null=loading, false=notfound, obj

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/tenant/context", { headers: { "X-Tenant": slug } });
      setTenant(data);
      applyBranding(data.branding);
      if (data.branding?.brand_name) document.title = `${data.branding.brand_name} · Appointments`;
    } catch (e) {
      setTenant(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
    return () => resetBranding();
  }, [load]);

  if (tenant === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ivory)" }}>
        <span className="eyebrow">Loading…</span>
      </div>
    );
  }
  if (tenant === false) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--ivory)" }}>
        <div className="card-wtb p-10 md:p-14 max-w-lg text-center" data-testid="tenant-not-found">
          <h1 className="text-4xl mb-3">Company Not Found</h1>
          <span className="gold-rule block mx-auto mb-5" />
          <p className="font-sans-j" style={{ color: "var(--taupe)" }}>
            We couldn't find a company at <b>/{slug}</b>. Please check the web address.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TenantCtx.Provider value={{ tenant, reload: load }}>
      <Outlet />
    </TenantCtx.Provider>
  );
}
