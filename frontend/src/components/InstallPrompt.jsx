import React, { useEffect, useState, useCallback } from "react";
import { Download, X, Share, Plus, Sparkles } from "lucide-react";
import api from "@/lib/api";
import { RESERVED } from "@/lib/api";

/* When the banner appears (ms after load, once conditions are met). */
const SHOW_DELAY = 3000;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
  !window.MSStream;

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches ||
  window.navigator.standalone === true;

function currentScopeSlug() {
  const seg = window.location.pathname.split("/").filter(Boolean)[0] || "";
  if (window.location.pathname.startsWith("/superadmin")) return "platform";
  if (!seg || RESERVED.has(seg)) return "platform";
  return seg;
}

/* Swap in a per-tenant manifest so the installed app uses the boutique's
   name + logo + colours. Uses absolute URLs (required for blob manifests). */
function applyTenantManifest(slug, branding) {
  try {
    if (!branding || slug === "platform") return;
    const origin = window.location.origin;
    const brand = branding.brand_name || "Appointments";
    const icons = [
      { src: `${origin}/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${origin}/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${origin}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ];
    if (branding.logo && branding.logo.startsWith("data:")) {
      icons.unshift({ src: branding.logo, sizes: "512x512", type: "image/png", purpose: "any" });
    }
    const manifest = {
      name: `${brand} — Appointments`,
      short_name: brand.slice(0, 24),
      description: `Book your appointment with ${brand}.`,
      start_url: `${origin}/${slug}`,
      scope: `${origin}/${slug}`,
      display: "standalone",
      background_color: "#f7f3ee",
      theme_color: branding.primary_color || "#B0904F",
      icons,
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const url = URL.createObjectURL(blob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) { link = document.createElement("link"); link.rel = "manifest"; document.head.appendChild(link); }
    link.setAttribute("href", url);
    if (branding.logo && branding.logo.startsWith("data:")) {
      let apple = document.querySelector('link[rel="apple-touch-icon"]');
      if (apple) apple.setAttribute("href", branding.logo);
    }
  } catch (e) { /* non-fatal */ }
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [brand, setBrand] = useState({ name: "Ivory Digital", logo: "", color: "#B0904F" });
  const ios = isIOS();
  const slug = currentScopeSlug();
  const dismissKey = `pwa_install_dismissed_${slug}`;

  const dismissedBefore = useCallback(() => {
    try { return localStorage.getItem(dismissKey) === "1"; } catch { return false; }
  }, [dismissKey]);

  // Load tenant branding (for the banner + per-tenant manifest)
  useEffect(() => {
    if (slug === "platform") return;
    let cancelled = false;
    api.get("/tenant/context", { headers: { "X-Tenant": slug } })
      .then(({ data }) => {
        if (cancelled) return;
        const b = data.branding || {};
        setBrand({ name: b.brand_name || "Appointments", logo: b.logo || "", color: b.primary_color || "#B0904F" });
        applyTenantManifest(slug, b);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  // Capture Android/Chrome install event
  useEffect(() => {
    const onBIP = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setVisible(false); try { localStorage.setItem(dismissKey, "1"); } catch {} };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [dismissKey]);

  // Decide whether to show (after a short, non-intrusive delay)
  useEffect(() => {
    if (isStandalone() || dismissedBefore()) return;
    // Android shows only when the browser offers the native prompt; iOS always eligible.
    if (!ios && !deferred) return;
    const t = setTimeout(() => setVisible(true), SHOW_DELAY);
    return () => clearTimeout(t);
  }, [deferred, ios, dismissedBefore]);

  const close = () => {
    setVisible(false);
    try { localStorage.setItem(dismissKey, "1"); } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    try {
      deferred.prompt();
      await deferred.userChoice;
    } catch { /* ignore */ }
    setDeferred(null);
    close();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[300] px-3 pb-3 sm:px-4 sm:pb-4 flex justify-center pointer-events-none"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
      <div className="pointer-events-auto w-full max-w-md card-wtb shadow-xl overflow-hidden reveal-up"
        style={{ background: "#fff" }} data-testid="pwa-install-banner" role="dialog" aria-label="Install app">
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center"
              style={{ background: brand.color }}>
              {brand.logo
                ? <img src={brand.logo} alt={brand.name} className="w-full h-full" style={{ objectFit: "contain" }} />
                : <Sparkles size={22} style={{ color: "#f7f3ee" }} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-serif-c text-lg leading-tight" style={{ color: "var(--charcoal)" }} data-testid="pwa-banner-title">
                Add {brand.name} to your home screen
              </p>
              <p className="font-sans-j text-xs mt-1" style={{ color: "var(--taupe)" }}>
                {ios
                  ? "Enjoy a faster, full-screen experience — no App Store needed."
                  : "Install the app for one-tap access, full-screen and offline-ready."}
              </p>
            </div>
            <button onClick={close} aria-label="Dismiss" data-testid="pwa-dismiss"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--ivory-2)]"
              style={{ color: "var(--taupe)" }}>
              <X size={18} />
            </button>
          </div>

          {ios ? (
            <div className="mt-4 flex items-center gap-2 flex-wrap font-sans-j text-sm px-3 py-2 border"
              style={{ borderColor: "var(--line)", background: "var(--ivory-2)", color: "var(--charcoal)" }}
              data-testid="pwa-ios-hint">
              <span>Tap</span>
              <Share size={16} style={{ color: "var(--gold-deep)" }} />
              <span className="font-medium">Share</span>
              <span>then</span>
              <span className="inline-flex items-center gap-1 font-medium"><Plus size={15} style={{ color: "var(--gold-deep)" }} /> Add to Home Screen</span>
            </div>
          ) : (
            <div className="mt-4 flex gap-2">
              <button onClick={install} className="btn-wtb btn-gold flex-1 justify-center" data-testid="pwa-install-btn">
                <Download size={15} className="mr-2" /> Install app
              </button>
              <button onClick={close} className="btn-wtb btn-ghost-wtb" data-testid="pwa-not-now">Not now</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
