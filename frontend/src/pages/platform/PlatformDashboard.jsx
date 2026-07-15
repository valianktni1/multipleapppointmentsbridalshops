import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut, Plus, ExternalLink, Trash2, Clock, CheckCircle2, PauseCircle, KeyRound, LogIn, Mail, CreditCard, Receipt, Building2 } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { usePlatformAuth } from "@/context/PlatformAuthContext";
import { useAuth } from "@/context/AuthContext";
import { Modal, Field } from "@/components/admin/ui";
import EmailSettingsForm from "@/components/admin/EmailSettingsForm";
import { PlanModal, InvoicesModal, CompanySettingsModal, ManualEmailModal } from "@/components/platform/BillingModals";

const STATUS = {
  trial: { bg: "var(--champagne)", c: "var(--gold-deep)", label: "trial" },
  active: { bg: "#DCEAD9", c: "#3f6b39", label: "active" },
  expired: { bg: "#F0DAD6", c: "#9a4a3f", label: "expired" },
  suspended: { bg: "#EADFF0", c: "#6b3f8a", label: "suspended" },
};

function Pill({ status }) {
  const s = STATUS[status] || STATUS.trial;
  return <span className="eyebrow px-3 py-1 inline-block" style={{ background: s.bg, color: s.c, fontSize: "0.55rem" }} data-testid={`tenant-status-${status}`}>{s.label}</span>;
}

function Stat({ label, value, testid }) {
  return (
    <div className="card-wtb p-5 text-center">
      <div className="font-serif-c text-4xl" style={{ color: "var(--gold-deep)" }} data-testid={testid}>{value}</div>
      <div className="eyebrow mt-2" style={{ fontSize: "0.5rem" }}>{label}</div>
    </div>
  );
}

