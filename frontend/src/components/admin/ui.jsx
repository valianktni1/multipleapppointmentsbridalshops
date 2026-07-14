import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Eyebrow, GoldRule } from "@/components/Brand";

export function PageHead({ eyebrow, title, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="text-4xl md:text-5xl mt-2">{title}</h1>
        <GoldRule className="mt-4" />
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

export function Panel({ children, className = "" }) {
  return <div className={`card-wtb p-6 md:p-8 ${className}`}>{children}</div>;
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="field-label block mb-2">{label}</label>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, testid }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} data-testid={testid}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
      style={{ background: checked ? "var(--gold)" : "var(--line)" }}>
      <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
        style={{ transform: checked ? "translateX(22px)" : "translateX(4px)" }} />
    </button>
  );
}

const MODAL_SIZES = {
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
};

export function Modal({ open, onClose, title, children, testid, size = "lg" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  const maxWidth = MODAL_SIZES[size] || MODAL_SIZES.lg;
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid={testid}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fixed inset-0 pointer-events-none" style={{ background: "rgba(42,37,33,.55)", backdropFilter: "blur(2px)" }} />
      <div className="relative min-h-full flex items-start sm:items-center justify-center p-3 sm:p-6"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`relative card-wtb w-full ${maxWidth} my-6 sm:my-10 reveal-up`}>
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 sm:px-8 py-4 border-b"
            style={{ borderColor: "var(--line)", background: "#fff" }}>
            <h3 className="text-2xl sm:text-3xl">{title}</h3>
            <button onClick={onClose} data-testid="modal-close" aria-label="Close"
              className="w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0 hover:bg-[var(--ivory-2)]"
              style={{ color: "var(--taupe)" }}><X size={20} /></button>
          </div>
          <div className="px-5 sm:px-8 py-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function StatusBadge({ status }) {
  const map = {
    pending: { bg: "var(--champagne)", c: "var(--gold-deep)" },
    confirmed: { bg: "#DCEAD9", c: "#3f6b39" },
    cancelled: { bg: "#F0DAD6", c: "#9a4a3f" },
    completed: { bg: "var(--ivory-2)", c: "var(--taupe)" },
    no_show: { bg: "#EADFF0", c: "#6b3f8a" },
    paid: { bg: "#DCEAD9", c: "#3f6b39" },
    pay_in_person: { bg: "var(--champagne)", c: "var(--gold-deep)" },
  };
  const s = map[status] || map.pending;
  const labels = { no_show: "no-show", pay_in_person: "pay in person" };
  return (
    <span className="eyebrow px-3 py-1 inline-block" style={{ background: s.bg, color: s.c, fontSize: "0.55rem" }} data-testid={`status-${status}`}>
      {labels[status] || status}
    </span>
  );
}
