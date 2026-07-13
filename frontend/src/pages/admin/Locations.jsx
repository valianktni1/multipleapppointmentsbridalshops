import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Phone } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Field, Modal } from "@/components/admin/ui";

export default function Locations() {
  const [shops, setShops] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", role_label: "Wedding Dresses", address: "", phone: "", email: "", blurb: "", hours_text: "" });
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/shops").then((r) => setShops(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) { toast.error("Location name is required"); return; }
    setBusy(true);
    try {
      await api.post("/shops", form);
      toast.success("Location added with default hours & appointment types");
      setCreating(false);
      setForm({ name: "", role_label: "Wedding Dresses", address: "", phone: "", email: "", blurb: "", hours_text: "" });
      load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const del = async (s) => {
    if (!window.confirm(`Delete "${s.name}"? Its availability & appointment types will be removed. Existing bookings are kept.`)) return;
    try { await api.delete(`/shops/${s.id}`); toast.success("Location deleted"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Boutiques" title="Locations">
        <button className="btn-wtb btn-gold" onClick={() => setCreating(true)} data-testid="add-location"><Plus size={15} className="mr-2" /> Add Location</button>
      </PageHead>

      <div className="grid md:grid-cols-2 gap-6" data-testid="locations-grid">
        {shops.length === 0 && <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>No locations yet.</p>}
        {shops.map((s) => (
          <Panel key={s.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow" style={{ fontSize: "0.55rem" }}>{s.role_label}</p>
                <h3 className="text-2xl mt-1">{s.name}</h3>
              </div>
              <button onClick={() => del(s)} style={{ color: "#9a4a3f" }} data-testid={`del-location-${s.id}`}><Trash2 size={16} /></button>
            </div>
            <p className="font-sans-j text-sm mt-3" style={{ color: "var(--taupe)" }}>{s.blurb}</p>
            <div className="space-y-1 mt-4 font-sans-j text-sm" style={{ color: "var(--ink)" }}>
              {s.address && <div className="flex items-center gap-2"><MapPin size={14} style={{ color: "var(--gold)" }} />{s.address}</div>}
              {s.phone && <div className="flex items-center gap-2"><Phone size={14} style={{ color: "var(--gold)" }} />{s.phone}</div>}
            </div>
            <p className="eyebrow mt-4" style={{ fontSize: "0.5rem" }}>Edit hours in Availability · details in Customise</p>
          </Panel>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Add Location" testid="create-location-modal">
        <div className="space-y-4">
          <Field label="Location Name"><input className="input-wtb" value={form.name} data-testid="loc-name"
            onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Manchester Boutique" /></Field>
          <Field label="Type / Label"><input className="input-wtb" value={form.role_label} data-testid="loc-role"
            onChange={(e) => setForm({ ...form, role_label: e.target.value })} placeholder="Wedding Dresses" /></Field>
          <Field label="Address"><input className="input-wtb" value={form.address} data-testid="loc-address"
            onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Phone"><input className="input-wtb" value={form.phone} data-testid="loc-phone"
              onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Email"><input className="input-wtb" value={form.email} data-testid="loc-email"
              onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          </div>
          <Field label="Intro / Blurb"><textarea className="input-wtb" rows={2} value={form.blurb} data-testid="loc-blurb"
            onChange={(e) => setForm({ ...form, blurb: e.target.value })} /></Field>
          <Field label="Opening Hours (text)"><input className="input-wtb" value={form.hours_text} data-testid="loc-hours"
            onChange={(e) => setForm({ ...form, hours_text: e.target.value })} placeholder="Tue–Sat by appointment" /></Field>
          <button className="btn-wtb btn-gold w-full" onClick={create} disabled={busy} data-testid="create-location-submit">{busy ? "Adding…" : "Add Location"}</button>
        </div>
      </Modal>
    </div>
  );
}
