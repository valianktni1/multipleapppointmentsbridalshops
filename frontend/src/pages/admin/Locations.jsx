import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, MapPin, Phone, Mail, Pencil } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Field, Modal } from "@/components/admin/ui";

const BLANK = { name: "", role_label: "Wedding Dresses", address: "", phone: "", email: "", blurb: "", hours_text: "" };

function LocationFields({ form, setForm }) {
  const set = (patch) => setForm({ ...form, ...patch });
  return (
    <div className="space-y-4">
      <Field label="Location / Shop Name"><input className="input-wtb" value={form.name || ""} data-testid="loc-name"
        onChange={(e) => set({ name: e.target.value })} placeholder="Manchester Boutique" /></Field>
      <Field label="Type / Label (shown above the name)"><input className="input-wtb" value={form.role_label || ""} data-testid="loc-role"
        onChange={(e) => set({ role_label: e.target.value })} placeholder="Wedding Dresses" /></Field>
      <Field label="Address"><input className="input-wtb" value={form.address || ""} data-testid="loc-address"
        onChange={(e) => set({ address: e.target.value })} placeholder="12 High Street, Manchester, M1 1AA" /></Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Phone"><input className="input-wtb" value={form.phone || ""} data-testid="loc-phone"
          onChange={(e) => set({ phone: e.target.value })} placeholder="0161 000 0000" /></Field>
        <Field label="Email"><input className="input-wtb" value={form.email || ""} data-testid="loc-email"
          onChange={(e) => set({ email: e.target.value })} placeholder="hello@boutique.co.uk" /></Field>
      </div>
      <Field label="Intro / Blurb"><textarea className="input-wtb" rows={2} value={form.blurb || ""} data-testid="loc-blurb"
        onChange={(e) => set({ blurb: e.target.value })} placeholder="A private, unhurried bridal styling experience." /></Field>
      <Field label="Opening Hours (text shown to brides)"><input className="input-wtb" value={form.hours_text || ""} data-testid="loc-hours"
        onChange={(e) => set({ hours_text: e.target.value })} placeholder="Tue–Sat by appointment" /></Field>
    </div>
  );
}

export default function Locations() {
  const [shops, setShops] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // shop object being edited
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/shops").then((r) => setShops(r.data)).catch((e) => toast.error(apiErr(e)));
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name) { toast.error("Location name is required"); return; }
    setBusy(true);
    try {
      await api.post("/shops", form);
      toast.success("Location added with default hours & appointment types");
      setCreating(false); setForm(BLANK); load();
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({ name: s.name, role_label: s.role_label || "", address: s.address || "", phone: s.phone || "", email: s.email || "", blurb: s.blurb || "", hours_text: s.hours_text || "" });
  };

  const saveEdit = async () => {
    if (!form.name) { toast.error("Location name is required"); return; }
    setBusy(true);
    try {
      await api.patch(`/shops/${editing.id}`, form);
      toast.success("Location updated — changes are live on your booking page");
      setEditing(null); setForm(BLANK); load();
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
        <button className="btn-wtb btn-gold" onClick={() => { setForm(BLANK); setCreating(true); }} data-testid="add-location"><Plus size={15} className="mr-2" /> Add Location</button>
      </PageHead>

      <p className="font-sans-j text-sm mb-6 -mt-4" style={{ color: "var(--taupe)" }}>
        These are the shops your clients choose from on your booking page. Add all of your boutiques with their names and addresses.
      </p>

      <div className="grid md:grid-cols-2 gap-6" data-testid="locations-grid">
        {shops.length === 0 && <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>No locations yet.</p>}
        {shops.map((s) => (
          <Panel key={s.id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow" style={{ fontSize: "0.55rem" }}>{s.role_label}</p>
                <h3 className="text-2xl mt-1">{s.name}</h3>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => openEdit(s)} style={{ color: "var(--gold-deep)" }} data-testid={`edit-location-${s.id}`}><Pencil size={16} /></button>
                <button onClick={() => del(s)} style={{ color: "#9a4a3f" }} data-testid={`del-location-${s.id}`}><Trash2 size={16} /></button>
              </div>
            </div>
            {s.blurb && <p className="font-sans-j text-sm mt-3" style={{ color: "var(--taupe)" }}>{s.blurb}</p>}
            <div className="space-y-1 mt-4 font-sans-j text-sm" style={{ color: "var(--ink)" }}>
              {s.address
                ? <div className="flex items-center gap-2"><MapPin size={14} style={{ color: "var(--gold)" }} />{s.address}</div>
                : <div className="flex items-center gap-2" style={{ color: "#b58" }}><MapPin size={14} />No address set — add one so brides can find you</div>}
              {s.phone && <div className="flex items-center gap-2"><Phone size={14} style={{ color: "var(--gold)" }} />{s.phone}</div>}
              {s.email && <div className="flex items-center gap-2"><Mail size={14} style={{ color: "var(--gold)" }} />{s.email}</div>}
            </div>
            <button className="btn-wtb btn-ghost-wtb mt-5 w-full" onClick={() => openEdit(s)} data-testid={`edit-location-btn-${s.id}`}>
              <Pencil size={13} className="mr-2" /> Edit Name &amp; Address
            </button>
            <p className="eyebrow mt-3" style={{ fontSize: "0.5rem" }}>Opening hours in Availability · photos & questions in Customise</p>
          </Panel>
        ))}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="Add Location" testid="create-location-modal">
        <LocationFields form={form} setForm={setForm} />
        <button className="btn-wtb btn-gold w-full mt-5" onClick={create} disabled={busy} data-testid="create-location-submit">{busy ? "Adding…" : "Add Location"}</button>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit Location" testid="edit-location-modal">
        <LocationFields form={form} setForm={setForm} />
        <button className="btn-wtb btn-gold w-full mt-5" onClick={saveEdit} disabled={busy} data-testid="edit-location-submit">{busy ? "Saving…" : "Save Changes"}</button>
      </Modal>
    </div>
  );
}
