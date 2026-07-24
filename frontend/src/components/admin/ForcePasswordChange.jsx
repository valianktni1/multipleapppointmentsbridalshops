import React, { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Eye, EyeOff, LogOut, Check, X } from "lucide-react";
import api from "@/lib/api";
import { useAuth, apiErr } from "@/context/AuthContext";
import { Wordmark, Eyebrow, GoldRule } from "@/components/Brand";
import { Field } from "@/components/admin/ui";

export default function ForcePasswordChange({ brand = "your", onLogout }) {
  const { refresh } = useAuth();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const longEnough = pw.length >= 8;
  const matches = pw.length > 0 && pw === confirm;
  const canSubmit = longEnough && matches && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!longEnough) { toast.error("Password must be at least 8 characters"); return; }
    if (!matches) { toast.error("The two passwords do not match"); return; }
    setBusy(true);
    try {
      await api.post("/auth/set-initial-password", { new_password: pw, confirm_password: confirm });
      toast.success("Password updated — welcome aboard!");
      await refresh();
    } catch (err) { toast.error(apiErr(err)); }
    finally { setBusy(false); }
  };

  const Rule = ({ ok, children }) => (
    <div className="flex items-center gap-2 font-sans-j text-xs" style={{ color: ok ? "#3f6b39" : "var(--taupe)" }}>
      {ok ? <Check size={14} /> : <X size={14} style={{ color: "var(--taupe)" }} />} {children}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-16" style={{ background: "var(--ivory)" }}>
      <div className="fixed top-0 right-0 p-4 z-50">
        <button onClick={onLogout} data-testid="force-pw-logout" className="flex items-center gap-2 font-sans-j text-sm" style={{ color: "var(--taupe)" }}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      <div className="w-full max-w-md reveal-up" data-testid="force-password-change">
        <div className="text-center mb-8">
          <Wordmark size="text-4xl" />
          <p className="eyebrow mt-3" style={{ fontSize: "0.6rem" }}>Secure Your Account</p>
        </div>

        <div className="card-wtb p-8 md:p-10">
          <div className="text-center mb-6">
            <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--champagne)" }}>
              <ShieldCheck size={26} style={{ color: "var(--gold-deep)" }} />
            </div>
            <Eyebrow>Welcome to {brand}</Eyebrow>
            <h1 className="text-3xl mt-2">Set Your Password</h1>
            <GoldRule className="mx-auto mt-4" />
            <p className="font-sans-j text-sm mt-4" style={{ color: "var(--taupe)" }}>
              For your security, please replace the temporary password you were given with one only you know.
              You'll use this every time you sign in.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <Field label="New Password">
              <div className="relative">
                <input className="input-wtb pr-10" type={show ? "text" : "password"} value={pw} data-testid="new-password"
                  onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" autoFocus />
                <button type="button" onClick={() => setShow((s) => !s)} data-testid="toggle-password"
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--taupe)" }} aria-label="Show password">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>

            <Field label="Confirm New Password">
              <input className="input-wtb" type={show ? "text" : "password"} value={confirm} data-testid="confirm-password"
                onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your new password" />
            </Field>

            <div className="space-y-1.5 pt-1">
              <Rule ok={longEnough}>At least 8 characters</Rule>
              <Rule ok={matches}>Both passwords match</Rule>
            </div>

            <button className="btn-wtb btn-gold w-full" disabled={!canSubmit} data-testid="save-new-password">
              {busy ? "Saving…" : "Save Password & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
