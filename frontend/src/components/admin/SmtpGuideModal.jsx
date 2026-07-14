import React, { useMemo, useState } from "react";
import { Search, KeyRound, Copy, ShieldCheck, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/admin/ui";
import {
  SMTP_PROVIDERS,
  APP_PASSWORD_EXPLAINER,
  TROUBLESHOOTING_TIPS,
} from "@/constants/smtpProviders";

function EncBadge({ encryption }) {
  const ssl = encryption.startsWith("SSL");
  return (
    <span
      className="eyebrow px-2 py-1 inline-block whitespace-nowrap"
      style={{
        fontSize: "0.5rem",
        background: ssl ? "var(--champagne)" : "var(--ivory-2)",
        color: ssl ? "var(--gold-deep)" : "var(--taupe)",
      }}
    >
      {encryption}
    </span>
  );
}

export default function SmtpGuideModal({ open, onClose }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return SMTP_PROVIDERS;
    return SMTP_PROVIDERS.filter(
      (p) =>
        p.provider.toLowerCase().includes(term) ||
        p.host.toLowerCase().includes(term)
    );
  }, [q]);

  const copyHost = (host) => {
    navigator.clipboard?.writeText(host);
    toast.success(`Copied “${host}”`);
  };

  return (
    <Modal open={open} onClose={onClose} title="Common Email SMTP Settings" size="3xl" testid="smtp-guide-modal">
      <p className="font-sans-j text-sm mb-5" style={{ color: "var(--taupe)" }}>
        Find your email provider below and copy the matching SMTP server and port into the settings form.
        Most providers offer two secure options — use whichever your account supports.
      </p>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--taupe)" }} />
        <input
          className="input-wtb pl-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search provider or server (e.g. Gmail, outlook, yahoo)…"
          data-testid="smtp-guide-search"
        />
      </div>

      {/* Provider list */}
      <div className="border" style={{ borderColor: "var(--line)" }} data-testid="smtp-guide-list">
        {/* Header row (desktop) */}
        <div
          className="hidden md:grid grid-cols-12 gap-3 px-4 py-3 border-b"
          style={{ borderColor: "var(--line)", background: "var(--ivory-2)" }}
        >
          <div className="col-span-3 field-label">Provider</div>
          <div className="col-span-4 field-label">SMTP Server</div>
          <div className="col-span-2 field-label">Port / Encryption</div>
          <div className="col-span-3 field-label">Notes</div>
        </div>

        {rows.length === 0 && (
          <p className="font-sans-j text-sm px-4 py-6" style={{ color: "var(--taupe)" }} data-testid="smtp-guide-empty">
            No providers match “{q}”. Try a different name, or use the Custom domain settings from your email host.
          </p>
        )}

        {rows.map((p, i) => (
          <div
            key={p.provider}
            className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-3 px-4 py-4 md:items-center"
            style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}
            data-testid={`smtp-row-${i}`}
          >
            <div className="md:col-span-3">
              <p className="font-sans-j text-sm" style={{ color: "var(--charcoal)" }}>{p.provider}</p>
              {p.appPassword && (
                <span className="inline-flex items-center gap-1 mt-1 eyebrow" style={{ fontSize: "0.45rem", color: "var(--gold-deep)" }}>
                  <KeyRound size={10} /> App password
                </span>
              )}
            </div>

            <div className="md:col-span-4">
              <button
                type="button"
                onClick={() => copyHost(p.host)}
                className="group inline-flex items-center gap-2 font-mono text-sm text-left hover:text-[var(--gold-deep)] transition-colors"
                style={{ color: "var(--ink)" }}
                data-testid={`smtp-copy-${i}`}
              >
                {p.host}
                <Copy size={13} className="opacity-40 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-2">
              {p.options.map((o) => (
                <span key={`${o.port}-${o.encryption}`} className="inline-flex items-center gap-1">
                  <span className="font-mono text-sm" style={{ color: "var(--ink)" }}>{o.port}</span>
                  <EncBadge encryption={o.encryption} />
                </span>
              ))}
            </div>

            <div className="md:col-span-3">
              <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>{p.notes}</p>
            </div>
          </div>
        ))}
      </div>

      {/* App password explainer */}
      <div className="mt-6 p-5 border" style={{ borderColor: "var(--gold)", background: "var(--champagne)" }}>
        <div className="flex items-center gap-2 mb-2">
          <KeyRound size={16} style={{ color: "var(--gold-deep)" }} />
          <h4 className="text-lg" style={{ color: "var(--gold-deep)" }}>{APP_PASSWORD_EXPLAINER.title}</h4>
        </div>
        <p className="font-sans-j text-sm" style={{ color: "var(--charcoal)" }}>{APP_PASSWORD_EXPLAINER.body}</p>
        <p className="font-sans-j text-xs mt-2" style={{ color: "var(--taupe)" }}>{APP_PASSWORD_EXPLAINER.providersNeedingIt}</p>
      </div>

      {/* Troubleshooting */}
      <div className="mt-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck size={16} style={{ color: "var(--gold)" }} />
          <h4 className="text-lg">Still unable to connect?</h4>
        </div>
        <ul className="font-sans-j text-sm space-y-2" style={{ color: "var(--taupe)" }}>
          {TROUBLESHOOTING_TIPS.map((tip, i) => (
            <li key={i} className="flex gap-2">
              <HelpCircle size={15} className="shrink-0 mt-0.5" style={{ color: "var(--gold)" }} />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
