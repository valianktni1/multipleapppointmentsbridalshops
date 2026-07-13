import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { usePlatformAuth, apiErr } from "@/context/PlatformAuthContext";
import { Eyebrow, GoldRule } from "@/components/Brand";
import { Field } from "@/components/admin/ui";

export default function PlatformLogin() {
  const { login, verify2fa, user } = usePlatformAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mfa, setMfa] = useState(null);
  const [code, setCode] = useState("");

  useEffect(() => { if (user) nav("/superadmin/app", { replace: true }); }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await login(email, password);
      if (r.mfa_required) { setMfa(r.mfa_token); toast.message("Enter your authenticator code"); }
      else nav("/superadmin/app", { replace: true });
    } catch (err) { toast.error(apiErr(err)); }
    finally { setBusy(false); }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await verify2fa(mfa, code); nav("/superadmin/app", { replace: true }); }
    catch (err) { toast.error(apiErr(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16" style={{ background: "var(--ivory)" }}>
      <div className="w-full max-w-md reveal-up">
        <div className="text-center mb-10">
          <span className="wordmark text-5xl">Ivory Digital</span>
          <p className="eyebrow mt-3" style={{ fontSize: "0.6rem" }}>Platform · Owner Login</p>
        </div>
        <div className="card-wtb p-8 md:p-10">
          {!mfa ? (
            <form onSubmit={submit} className="space-y-6">
              <div className="text-center mb-2">
                <Eyebrow>SaaS Owner</Eyebrow>
                <h1 className="text-3xl mt-2">Sign In</h1>
                <GoldRule className="mx-auto mt-4" />
              </div>
              <Field label="Email">
                <input className="input-wtb" type="email" value={email} required data-testid="platform-email"
                  onChange={(e) => setEmail(e.target.value)} placeholder="admin@ivory-digital.uk" />
              </Field>
              <Field label="Password">
                <input className="input-wtb" type="password" value={password} required data-testid="platform-password"
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </Field>
              <button className="btn-wtb btn-gold w-full" disabled={busy} data-testid="platform-submit">
                {busy ? "Signing in…" : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} className="space-y-6">
              <div className="text-center mb-2">
                <Eyebrow>Two-Factor</Eyebrow>
                <h1 className="text-3xl mt-2">Authentication</h1>
                <GoldRule className="mx-auto mt-4" />
              </div>
              <Field label="Authentication Code">
                <input className="input-wtb text-center tracking-[0.5em] text-lg" inputMode="numeric" maxLength={6}
                  value={code} data-testid="platform-mfa-code" onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
              </Field>
              <button className="btn-wtb btn-gold w-full" disabled={busy} data-testid="platform-mfa-submit">{busy ? "Verifying…" : "Verify"}</button>
              <button type="button" className="eyebrow w-full text-center" style={{ color: "var(--taupe)", fontSize: "0.6rem" }}
                onClick={() => { setMfa(null); setCode(""); }}>← Back to login</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
