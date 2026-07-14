import React from "react";
import { useTenant } from "@/context/TenantContext";

export function Wordmark({ className = "", size = "text-3xl", text = null }) {
  const t = useTenant();
  const branding = t?.tenant?.branding;
  const name = text || branding?.brand_name || "Ivory Digital";
  const logo = branding?.logo;
  if (logo && !text) {
    return <img src={logo} alt={name} className={`inline-block self-start shrink-0 ${className}`}
      style={{ height: "52px", width: "auto", maxWidth: "260px", objectFit: "contain" }} data-testid="brand-logo" />;
  }
  return <span className={`wordmark ${size} ${className}`} data-testid="brand-wordmark">{name}</span>;
}

export function Eyebrow({ children, className = "", ...props }) {
  return <span className={`eyebrow ${className}`} {...props}>{children}</span>;
}

export function GoldRule({ className = "" }) {
  return <span className={`gold-rule block ${className}`} aria-hidden />;
}

export function DesignerCredit({ dark = false }) {
  const t = useTenant();
  const credit = t?.tenant?.branding?.footer_credit || "Designed & Hosted by IvoryDigital";
  return (
    <div className="w-full text-center py-4" data-testid="designer-credit"
      style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,.15)" : "var(--line)"}` }}>
      <a href="https://ivory-digital.uk" target="_blank" rel="noreferrer" data-testid="designer-credit-link"
        className="eyebrow hover:opacity-70 transition-opacity"
        style={{ fontSize: "0.5rem", letterSpacing: "0.28em", color: dark ? "rgba(255,255,255,.8)" : "var(--taupe)" }}>
        {credit}
      </a>
    </div>
  );
}