export default function PlatformDashboard() {
  const { user, logout } = usePlatformAuth();
  const { loginWithToken } = useAuth();
  const nav = useNavigate();
  const [tenants, setTenants] = useState([]);
  const [stats, setStats] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", custom_domain: "", owner_name: "", owner_email: "", owner_password: "", trial_days: 7, locations: 1 });
  const [busy, setBusy] = useState(false);
  const [pwFor, setPwFor] = useState(null);
  const [newPw, setNewPw] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [allowFor, setAllowFor] = useState(null);
  const [allowVal, setAllowVal] = useState(1);
  const [plans, setPlans] = useState([]);
  const [planFor, setPlanFor] = useState(null);
  const [invoiceFor, setInvoiceFor] = useState(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [emailToFor, setEmailToFor] = useState(null); // manual email modal (holds prefill)

  const origin = window.location.origin;

  const load = useCallback(async () => {
    try {
      const [{ data: t }, { data: s }] = await Promise.all([
        api.get("/platform/tenants"),
        api.get("/platform/stats"),
      ]);
      setTenants(t); setStats(s);
    } catch (e) { toast.error(apiErr(e)); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/platform/plans").then(({ data }) => setPlans(data.plans || [])).catch(() => {}); }, []);

  const gbp = (n) => `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const fmtDue = (v) => { if (!v) return "\u2014"; try { return new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "\u2014"; } };

  const autoSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

  const create = async () => {
    if (!form.name || !form.owner_email || !form.owner_password) { toast.error("Company name, owner email and password are required"); return; }
    if (form.owner_password.length < 6) { toast.error("Owner password must be at least 6 characters"); return; }
    setBusy(true);
    try {
      await api.post("/platform/tenants", { ...form, slug: form.slug || autoSlug(form.name) });
      toast.success("Company created and seeded");
      setCreating(false);
      setForm({ name: "", slug: "", custom_domain: "", owner_name: "", owner_email: "", owner_password: "", trial_days: 7, locations: 1 });
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const act = async (path, msg, tenantId, body = null) => {
    try { await api.post(`/platform/tenants/${tenantId}/${path}`, body); toast.success(msg); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const del = async (t) => {
    if (!window.confirm(`Delete "${t.name}" and ALL its data? This cannot be undone.`)) return;
    try { await api.delete(`/platform/tenants/${t.id}`); toast.success("Company deleted"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const impersonate = async (t) => {
    try {
      const { data } = await api.post(`/platform/tenants/${t.id}/impersonate`);
      await loginWithToken(data.access_token);
      toast.success(`Signed in as ${t.name}`);
      nav(`/${t.slug}/admin`);
    } catch (e) { toast.error(apiErr(e)); }
  };

  const doResetPw = async () => {
    if (newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    try { await api.post(`/platform/tenants/${pwFor.id}/reset-owner-password`, { password: newPw }); toast.success("Owner password reset"); setPwFor(null); setNewPw(""); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const saveAllowance = async () => {
    try {
      await api.patch(`/platform/tenants/${allowFor.id}`, { max_locations: Number(allowVal) });
      toast.success("Shop allowance updated");
      setAllowFor(null); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--ivory)" }}>
      <header className="w-full py-5 px-6 md:px-10 flex items-center justify-between border-b" style={{ borderColor: "var(--line)", background: "#fff" }}>
        <div>
          <span className="wordmark text-3xl">Ivory Digital</span>
          <p className="eyebrow" style={{ fontSize: "0.5rem" }}>Platform Control</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-sans-j text-sm hidden sm:inline" style={{ color: "var(--taupe)" }}>{user?.email}</span>
          <button onClick={() => setCompanyOpen(true)} data-testid="company-settings-btn"
            className="flex items-center gap-2 font-sans-j text-sm hover:text-[var(--gold-deep)]" style={{ color: "var(--taupe)" }}>
            <Building2 size={16} /> Company Details
          </button>
          <button onClick={() => setEmailToFor({ email: "" })} data-testid="send-email-btn"
            className="flex items-center gap-2 font-sans-j text-sm hover:text-[var(--gold-deep)]" style={{ color: "var(--taupe)" }}>
            <Mail size={16} /> Send Email
          </button>
          <button onClick={() => setEmailOpen(true)} data-testid="platform-email-settings-btn"
            className="flex items-center gap-2 font-sans-j text-sm hover:text-[var(--gold-deep)]" style={{ color: "var(--taupe)" }}>
            <Mail size={16} /> Email Settings
          </button>
          <button onClick={() => { logout(); nav("/superadmin"); }} data-testid="platform-logout"
            className="flex items-center gap-2 font-sans-j text-sm hover:text-[var(--gold-deep)]" style={{ color: "var(--taupe)" }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 reveal-up">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <span className="eyebrow">Overview</span>
            <h1 className="text-4xl md:text-5xl mt-2">Companies</h1>
            <span className="gold-rule block mt-4" />
          </div>
          <button className="btn-wtb btn-gold" onClick={() => setCreating(true)} data-testid="new-company-btn"><Plus size={15} className="mr-2" /> New Company</button>
        </div>

        {stats && (
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 mb-10">
            <Stat label="Companies" value={stats.total} testid="stat-total" />
            <Stat label="Trial" value={stats.trial} testid="stat-trial" />
            <Stat label="Active" value={stats.active} testid="stat-active" />
            <Stat label="Expired" value={stats.expired} testid="stat-expired" />
            <Stat label="Suspended" value={stats.suspended} testid="stat-suspended" />
            <Stat label="Bookings" value={stats.total_bookings} testid="stat-bookings" />
          </div>
        )}

        <div className="card-wtb overflow-x-auto" data-testid="tenants-table">
          <table className="w-full text-sm font-sans-j">
            <thead>
              <tr className="text-left" style={{ background: "var(--ivory-2)" }}>
                {["Company", "URL", "Status", "Plan", "Next Due", "Trial", "Shops (used/max)", "Bookings", "Actions"].map((h) => (
                  <th key={h} className="field-label p-4 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.length === 0 && <tr><td colSpan={9} className="p-8 text-center" style={{ color: "var(--taupe)" }}>No companies yet. Create your first client.</td></tr>}
              {tenants.map((t) => (
                <tr key={t.id} className="border-t" style={{ borderColor: "var(--line)" }} data-testid={`tenant-row-${t.slug}`}>
                  <td className="p-4">
                    <p className="font-serif-c text-lg">{t.name}</p>
                    <p className="text-xs" style={{ color: "var(--taupe)" }}>{t.owner_email}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      <a href={`${origin}/${t.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:text-[var(--gold-deep)]" style={{ color: "var(--gold-deep)" }} data-testid={`tenant-public-${t.slug}`}>/{t.slug} <ExternalLink size={11} /></a>
                      <a href={`${origin}/${t.slug}/admin`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs hover:text-[var(--gold-deep)]" style={{ color: "var(--taupe)" }}>/{t.slug}/admin <ExternalLink size={11} /></a>
                    </div>
                  </td>
                  <td className="p-4"><Pill status={t.status} /></td>
                  <td className="p-4 whitespace-nowrap">
                    {t.billing?.active
                      ? <div><p className="text-sm" style={{ color: "var(--charcoal)" }}>{t.billing.plan_name}</p>
                          <p className="text-xs" style={{ color: "var(--taupe)" }}>{gbp(t.billing.price)} / {t.billing.cycle === "annual" ? "yr" : "mo"}</p></div>
                      : <span className="text-xs" style={{ color: "var(--taupe)" }}>No plan</span>}
                  </td>
                  <td className="p-4 whitespace-nowrap text-sm" style={{ color: "var(--charcoal)" }}>
                    {t.billing?.active ? fmtDue(t.billing.next_due_date) : "\u2014"}
                  </td>
                  <td className="p-4 whitespace-nowrap">{t.status === "trial" ? `${t.trial_days_remaining ?? 0} days left` : "\u2014"}</td>
                  <td className="p-4 text-center">
                    <button onClick={() => { setAllowFor(t); setAllowVal(t.max_locations || 1); }} data-testid={`allowance-${t.slug}`}
                      className="hover:text-[var(--gold-deep)] underline decoration-dotted underline-offset-4" style={{ color: "var(--charcoal)" }}
                      title="Click to change shop allowance">
                      {t.locations_count} / {t.max_locations ?? 1}
                    </button>
                  </td>
                  <td className="p-4 text-center">{t.bookings_count}</td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-2">
                      <IconBtn icon={CreditCard} label="Plan" onClick={() => setPlanFor(t)} testid={`plan-${t.slug}`} />
                      <IconBtn icon={Receipt} label="Invoices" onClick={() => setInvoiceFor(t)} testid={`invoices-${t.slug}`} />
                      <IconBtn icon={Mail} label="Email" onClick={() => setEmailToFor({ email: t.owner_email })} testid={`email-${t.slug}`} />
                      <IconBtn icon={Clock} label="+7 days" onClick={() => act("extend-trial", "Trial extended 7 days", t.id, { days: 7 })} testid={`extend-${t.slug}`} />
                      {t.status !== "active" && <IconBtn icon={CheckCircle2} label="Activate" onClick={() => act("convert-active", "Converted to active", t.id)} testid={`activate-${t.slug}`} />}
                      {t.status === "suspended"
                        ? <IconBtn icon={CheckCircle2} label="Unsuspend" onClick={() => act("unsuspend", "Unsuspended", t.id)} testid={`unsuspend-${t.slug}`} />
                        : <IconBtn icon={PauseCircle} label="Suspend" onClick={() => act("suspend", "Suspended", t.id)} testid={`suspend-${t.slug}`} />}
                      <IconBtn icon={LogIn} label="Enter" onClick={() => impersonate(t)} testid={`impersonate-${t.slug}`} />
                      <IconBtn icon={KeyRound} label="Reset PW" onClick={() => { setPwFor(t); setNewPw(""); }} testid={`resetpw-${t.slug}`} />
                      <button onClick={() => del(t)} className="text-xs px-2 py-1 border" style={{ borderColor: "#9a4a3f", color: "#9a4a3f" }} data-testid={`delete-${t.slug}`}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      <Modal open={creating} onClose={() => setCreating(false)} title="New Company" testid="create-company-modal">
        <div className="space-y-4">
          <Field label="Company Name">
            <input className="input-wtb" value={form.name} data-testid="company-name"
              onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.slug || autoSlug(e.target.value) })} placeholder="Superbrides" />
          </Field>
          <Field label="URL Name (path)">
            <div className="flex items-center gap-2">
              <span className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>ivory-digital.uk/</span>
              <input className="input-wtb" value={form.slug} data-testid="company-slug"
                onChange={(e) => setForm({ ...form, slug: autoSlug(e.target.value) })} placeholder="superbrides" />
            </div>
          </Field>
          <Field label="Custom Domain (optional)">
            <input className="input-wtb" value={form.custom_domain} data-testid="company-domain"
              onChange={(e) => setForm({ ...form, custom_domain: e.target.value })} placeholder="bookings.superbrides.co.uk" />
          </Field>
          <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <p className="field-label mb-3">Owner Account (Company Superadmin)</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Owner Name"><input className="input-wtb" value={form.owner_name} data-testid="owner-name"
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Jane Smith" /></Field>
              <Field label="Owner Email"><input className="input-wtb" type="email" value={form.owner_email} data-testid="owner-email"
                onChange={(e) => setForm({ ...form, owner_email: e.target.value })} placeholder="jane@superbrides.co.uk" /></Field>
            </div>
            <div className="mt-4"><Field label="Temporary Password"><input className="input-wtb" value={form.owner_password} data-testid="owner-password"
              onChange={(e) => setForm({ ...form, owner_password: e.target.value })} placeholder="min 6 characters" /></Field></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Trial Length (days)"><input type="number" min={1} className="input-wtb" value={form.trial_days} data-testid="trial-days"
              onChange={(e) => setForm({ ...form, trial_days: Number(e.target.value) })} /></Field>
            <Field label="Shops Allowed (max)"><input type="number" min={1} max={50} className="input-wtb" value={form.locations} data-testid="init-locations"
              onChange={(e) => setForm({ ...form, locations: Number(e.target.value) })} /></Field>
          </div>
          <p className="font-sans-j text-xs -mt-2" style={{ color: "var(--taupe)" }}>This is both the number of shops created now and the maximum they can add. Choose 1 to lock them to a single shop.</p>
          <button className="btn-wtb btn-gold w-full" onClick={create} disabled={busy} data-testid="create-company-submit">{busy ? "Creating\u2026" : "Create Company"}</button>
        </div>
      </Modal>

      <Modal open={!!pwFor} onClose={() => setPwFor(null)} title="Reset Owner Password" testid="reset-pw-modal">
        <div className="space-y-4">
          <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>Set a new password for the owner of <b>{pwFor?.name}</b> ({pwFor?.owner_email}).</p>
          <Field label="New Password"><input className="input-wtb" value={newPw} data-testid="reset-pw-input" onChange={(e) => setNewPw(e.target.value)} placeholder="min 6 characters" /></Field>
          <button className="btn-wtb btn-gold w-full" onClick={doResetPw} data-testid="reset-pw-submit">Reset Password</button>
        </div>
      </Modal>

      <Modal open={!!allowFor} onClose={() => setAllowFor(null)} title="Shop Allowance" testid="allowance-modal">
        <div className="space-y-4">
          <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>
            Set how many shops <b>{allowFor?.name}</b> may have. They currently use <b>{allowFor?.locations_count}</b>.
            They can add shops up to this number on their Locations page.
          </p>
          <Field label="Maximum Shops">
            <input type="number" min={allowFor?.locations_count || 1} max={50} className="input-wtb" value={allowVal}
              data-testid="allowance-input" onChange={(e) => setAllowVal(e.target.value)} />
          </Field>
          <button className="btn-wtb btn-gold w-full" onClick={saveAllowance} data-testid="allowance-submit">Save Allowance</button>
        </div>
      </Modal>

      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} title="Platform Email Settings" testid="platform-email-modal">
        <EmailSettingsForm
          getUrl="/platform/email-settings"
          putUrl="/platform/email-settings"
          testUrl="/platform/email-settings/test"
          help="Configure the platform's own outgoing email (used for platform notices). Each company sets its own email separately."
        />
      </Modal>

      <PlanModal tenant={planFor} plans={plans} onClose={() => setPlanFor(null)} onSaved={load} />
      <InvoicesModal tenant={invoiceFor} onClose={() => setInvoiceFor(null)} />
      <CompanySettingsModal open={companyOpen} onClose={() => setCompanyOpen(false)} />
      <ManualEmailModal open={!!emailToFor} prefillTo={emailToFor?.email} onClose={() => setEmailToFor(null)} />
    </div>
  );
}

function IconBtn({ icon: Icon, label, onClick, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      className="flex items-center gap-1 text-xs px-2 py-1 border transition-colors hover:bg-[var(--ivory-2)]"
      style={{ borderColor: "var(--line)", color: "var(--charcoal)" }}>
      <Icon size={13} /> {label}
    </button>
  );
}
