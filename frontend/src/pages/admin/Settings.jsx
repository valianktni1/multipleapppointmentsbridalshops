import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Field, Toggle } from "@/components/admin/ui";
import { useParams } from "react-router-dom";

export default function Settings() {
  const { tenant } = useParams();
  const [s, setS] = useState(null);

  useEffect(() => { api.get("/settings").then((r) => setS(r.data)).catch((e) => toast.error(apiErr(e))); }, []);

  const save = async () => {
    try { await api.put("/settings", s); toast.success("Settings saved"); } catch (e) { toast.error(apiErr(e)); }
  };

  if (!s) return <p className="eyebrow">Loading…</p>;

  const set = (patch) => setS({ ...s, ...patch });

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Superadmin" title="Settings" />

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel>
          <h3 className="text-2xl mb-1">Business Email</h3>
          <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }}>Generic address the app sends from. Configure SMTP to enable outgoing email.</p>
          <div className="space-y-5">
            <Field label="From Name"><input className="input-wtb" value={s.from_name || ""} data-testid="set-from-name"
              onChange={(e) => set({ from_name: e.target.value })} /></Field>
            <Field label="Business Email"><input className="input-wtb" type="email" value={s.business_email || ""} data-testid="set-business-email"
              onChange={(e) => set({ business_email: e.target.value })} placeholder="hello@wifetobe.co.uk" /></Field>
            <Field label="Public App URL (used in email links)"><input className="input-wtb" value={s.public_url || ""} data-testid="set-public-url"
              onChange={(e) => set({ public_url: e.target.value })} placeholder="https://appointments.wifetobe.co.uk" /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="SMTP Host"><input className="input-wtb" value={s.smtp_host || ""} data-testid="set-smtp-host"
                onChange={(e) => set({ smtp_host: e.target.value })} placeholder="smtp.gmail.com" /></Field>
              <Field label="SMTP Port"><input className="input-wtb" type="number" value={s.smtp_port || 587} data-testid="set-smtp-port"
                onChange={(e) => set({ smtp_port: Number(e.target.value) })} /></Field>
            </div>
            <Field label="SMTP Username"><input className="input-wtb" value={s.smtp_user || ""} data-testid="set-smtp-user"
              onChange={(e) => set({ smtp_user: e.target.value })} /></Field>
            <Field label="SMTP Password / App Password"><input className="input-wtb" type="password" value={s.smtp_password || ""} data-testid="set-smtp-pass"
              onChange={(e) => set({ smtp_password: e.target.value })} /></Field>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-2xl mb-1">Notifications</h3>
          <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }}>Choose which emails send automatically. All off by default.</p>
          <div className="space-y-5">
            {[
              { k: "notify_customer_on_booking", l: "Email customer on new booking request" },
              { k: "notify_shop_on_booking", l: "Email the boutique on new booking request" },
              { k: "notify_on_confirm", l: "Email customer when a booking is confirmed" },
              { k: "notify_reminder", l: "Send a reminder email 24h before the appointment" },
            ].map((n) => (
              <div key={n.k} className="flex items-center justify-between gap-4">
                <span className="font-sans-j text-sm">{n.l}</span>
                <Toggle checked={!!s[n.k]} onChange={(v) => set({ [n.k]: v })} testid={`toggle-${n.k}`} />
              </div>
            ))}
          </div>
          <div className="border-t mt-6 pt-5" style={{ borderColor: "var(--line)" }}>
            <p className="field-label mb-2">Calendar subscription (iCal)</p>
            <p className="font-sans-j text-xs mb-3" style={{ color: "var(--taupe)" }}>
              Add this URL to Google/Apple Calendar to see all upcoming bookings automatically.
            </p>
            <div className="flex gap-2">
              <input readOnly className="input-wtb text-xs" data-testid="ical-url"
                value={s.feed_token ? `${process.env.REACT_APP_BACKEND_URL}/api/calendar/${s.feed_token}.ics?tenant=${tenant}` : ""}
                onFocus={(e) => e.target.select()} />
              <button className="btn-wtb btn-ghost-wtb" data-testid="copy-ical"
                onClick={() => { navigator.clipboard?.writeText(`${process.env.REACT_APP_BACKEND_URL}/api/calendar/${s.feed_token}.ics?tenant=${tenant}`); toast.success("Copied"); }}>Copy</button>
            </div>
          </div>
        </Panel>
      </div>

      <button className="btn-wtb btn-gold mt-8" onClick={save} data-testid="save-settings">Save Settings</button>

      <div className="mt-8">
        <Panel>
          <h3 className="text-2xl mb-1">Payments</h3>
          <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }}>
            Enable up to 3 ways for customers to pay a deposit. Set the deposit amount per boutique on the Customise page.
          </p>
          <PaymentMethods s={s} set={set} />
          <button className="btn-wtb btn-gold mt-6" onClick={save} data-testid="save-payment-settings">Save Payment Settings</button>
        </Panel>
      </div>
    </div>
  );
}

