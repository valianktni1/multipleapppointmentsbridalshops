import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useAuth, apiErr } from "@/context/AuthContext";
import { Wordmark, Eyebrow, GoldRule, DesignerCredit } from "@/components/Brand";
import { Field } from "@/components/admin/ui";

export default function Login() {
  const { login, verify2fa, user } = useAuth();
  const { tenant } = useParams();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null);
  const [code, setCode] = useState("");

  useEffect(() => { if (user) nav(`/${tenant}/admin`, { replace: true }); }, [user, nav, tenant]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await login(email, password);
      if (r.mfa_required) { setMfa(r.mfa_token); toast.message("Enter your authenticator code"); }
      else nav(`/${tenant}/admin`, { replace: true });
    } catch (err) { toast.error(apiErr(err)); }
    finally { setBusy(false); }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await verify2fa(mfa, code); nav(`/${tenant}/admin`, { replace: true }); }
    catch (err) { toast.error(apiErr(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16" style={{ background: "var(--ivory)" }}>
      <div className="w-full max-w-md reveal-up">
        <div className="text-center mb-10">
          <Wordmark size="text-5xl" />
          <p className="eyebrow mt-3" style={{ fontSize: "0.6rem" }}>Appointments · Staff Login</p>
        </div>
        <div className="card-wtb p-8 md:p-10">
          {!mfa ? (
            <form onSubmit={submit} className="space-y-6">
              <div className="text-center mb-2">
                <Eyebrow>Welcome Back</Eyebrow>
                <h1 className="text-3xl mt-2">Sign In</h1>
                <GoldRule className="mx-auto mt-4" />
              </div>
              <Field label="Email">
                <input className="input-wtb" type="email" value={email} required data-testid="login-email"
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </Field>
              <Field label="Password">
                <input className="input-wtb" type="password" value={password} required data-testid="login-password"
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </Field>
              <button className="btn-wtb btn-gold w-full" disabled={busy} data-testid="login-submit">
                {busy ? "Signing in…" : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-6">
              <div className="text-center mb-2">
                <Eyebrow>Two-Factor</Eyebrow>
                <h1 className="text-3xl mt-2">Authentication</h1>
                <GoldRule className="mx-auto mt-4" />
                <p className="font-sans-j text-sm mt-4" style={{ color: "var(--taupe)" }}>Enter the 6-digit code from your authenticator app.</p>
              </div>
              <Field label="Authentication Code">
                <input className="input-wtb text-center tracking-[0.5em] text-lg" inputMode="numeric" maxLength={6}
                  value={code} data-testid="mfa-code" onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
              </Field>
              <button className="btn-wtb btn-gold w-full" disabled={busy} data-testid="mfa-submit">{busy ? "Verifying…" : "Verify"}</button>
              <button type="button" className="eyebrow w-full text-center" style={{ color: "var(--taupe)", fontSize: "0.6rem" }}
                onClick={() => { setMfa(null); setCode(""); }} data-testid="mfa-cancel">← Back to login</button>
            </form>
          )}
        </div>
        <div className="mt-10"><DesignerCredit /></div>
      </div>
    </div>
  );
}
