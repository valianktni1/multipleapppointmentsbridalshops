import React, { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Field, Toggle } from "@/components/admin/ui";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Availability() {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [hours, setHours] = useState({});
  const [step, setStep] = useState(30);
  const [capacity, setCapacity] = useState(1);
  const [buffer, setBuffer] = useState(0);
  const [blocked, setBlocked] = useState([]);
  const [newBlock, setNewBlock] = useState({ date: "", reason: "", start_time: "", end_time: "" });

  useEffect(() => { api.get("/shops").then((r) => { setShops(r.data); if (r.data[0]) setShopId(r.data[0].id); }); }, []);

  const load = useCallback(async () => {
    if (!shopId) return;
    const a = await api.get(`/shops/${shopId}/availability`);
    const h = a.data.hours || {};
    const filled = {};
    for (let i = 0; i < 7; i++) filled[i] = h[i] || { closed: i === 0 || i === 6, open: "10:00", close: "17:00" };
    setHours(filled); setStep(a.data.slot_step || 30);
    setCapacity(a.data.capacity || 1); setBuffer(a.data.buffer || 0);
    const b = await api.get(`/shops/${shopId}/blocked-dates`);
    setBlocked(b.data);
  }, [shopId]);

  useEffect(() => { load(); }, [load]);

  const saveHours = async () => {
    try { await api.put(`/shops/${shopId}/availability`, { hours, slot_step: step, capacity, buffer }); toast.success("Opening hours saved"); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const addBlock = async () => {
    if (!newBlock.date) { toast.error("Choose a date to block"); return; }
    try {
      await api.post(`/shops/${shopId}/blocked-dates`, {
        date: newBlock.date, reason: newBlock.reason,
        start_time: newBlock.start_time || null, end_time: newBlock.end_time || null,
      });
      setNewBlock({ date: "", reason: "", start_time: "", end_time: "" }); load(); toast.success("Date blocked");
    } catch (e) { toast.error(apiErr(e)); }
  };

  const delBlock = async (id) => {
    try { await api.delete(`/blocked-dates/${id}`); load(); } catch (e) { toast.error(apiErr(e)); }
  };

  const upd = (i, patch) => setHours({ ...hours, [i]: { ...hours[i], ...patch } });

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Calendars" title="Availability" />
      <Panel className="mb-6">
        <Field label="Boutique">
          <select className="input-wtb max-w-xs" value={shopId} data-testid="availability-shop"
            onChange={(e) => setShopId(e.target.value)}>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel>
          <h3 className="text-2xl mb-6">Weekly Opening Hours</h3>
          <div className="space-y-3">
            {DAYS.map((d, i) => (
              <div key={i} className="flex items-center gap-3 flex-wrap" data-testid={`day-row-${i}`}>
                <span className="font-sans-j text-sm w-24">{d}</span>
                <Toggle checked={!hours[i]?.closed} onChange={(v) => upd(i, { closed: !v })} testid={`day-open-${i}`} />
                {hours[i]?.closed ? (
                  <span className="eyebrow" style={{ fontSize: "0.55rem", color: "var(--taupe)" }}>Closed</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input type="time" className="input-wtb py-2 w-auto" value={hours[i]?.open || "10:00"} data-testid={`day-from-${i}`}
                      onChange={(e) => upd(i, { open: e.target.value })} />
                    <span style={{ color: "var(--taupe)" }}>–</span>
                    <input type="time" className="input-wtb py-2 w-auto" value={hours[i]?.close || "17:00"} data-testid={`day-to-${i}`}
                      onChange={(e) => upd(i, { close: e.target.value })} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center gap-4">
            <Field label="Slot interval (min)">
              <select className="input-wtb w-32" value={step} data-testid="slot-step" onChange={(e) => setStep(Number(e.target.value))}>
                {[15, 30, 60].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Concurrent (rooms)">
              <input type="number" min={1} className="input-wtb w-28" value={capacity} data-testid="slot-capacity"
                onChange={(e) => setCapacity(Math.max(1, Number(e.target.value)))} />
            </Field>
            <Field label="Buffer (min)">
              <input type="number" min={0} className="input-wtb w-28" value={buffer} data-testid="slot-buffer"
                onChange={(e) => setBuffer(Math.max(0, Number(e.target.value)))} />
            </Field>
          </div>
          <button className="btn-wtb btn-gold mt-6" onClick={saveHours} data-testid="save-hours">Save Hours</button>
        </Panel>

        <Panel>
          <h3 className="text-2xl mb-6">Blocked Dates (Holidays)</h3>
          <div className="flex flex-wrap items-end gap-3 mb-6">
            <Field label="Date"><input type="date" className="input-wtb" value={newBlock.date} data-testid="block-date"
              onChange={(e) => setNewBlock({ ...newBlock, date: e.target.value })} /></Field>
            <Field label="Reason"><input className="input-wtb" placeholder="e.g. Bank holiday" value={newBlock.reason} data-testid="block-reason"
              onChange={(e) => setNewBlock({ ...newBlock, reason: e.target.value })} /></Field>
            <Field label="From (optional)"><input type="time" className="input-wtb" value={newBlock.start_time} data-testid="block-from"
              onChange={(e) => setNewBlock({ ...newBlock, start_time: e.target.value })} /></Field>
            <Field label="To (optional)"><input type="time" className="input-wtb" value={newBlock.end_time} data-testid="block-to"
              onChange={(e) => setNewBlock({ ...newBlock, end_time: e.target.value })} /></Field>
            <button className="btn-wtb btn-ghost-wtb" onClick={addBlock} data-testid="add-block">Block</button>
          </div>
          <p className="font-sans-j text-xs mb-4" style={{ color: "var(--taupe)" }}>Leave From/To empty to block the whole day; set them to block just part of a day (e.g. lunch).</p>
          <div className="space-y-2" data-testid="blocked-list">
            {blocked.length === 0 && <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>No blocked dates.</p>}
            {blocked.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--line)" }}>
                <span className="font-sans-j text-sm">{format(new Date(b.date), "EEE d MMM yyyy")}{b.start_time && b.end_time ? ` (${b.start_time}–${b.end_time})` : " (all day)"}{b.reason ? ` — ${b.reason}` : ""}</span>
                <button onClick={() => delBlock(b.id)} style={{ color: "#9a4a3f" }} data-testid={`del-block-${b.id}`}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
