import React, { useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHead, Panel, Field, Toggle } from "@/components/admin/ui";

export default function Account() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState({ name: "", email: "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [tfa, setTfa] = useState(null); // {secret, qr}
  const [code, setCode] = useState("");
  const [email, setEmail] = useState(null);
  const [testTo, setTestTo] = useState("");

  React.useEffect(() => {
    if (user) setProfile({ name: user.name || "", email: user.email || "" });
  }, [user]);

  React.useEffect(() => {
    api.get("/auth/my-email-settings").then((r) => { setEmail(r.data); setTestTo(r.data.sender_email || ""); }).catch(() => {});
  }, []);

  const saveEmail = async () => {
    try { await api.put("/auth/my-email-settings", email); toast.success("Email settings saved"); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const sendTest = async () => {
    if (!testTo) { toast.error("Enter an address to send the test to"); return; }
    try { await api.post("/auth/my-email-settings/test", { to: testTo }); toast.success("Test email sent — check the inbox"); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const saveProfile = async () => {
    if (!profile.name || !profile.email) { toast.error("Name and email are required"); return; }
    try {
      await api.post("/auth/update-profile", { name: profile.name, email: profile.email });
      toast.success("Profile updated"); refresh();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const changePw = async () => {
    if (pw.new_password.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (pw.new_password !== pw.confirm) { toast.error("Passwords do not match"); return; }
    try {
      await api.post("/auth/change-password", { current_password: pw.current_password, new_password: pw.new_password });
      toast.success("Password updated"); setPw({ current_password: "", new_password: "", confirm: "" });
    } catch (e) { toast.error(apiErr(e)); }
  };

  const startTfa = async () => {
    try { const { data } = await api.post("/auth/2fa/setup"); setTfa(data); } catch (e) { toast.error(apiErr(e)); }
  };

  const enableTfa = async () => {
    try { await api.post("/auth/2fa/enable", { code }); toast.success("Two-factor enabled"); setTfa(null); setCode(""); refresh(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const disableTfa = async () => {
    try { await api.post("/auth/2fa/disable"); toast.success("Two-factor disabled"); refresh(); } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="reveal-up">
      <PageHead eyebrow={user?.role} title="My Account" />

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel>
          <h3 className="text-2xl mb-1">Profile</h3>
          <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }}>
            Manage your own name and email address — you don't need the superadmin to change these.
          </p>
          <div className="space-y-5 mb-8">
            <Field label="Name"><input className="input-wtb" value={profile.name} data-testid="profile-name"
              onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
            <Field label="Email Address"><input className="input-wtb" type="email" value={profile.email} data-testid="profile-email"
              onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
            <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>Your email is also your login. Use the new address next time you sign in.</p>
            <button className="btn-wtb btn-gold" onClick={saveProfile} data-testid="save-profile">Save Profile</button>
          </div>
          <div className="border-t pt-6" style={{ borderColor: "var(--line)" }}>
            <h4 className="text-xl mb-4">Change Password</h4>
          <div className="space-y-5">
            <Field label="Current Password"><input className="input-wtb" type="password" value={pw.current_password} data-testid="current-pw"
              onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
            <Field label="New Password"><input className="input-wtb" type="password" value={pw.new_password} data-testid="new-pw"
              onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
            <Field label="Confirm New Password"><input className="input-wtb" type="password" value={pw.confirm} data-testid="confirm-pw"
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <button className="btn-wtb btn-gold" onClick={changePw} data-testid="change-pw-btn">Update Password</button>
          </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="text-2xl mb-1">Two-Factor Authentication</h3>
          <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }}>
            Google Authenticator (TOTP). Optional — currently <b>{user?.totp_enabled ? "ON" : "OFF"}</b>.
          </p>

          {user?.totp_enabled ? (
            <button className="btn-wtb" style={{ borderColor: "#9a4a3f", color: "#9a4a3f" }} onClick={disableTfa} data-testid="disable-2fa">Disable 2FA</button>
          ) : !tfa ? (
            <button className="btn-wtb btn-gold" onClick={startTfa} data-testid="setup-2fa">Set Up 2FA</button>
          ) : (
            <div className="space-y-5">
              <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>Scan this QR code with Google Authenticator, then enter the 6-digit code.</p>
              <img src={tfa.qr} alt="2FA QR code" className="w-44 h-44 border" style={{ borderColor: "var(--line)" }} data-testid="2fa-qr" />
              <p className="font-sans-j text-xs break-all" style={{ color: "var(--taupe)" }}>Secret: {tfa.secret}</p>
              <Field label="Authentication Code">
                <input className="input-wtb text-center tracking-[0.4em]" inputMode="numeric" maxLength={6} value={code} data-testid="enable-2fa-code"
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
              </Field>
              <div className="flex gap-3">
                <button className="btn-wtb btn-gold" onClick={enableTfa} data-testid="enable-2fa">Enable</button>
                <button className="btn-wtb btn-ghost-wtb" onClick={() => { setTfa(null); setCode(""); }}>Cancel</button>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <Panel className="mt-6">
        <h3 className="text-2xl mb-1">Email / SMTP Settings</h3>
        <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }}>
          Set up your own outgoing email so the app can send confirmations, reminders and replies from your mailbox.
          For Gmail/Outlook use an <b>app password</b>, not your normal login password.
        </p>
        {!email ? <p className="eyebrow">Loading…</p> : (
          <div className="space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Sender Name (shown to customers)">
                <input className="input-wtb" value={email.sender_name || ""} data-testid="smtp-sender-name"
                  onChange={(e) => setEmail({ ...email, sender_name: e.target.value })} placeholder="Wife To Be" />
              </Field>
              <Field label="Sender Email (from address)">
                <input className="input-wtb" type="email" value={email.sender_email || ""} data-testid="smtp-sender-email"
                  onChange={(e) => setEmail({ ...email, sender_email: e.target.value })} placeholder="you@wifetobe.co.uk" />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="SMTP Host">
                <input className="input-wtb" value={email.smtp_host || ""} data-testid="smtp-host"
                  onChange={(e) => setEmail({ ...email, smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
              </Field>
              <Field label="SMTP Port">
                <input className="input-wtb" type="number" value={email.smtp_port || 587} data-testid="smtp-port"
                  onChange={(e) => setEmail({ ...email, smtp_port: Number(e.target.value) })} placeholder="587" />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="SMTP Username">
                <input className="input-wtb" value={email.smtp_user || ""} data-testid="smtp-user"
                  onChange={(e) => setEmail({ ...email, smtp_user: e.target.value })} placeholder="usually your email" />
              </Field>
              <Field label="SMTP Password / App Password">
                <input className="input-wtb" type="password" value={email.smtp_password || ""} data-testid="smtp-password"
                  onChange={(e) => setEmail({ ...email, smtp_password: e.target.value })} placeholder="••••••••" />
              </Field>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 border-t pt-5" style={{ borderColor: "var(--line)" }}>
              <button className="btn-wtb btn-gold" onClick={saveEmail} data-testid="save-smtp">Save Email Settings</button>
              <div className="flex-1" />
              <Field label="Send a test to">
                <input className="input-wtb" type="email" value={testTo} data-testid="smtp-test-to"
                  onChange={(e) => setTestTo(e.target.value)} placeholder="test@email.com" />
              </Field>
              <button className="btn-wtb btn-ghost-wtb" onClick={sendTest} data-testid="send-test-email">Send Test</button>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
