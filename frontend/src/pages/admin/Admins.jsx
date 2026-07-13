import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Modal, Field, Toggle } from "@/components/admin/ui";

const MAX = 4;

export default function Admins() {
  const [rows, setRows] = useState([]);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });

  const load = () => api.get("/admins").then((r) => setRows(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  const adminCount = rows.filter((r) => r.role === "admin").length;

  const create = async () => {
    if (!form.name || !form.email || !form.password) { toast.error("All fields required"); return; }
    try { await api.post("/admins", form); toast.success("Admin created"); setModal(false); setForm({ name: "", email: "", password: "" }); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const toggleActive = async (a) => {
    try { await api.patch(`/admins/${a.id}`, { active: !a.active }); load(); } catch (e) { toast.error(apiErr(e)); }
  };

  const del = async (a) => {
    try { await api.delete(`/admins/${a.id}`); toast.success("Admin removed"); load(); } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Superadmin" title="Admin Team">
        <button className="btn-wtb btn-gold" disabled={adminCount >= MAX} onClick={() => setModal(true)} data-testid="add-admin">
          <Plus size={15} className="mr-2" /> Add Admin
        </button>
      </PageHead>

      <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }} data-testid="admin-count">
        {adminCount} of {MAX} admins created {adminCount >= MAX && "· limit reached"}
      </p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="admins-list">
        {rows.map((a) => (
          <div key={a.id} className="card-wtb p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="eyebrow flex items-center gap-2" style={{ fontSize: "0.55rem", color: a.role === "superadmin" ? "var(--gold-deep)" : "var(--taupe)" }}>
                {a.role === "superadmin" && <ShieldCheck size={13} />}{a.role}
              </span>
              {a.role !== "superadmin" && (
                <button onClick={() => del(a)} style={{ color: "#9a4a3f" }} data-testid={`del-admin-${a.id}`}><Trash2 size={15} /></button>
              )}
            </div>
            <h3 className="text-2xl">{a.name}</h3>
            <p className="font-sans-j text-sm mb-4" style={{ color: "var(--taupe)" }}>{a.email}</p>
            <div className="flex items-center justify-between">
              <span className="eyebrow" style={{ fontSize: "0.55rem" }}>{a.totp_enabled ? "2FA On" : "2FA Off"}</span>
              {a.role !== "superadmin" && (
                <div className="flex items-center gap-2">
                  <Toggle checked={a.active} onChange={() => toggleActive(a)} testid={`admin-active-${a.id}`} />
                  <span className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>{a.active ? "Active" : "Disabled"}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Add Admin" testid="admin-modal">
        <div className="space-y-5">
          <Field label="Name"><input className="input-wtb" value={form.name} data-testid="new-admin-name"
            onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email"><input className="input-wtb" type="email" value={form.email} data-testid="new-admin-email"
            onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Temporary Password"><input className="input-wtb" type="text" value={form.password} data-testid="new-admin-password"
            onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" /></Field>
          <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>The admin can change their password after signing in.</p>
          <button className="btn-wtb btn-gold w-full" onClick={create} data-testid="save-admin">Create Admin</button>
        </div>
      </Modal>
    </div>
  );
}
