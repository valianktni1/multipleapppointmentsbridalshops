import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { FileText, Send, Download, Paperclip, X, Mail, Sparkles } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { Modal, Field } from "@/components/admin/ui";

const GBP = (n) => `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (v) => {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
};
const addCyclePreview = (cycle) => {
  const d = new Date();
  if (cycle === "annual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

const STATUS_STYLE = {
  sent: { bg: "#DCEAD9", c: "#3f6b39" },
  paid: { bg: "#DCEAD9", c: "#3f6b39" },
  draft: { bg: "var(--champagne)", c: "var(--gold-deep)" },
  void: { bg: "#F0DAD6", c: "#9a4a3f" },
};

/* ------------------------------------------------------------- Plan / Billing */
export function PlanModal({ tenant, plans, onClose, onSaved }) {
  const open = !!tenant;
  const existing = tenant?.billing || null;
  const [tier, setTier] = useState("essential");
  const [cycle, setCycle] = useState("monthly");
  const [name, setName] = useState("Essential");
  const [price, setPrice] = useState(15);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!tenant) return;
    if (existing?.plan_tier) {
      setTier(existing.plan_tier);
      setCycle(existing.cycle || "monthly");
      setName(existing.plan_name || "");
      setPrice(existing.price ?? 0);
    } else {
      const p = plans?.[0];
      setTier("essential"); setCycle("monthly");
      setName(p?.name || "Essential"); setPrice(p?.monthly ?? 15);
    }
  }, [tenant]); // eslint-disable-line

  const pickPreset = (p, cyc) => {
    setTier(p.tier); setCycle(cyc); setName(p.name);
    setPrice(cyc === "annual" ? p.annual : p.monthly);
  };
  const pickCustom = () => { setTier("custom"); };

  const save = async () => {
    if (!name.trim()) { toast.error("Please give the plan a name"); return; }
    if (price === "" || Number(price) < 0) { toast.error("Enter a valid price"); return; }
    setBusy(true);
    try {
      await api.post(`/platform/tenants/${tenant.id}/plan`, {
        plan_tier: tier, plan_name: name.trim(), price: Number(price), cycle,
      });
      toast.success(`${tenant.name} is now on the ${name.trim()} plan`);
      onSaved?.(); onClose();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const nextDue = existing?.active && existing?.next_due_date
    ? new Date(existing.next_due_date) : addCyclePreview(cycle);

  return (
    <Modal open={open} onClose={onClose} title="Plan & Billing" size="xl" testid="plan-modal">
      {tenant && (
        <div className="space-y-6">
          <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>
            Set the paid plan for <b>{tenant.name}</b>. Billing repeats {cycle === "annual" ? "every year" : "every month"} from today.
          </p>

          {/* Cycle toggle */}
          <div className="flex gap-2" data-testid="cycle-toggle">
            {["monthly", "annual"].map((c) => (
              <button key={c} type="button" onClick={() => {
                setCycle(c);
                const p = plans?.find((pp) => pp.tier === tier);
                if (p) setPrice(c === "annual" ? p.annual : p.monthly);
              }}
                data-testid={`cycle-${c}`}
                className="flex-1 py-2 font-sans-j text-sm border transition-colors"
                style={{
                  background: cycle === c ? "var(--charcoal)" : "transparent",
                  color: cycle === c ? "var(--ivory)" : "var(--ink)",
                  borderColor: cycle === c ? "var(--charcoal)" : "var(--line)",
                }}>
                {c === "monthly" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>

          {/* Preset cards */}
          <div className="grid sm:grid-cols-2 gap-3">
            {(plans || []).map((p) => {
              const selected = tier === p.tier;
              const amt = cycle === "annual" ? p.annual : p.monthly;
              return (
                <button key={p.tier} type="button" onClick={() => pickPreset(p, cycle)}
                  data-testid={`preset-${p.tier}`}
                  className="text-left p-4 border transition-colors"
                  style={{ borderColor: selected ? "var(--gold)" : "var(--line)", background: selected ? "var(--champagne)" : "transparent" }}>
                  <p className="font-serif-c text-lg" style={{ color: "var(--charcoal)" }}>{p.name}</p>
                  <p className="font-sans-j text-sm mt-1" style={{ color: "var(--gold-deep)" }}>
                    <span className="text-xl">{GBP(amt)}</span> <span className="text-xs">/ {cycle === "annual" ? "year" : "month"}</span>
                  </p>
                </button>
              );
            })}
            <button type="button" onClick={pickCustom} data-testid="preset-custom"
              className="text-left p-4 border transition-colors sm:col-span-2"
              style={{ borderColor: tier === "custom" ? "var(--gold)" : "var(--line)", background: tier === "custom" ? "var(--champagne)" : "transparent" }}>
              <p className="font-serif-c text-lg flex items-center gap-2" style={{ color: "var(--charcoal)" }}><Sparkles size={15} style={{ color: "var(--gold)" }} /> Custom plan</p>
              <p className="font-sans-j text-xs mt-1" style={{ color: "var(--taupe)" }}>Set your own name and price below.</p>
            </button>
          </div>

          {/* Editable name + price (always editable) */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Plan Name">
              <input className="input-wtb" value={name} data-testid="plan-name-input"
                onChange={(e) => { setName(e.target.value); if (tier !== "custom") setTier("custom"); }} />
            </Field>
            <Field label={`Price (£ per ${cycle === "annual" ? "year" : "month"})`}>
              <input className="input-wtb" type="number" min={0} step="0.01" value={price} data-testid="plan-price-input"
                onChange={(e) => { setPrice(e.target.value); if (tier !== "custom") setTier("custom"); }} />
            </Field>
          </div>

          <div className="p-4 border" style={{ borderColor: "var(--line)", background: "var(--ivory-2)" }}>
            <p className="font-sans-j text-sm" style={{ color: "var(--charcoal)" }}>
              {GBP(price)} · {cycle === "annual" ? "Annually" : "Monthly"} — next payment due <b>{fmtDate(nextDue)}</b>
              {existing?.active ? "" : ", then recurring on that date."}
            </p>
          </div>

          <button className="btn-wtb btn-gold w-full" onClick={save} disabled={busy} data-testid="save-plan">
            {busy ? "Saving…" : existing?.active ? "Update Plan" : "Activate Plan"}
          </button>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------- Invoices */
export function InvoicesModal({ tenant, onClose }) {
  const open = !!tenant;
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try { const { data } = await api.get(`/platform/tenants/${tenant.id}/invoices`); setInvoices(data); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setLoading(false); }
  }, [tenant]);

  useEffect(() => { if (tenant) load(); }, [tenant, load]);

  const generate = async (send) => {
    setBusy(true);
    try {
      await api.post(`/platform/tenants/${tenant.id}/generate-invoice`, { send });
      toast.success(send ? "Invoice generated and emailed" : "Draft invoice created");
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const download = async (inv) => {
    try {
      const r = await api.get(`/platform/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "application/pdf" }));
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast.error(apiErr(e)); }
  };

  const billing = tenant?.billing;

  return (
    <Modal open={open} onClose={onClose} title="Invoices" size="3xl" testid="invoices-modal">
      {tenant && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-serif-c text-xl">{tenant.name}</p>
              {billing?.active
                ? <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>{billing.plan_name} · {GBP(billing.price)} / {billing.cycle === "annual" ? "year" : "month"} · next due {fmtDate(billing.next_due_date)}</p>
                : <p className="font-sans-j text-sm" style={{ color: "#9a4a3f" }}>No active plan — set a plan before invoicing.</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn-wtb btn-ghost-wtb" disabled={busy || !billing?.active} onClick={() => generate(false)} data-testid="gen-draft">
                <FileText size={14} className="mr-2" /> Draft
              </button>
              <button className="btn-wtb btn-gold" disabled={busy || !billing?.active} onClick={() => generate(true)} data-testid="gen-send">
                <Send size={14} className="mr-2" /> {busy ? "Working…" : "Generate & Send"}
              </button>
            </div>
          </div>

          <div className="border overflow-x-auto" style={{ borderColor: "var(--line)" }} data-testid="invoices-list">
            <table className="w-full text-sm font-sans-j">
              <thead>
                <tr className="text-left" style={{ background: "var(--ivory-2)" }}>
                  {["Invoice", "Issued", "Due", "Amount", "Status", ""].map((h) => (
                    <th key={h} className="field-label p-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="p-6 text-center" style={{ color: "var(--taupe)" }}>Loading…</td></tr>}
                {!loading && invoices.length === 0 && <tr><td colSpan={6} className="p-6 text-center" style={{ color: "var(--taupe)" }} data-testid="invoices-empty">No invoices yet.</td></tr>}
                {invoices.map((inv) => {
                  const st = STATUS_STYLE[inv.status] || STATUS_STYLE.draft;
                  return (
                    <tr key={inv.id} className="border-t" style={{ borderColor: "var(--line)" }} data-testid={`invoice-${inv.number}`}>
                      <td className="p-3 font-mono">{inv.number}</td>
                      <td className="p-3 whitespace-nowrap">{fmtDate(inv.issued_date)}</td>
                      <td className="p-3 whitespace-nowrap">{fmtDate(inv.due_date)}</td>
                      <td className="p-3">{GBP(inv.amount)}</td>
                      <td className="p-3"><span className="eyebrow px-2 py-1 inline-block" style={{ background: st.bg, color: st.c, fontSize: "0.5rem" }}>{inv.status}</span></td>
                      <td className="p-3">
                        <button onClick={() => download(inv)} data-testid={`download-${inv.number}`}
                          className="flex items-center gap-1 text-xs hover:text-[var(--gold-deep)]" style={{ color: "var(--gold-deep)" }}>
                          <Download size={13} /> PDF
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------- Company / Invoice details */
export function CompanySettingsModal({ open, onClose }) {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get("/platform/company-settings").then(({ data }) => setS(data)).catch((e) => toast.error(apiErr(e)));
  }, [open]);

  const set = (patch) => setS((f) => ({ ...f, ...patch }));
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/platform/company-settings", {
        heading: s.heading, address: s.address, email: s.email,
        bank_account_name: s.bank_account_name, bank_name: s.bank_name,
        bank_sort_code: s.bank_sort_code, bank_account_no: s.bank_account_no,
        vat_number: s.vat_number, payment_terms: s.payment_terms, invoice_prefix: s.invoice_prefix,
      });
      toast.success("Company details saved"); onClose();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Company & Invoice Details" size="xl" testid="company-modal">
      {!s ? <p className="eyebrow">Loading…</p> : (
        <div className="space-y-5">
          <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>These details appear on every invoice you generate.</p>
          <Field label="Invoice Heading / Business Name">
            <input className="input-wtb" value={s.heading || ""} data-testid="co-heading" onChange={(e) => set({ heading: e.target.value })} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Business Address">
              <textarea className="input-wtb" rows={3} value={s.address || ""} data-testid="co-address" onChange={(e) => set({ address: e.target.value })} />
            </Field>
            <div className="space-y-4">
              <Field label="Contact Email"><input className="input-wtb" value={s.email || ""} data-testid="co-email" onChange={(e) => set({ email: e.target.value })} /></Field>
              <Field label="VAT Number (leave blank if not registered)"><input className="input-wtb" value={s.vat_number || ""} data-testid="co-vat" onChange={(e) => set({ vat_number: e.target.value })} /></Field>
            </div>
          </div>
          <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <p className="field-label mb-3">Bank / Payment Details</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Account Name"><input className="input-wtb" value={s.bank_account_name || ""} data-testid="co-bank-name" onChange={(e) => set({ bank_account_name: e.target.value })} /></Field>
              <Field label="Bank"><input className="input-wtb" value={s.bank_name || ""} data-testid="co-bank" onChange={(e) => set({ bank_name: e.target.value })} /></Field>
              <Field label="Sort Code"><input className="input-wtb" value={s.bank_sort_code || ""} data-testid="co-sort" onChange={(e) => set({ bank_sort_code: e.target.value })} placeholder="00-00-00" /></Field>
              <Field label="Account Number"><input className="input-wtb" value={s.bank_account_no || ""} data-testid="co-acct" onChange={(e) => set({ bank_account_no: e.target.value })} /></Field>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Invoice Number Prefix"><input className="input-wtb" value={s.invoice_prefix || ""} data-testid="co-prefix" onChange={(e) => set({ invoice_prefix: e.target.value })} placeholder="INV-" /></Field>
          </div>
          <Field label="Payment Terms / Notes">
            <textarea className="input-wtb" rows={2} value={s.payment_terms || ""} data-testid="co-terms" onChange={(e) => set({ payment_terms: e.target.value })} />
          </Field>
          <button className="btn-wtb btn-gold w-full" onClick={save} disabled={busy} data-testid="save-company">{busy ? "Saving…" : "Save Company Details"}</button>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------- Manual email */
const fileToBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});

export function ManualEmailModal({ open, prefillTo, onClose }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setTo(prefillTo || ""); setSubject(""); setMessage(""); setFiles([]); }
  }, [open, prefillTo]);

  const onPick = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked]);
    e.target.value = "";
  };
  const removeFile = (i) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  const send = async () => {
    if (!to.trim()) { toast.error("Enter a recipient email"); return; }
    if (!subject.trim()) { toast.error("Enter a subject"); return; }
    setBusy(true);
    try {
      const attachments = [];
      for (const f of files) {
        attachments.push({ filename: f.name, content_type: f.type || "application/octet-stream", data_base64: await fileToBase64(f) });
      }
      await api.post("/platform/send-email", { to: to.trim(), subject: subject.trim(), message, attachments });
      toast.success(`Email sent to ${to.trim()}`);
      onClose();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Send Email" size="xl" testid="manual-email-modal">
      <div className="space-y-5">
        <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>
          Sends from your platform email identity (configure it under “Email Settings”). Attach files if needed.
        </p>
        <Field label="To"><input className="input-wtb" type="email" value={to} data-testid="email-to" onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" /></Field>
        <Field label="Subject"><input className="input-wtb" value={subject} data-testid="email-subject" onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><textarea className="input-wtb" rows={7} value={message} data-testid="email-message" onChange={(e) => setMessage(e.target.value)} placeholder="Write your message…" /></Field>

        <div>
          <label className="btn-wtb btn-ghost-wtb inline-flex cursor-pointer" data-testid="email-attach-label">
            <Paperclip size={14} className="mr-2" /> Attach files
            <input type="file" multiple className="hidden" onChange={onPick} data-testid="email-attach-input" />
          </label>
          {files.length > 0 && (
            <div className="mt-3 space-y-2" data-testid="attachment-list">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 border" style={{ borderColor: "var(--line)" }}>
                  <span className="font-sans-j text-xs truncate" style={{ color: "var(--charcoal)" }}>{f.name} <span style={{ color: "var(--taupe)" }}>({Math.ceil(f.size / 1024)} KB)</span></span>
                  <button onClick={() => removeFile(i)} data-testid={`remove-attach-${i}`} style={{ color: "var(--taupe)" }}><X size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="btn-wtb btn-gold w-full" onClick={send} disabled={busy} data-testid="send-manual-email">
          <Mail size={14} className="mr-2" /> {busy ? "Sending…" : "Send Email"}
        </button>
      </div>
    </Modal>
  );
}
