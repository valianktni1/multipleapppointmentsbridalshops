import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
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
  return <TenantScope key={slug} slug={slug} />;
}

function TenantScope({ slug }) {
  const [tenant, setTenant] = useState(null); // null=loading, false=notfound, obj
  const [loadError, setLoadError] = useState(false);
  const request = useRef(null);

  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoadError(false);
    try {
      const { data } = await api.get("/tenant/context", {
        headers: { "X-Tenant": slug }, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setTenant(data);
      applyBranding(data.branding);
      if (data.branding?.brand_name) document.title = `${data.branding.brand_name} · Appointments`;
    } catch (e) {
      if (controller.signal.aborted) return;
      if (e.response?.status === 404) setTenant(false);
      else setLoadError(true);
    }
  }, [slug]);

  useEffect(() => {
    load();
    return () => {
      request.current?.abort();
      resetBranding();
    };
  }, [load]);

  if (loadError && tenant === null) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="card-wtb p-8 text-center" role="alert">
          <h1 className="text-3xl mb-4">We couldn’t load this booking site</h1>
          <button type="button" className="btn-wtb btn-gold" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }
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
