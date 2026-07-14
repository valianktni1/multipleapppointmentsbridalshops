import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, CheckCircle2, Eye, EyeOff, BookOpen } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { Field } from "@/components/admin/ui";
import SmtpGuideModal from "@/components/admin/SmtpGuideModal";

/**
 * Reusable SMTP / Email settings form matching the proven Hostinger-style layout:
 * one EMAIL ADDRESS field is used as BOTH the login username and the from-address.
 * Works for tenant admins (/auth/my-email-settings) and the platform owner
 * (/platform/email-settings) — pass the matching endpoints.
 */
export default function EmailSettingsForm({
  getUrl,
  putUrl,
  testUrl,
  heading = "SMTP Configuration",
  help = "Configure your email so notifications are sent directly from your own address.",
  showSmtpGuide = false,
}) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [show, setShow] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    api.get(getUrl).then(({ data }) => {
      setForm({
        smtp_host: data.smtp_host || "",
        smtp_port: data.smtp_port || 465,
        sender_email: data.sender_email || "",
        smtp_password: data.smtp_password || "",
        sender_name: data.sender_name || "",
      });
      setTestTo(data.sender_email || "");
    }).catch((e) => toast.error(apiErr(e)));
  }, [getUrl]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...form };
      // Don't overwrite a stored password with the mask
      if (payload.smtp_password === "********") delete payload.smtp_password;
      await api.put(putUrl, payload);
      toast.success("Email settings saved");
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const sendTest = async () => {
    const to = testTo || form?.sender_email;
    if (!to) { toast.error("Enter an address to send the test to"); return; }
    setTesting(true);
    try {
      await api.post(testUrl, { to });
      toast.success(`Test email sent to ${to} — check your inbox`);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setTesting(false); }
  };

  if (!form) return <p className="eyebrow">Loading…</p>;

  return (
    <div className="max-w-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <Mail size={18} style={{ color: "var(--gold)" }} />
          <h3 className="text-2xl">{heading}</h3>
        </div>
        {showSmtpGuide && (
          <button type="button" className="btn-wtb btn-ghost-wtb" onClick={() => setGuideOpen(true)} data-testid="open-smtp-guide">
            <BookOpen size={14} className="mr-2" /> View Common SMTP Settings
          </button>
        )}
      </div>
      <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }}>{help}</p>

      <div className="space-y-5">
        <Field label="SMTP Server">
          <input className="input-wtb" value={form.smtp_host} data-testid="email-smtp-host"
            onChange={(e) => set({ smtp_host: e.target.value })} placeholder="smtp.hostinger.com" />
        </Field>
        <Field label="Port">
          <input className="input-wtb" type="number" value={form.smtp_port} data-testid="email-smtp-port"
            onChange={(e) => set({ smtp_port: Number(e.target.value) })} placeholder="465" />
          <p className="font-sans-j text-xs mt-1" style={{ color: "var(--taupe)" }}>465 for SSL · 587 for STARTTLS</p>
          {showSmtpGuide && (
            <button type="button" onClick={() => setGuideOpen(true)} data-testid="port-smtp-guide-link"
              className="font-sans-j text-xs mt-1 underline hover:text-[var(--gold-deep)] transition-colors" style={{ color: "var(--gold-deep)" }}>
              Not sure? View common settings for your provider
            </button>
          )}
        </Field>
        <Field label="Email Address">
          <input className="input-wtb" type="email" value={form.sender_email} data-testid="email-address"
            onChange={(e) => set({ sender_email: e.target.value })} placeholder="you@yourdomain.com" />
          <p className="font-sans-j text-xs mt-1" style={{ color: "var(--taupe)" }}>Used as both the login username and the “from” address.</p>
        </Field>
        <Field label="Password">
          <div className="relative">
            <input className="input-wtb pr-11" type={show ? "text" : "password"} value={form.smtp_password} data-testid="email-password"
              onChange={(e) => set({ smtp_password: e.target.value })} placeholder="••••••••" />
            <button type="button" onClick={() => setShow((s) => !s)} data-testid="toggle-password"
              className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--taupe)" }}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="font-sans-j text-xs mt-1" style={{ color: "var(--taupe)" }}>Use an app password if your provider requires 2FA. Pasting with spaces is fine.</p>
        </Field>
        <Field label="Sender Name">
          <input className="input-wtb" value={form.sender_name} data-testid="email-sender-name"
            onChange={(e) => set({ sender_name: e.target.value })} placeholder="Mark, Weddings by Mark" />
        </Field>

        <div className="flex flex-wrap items-end gap-3 pt-2">
          <button className="btn-wtb btn-gold" onClick={save} disabled={busy} data-testid="save-email">
            {busy ? "Saving…" : "Save Settings"}
          </button>
          <div className="flex items-end gap-2">
            <div>
              <p className="field-label mb-1">Send test to</p>
              <input className="input-wtb" style={{ width: "220px" }} type="email" value={testTo} data-testid="test-to"
                onChange={(e) => setTestTo(e.target.value)} placeholder="you@yourdomain.com" />
            </div>
            <button className="btn-wtb btn-ghost-wtb" onClick={sendTest} disabled={testing} data-testid="send-test-email">
              <CheckCircle2 size={14} className="mr-2" /> {testing ? "Sending…" : "Send Test Email"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t" style={{ borderColor: "var(--line)" }}>
        <h4 className="text-xl mb-3">How it works</h4>
        <ol className="font-sans-j text-sm space-y-2 list-decimal pl-5" style={{ color: "var(--taupe)" }}>
          <li>Enter your email SMTP details above (one-time setup).</li>
          <li>Save the settings, then press “Send Test Email” to verify it works.</li>
          <li>Turn on the notifications you want (booking confirmations, reminders, etc.).</li>
          <li>Your customers then receive beautiful branded emails from your own address.</li>
        </ol>
      </div>

      {showSmtpGuide && <SmtpGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
