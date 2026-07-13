import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Modal, Field, Toggle } from "@/components/admin/ui";

const EMPTY = { name: "", duration: 60, description: "", active: true };

export default function AppointmentTypes() {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [types, setTypes] = useState([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => { api.get("/shops").then((r) => { setShops(r.data); if (r.data[0]) setShopId(r.data[0].id); }); }, []);

  const load = useCallback(async () => {
    if (!shopId) return;
    const { data } = await api.get(`/shops/${shopId}/appointment-types`, { params: { all: true } });
    setTypes(data);
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (t) => { setEditing(t); setForm({ name: t.name, duration: t.duration, description: t.description || "", active: t.active }); setModal(true); };

  const save = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    if (!(form.duration >= 5 && form.duration <= 600)) { toast.error("Duration must be between 5 and 600 minutes"); return; }
    try {
      if (editing) await api.patch(`/appointment-types/${editing.id}`, form);
      else await api.post(`/shops/${shopId}/appointment-types`, form);
      toast.success("Saved"); setModal(false); load();
    } catch (e) { toast.error(apiErr(e)); }
  };

  const del = async (t) => {
    try { await api.delete(`/appointment-types/${t.id}`); load(); toast.success("Removed"); } catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Configure" title="Appointment Types">
        <button className="btn-wtb btn-gold" onClick={openNew} data-testid="add-type"><Plus size={15} className="mr-2" /> New Type</button>
      </PageHead>

      <Panel className="mb-6">
        <Field label="Boutique">
          <select className="input-wtb max-w-xs" value={shopId} data-testid="types-shop" onChange={(e) => setShopId(e.target.value)}>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </Panel>

      <div className="grid sm:grid-cols-2 gap-5" data-testid="types-list">
        {types.map((t) => (
          <div key={t.id} className="card-wtb p-6">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="text-2xl">{t.name}</h3>
                <span className="eyebrow" style={{ fontSize: "0.55rem", color: "var(--gold-deep)" }}>{t.duration} min {t.active ? "" : "· hidden"}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(t)} style={{ color: "var(--taupe)" }} data-testid={`edit-type-${t.id}`}><Pencil size={16} /></button>
                <button onClick={() => del(t)} style={{ color: "#9a4a3f" }} data-testid={`del-type-${t.id}`}><Trash2 size={16} /></button>
              </div>
            </div>
            <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>{t.description}</p>
          </div>
        ))}
        {types.length === 0 && <p className="font-sans-j" style={{ color: "var(--taupe)" }}>No appointment types yet.</p>}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit Type" : "New Appointment Type"} testid="type-modal">
        <div className="space-y-5">
          <Field label="Name"><input className="input-wtb" value={form.name} data-testid="type-name"
            onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Duration">
            <div className="flex gap-2 mb-3">
              {[30, 60, 90, 120].map((d) => (
                <button key={d} type="button" onClick={() => setForm({ ...form, duration: d })} data-testid={`duration-${d}`}
                  className="btn-wtb flex-1" style={form.duration === d ? { background: "var(--gold)", borderColor: "var(--gold)", color: "#fff" } : {}}>{d}m</button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input type="number" min={5} max={600} step={5} className="input-wtb max-w-[140px]" value={form.duration}
                data-testid="duration-custom"
                onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value || "0", 10) })} />
              <span className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>minutes (custom — 5 to 600)</span>
            </div>
          </Field>
          <Field label="Description"><textarea className="input-wtb" rows={3} value={form.description} data-testid="type-desc"
            onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="flex items-center gap-3">
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} testid="type-active" />
            <span className="font-sans-j text-sm">Visible to customers</span>
          </div>
          <button className="btn-wtb btn-gold w-full" onClick={save} data-testid="save-type">Save</button>
        </div>
      </Modal>
    </div>
  );
}