const METHOD_LIST = [
  { key: "paypal_me", label: "PayPal.me link", hint: "Quick, no setup — customers pay via your PayPal.me link." },
  { key: "bank_transfer", label: "Bank transfer", hint: "Customers pay by bank transfer using your details." },
  { key: "in_person", label: "Pay in person / on the day", hint: "No online payment — recorded manually." },
  { key: "paypal", label: "PayPal card checkout", hint: "Card payment via PayPal (needs API keys in backend .env)." },
];

function PaymentMethods({ s, set }) {
  const methods = s.payment_methods || [];
  const toggle = (key) => {
    if (methods.includes(key)) set({ payment_methods: methods.filter((m) => m !== key) });
    else if (methods.length < 3) set({ payment_methods: [...methods, key] });
  };
  return (
    <div className="space-y-4">
      <p className="eyebrow" style={{ fontSize: "0.55rem", color: methods.length >= 3 ? "#9a4a3f" : "var(--taupe)" }}>
        {methods.length}/3 selected
      </p>
      {METHOD_LIST.map((m) => {
        const on = methods.includes(m.key);
        return (
          <div key={m.key} className="border p-4" style={{ borderColor: on ? "var(--gold)" : "var(--line)" }} data-testid={`pm-${m.key}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-sans-j text-sm" style={{ color: "var(--charcoal)" }}>{m.label}</p>
                <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>{m.hint}</p>
              </div>
              <Toggle checked={on} onChange={() => toggle(m.key)} testid={`pm-toggle-${m.key}`} />
            </div>
            {on && m.key === "paypal_me" && (
              <div className="mt-4"><Field label="Your PayPal.me link">
                <input className="input-wtb" value={s.paypal_me_url || ""} data-testid="set-paypalme-url"
                  onChange={(e) => set({ paypal_me_url: e.target.value })} placeholder="https://paypal.me/yourbusiness" />
              </Field></div>
            )}
            {on && m.key === "bank_transfer" && (
              <div className="mt-4 grid sm:grid-cols-3 gap-3">
                <Field label="Account Name"><input className="input-wtb" value={s.bank_account_name || ""} data-testid="set-bank-name"
                  onChange={(e) => set({ bank_account_name: e.target.value })} /></Field>
                <Field label="Sort Code"><input className="input-wtb" value={s.bank_sort_code || ""} data-testid="set-bank-sort"
                  onChange={(e) => set({ bank_sort_code: e.target.value })} placeholder="00-00-00" /></Field>
                <Field label="Account Number"><input className="input-wtb" value={s.bank_account_number || ""} data-testid="set-bank-number"
                  onChange={(e) => set({ bank_account_number: e.target.value })} placeholder="12345678" /></Field>
              </div>
            )}
            {on && m.key === "paypal" && (
              <p className="font-sans-j text-xs mt-3" style={{ color: "var(--taupe)" }}>
                Add PAYPAL_CLIENT_ID and PAYPAL_SECRET to the backend .env to enable card checkout.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
