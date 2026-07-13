import React, { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Field, Toggle } from "@/components/admin/ui";

const Q_TYPES = [
  { v: "text", l: "Short text" },
  { v: "textarea", l: "Long text" },
  { v: "date", l: "Date" },
  { v: "select", l: "Dropdown" },
];

export default function Customise() {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [info, setInfo] = useState({ blurb: "", photo_url: "", hours_text: "", what_to_expect: "", deposit_amount: 0, deposit_required: false });
  const [questions, setQuestions] = useState([]);

  useEffect(() => { api.get("/shops").then((r) => { setShops(r.data); if (r.data[0]) setShopId(r.data[0].id); }); }, []);

  const load = useCallback(async () => {
    if (!shopId) return;
    const { data } = await api.get(`/shops/${shopId}`);
    setInfo({ blurb: data.blurb || "", photo_url: data.photo_url || "", hours_text: data.hours_text || "", what_to_expect: data.what_to_expect || "", deposit_amount: data.deposit_amount || 0, deposit_required: !!data.deposit_required });
    setQuestions(data.questions || []);
  }, [shopId]);
  useEffect(() => { load(); }, [load]);

  const saveInfo = async () => {
    try { await api.patch(`/shops/${shopId}`, info); toast.success("Boutique details saved"); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const saveQuestions = async () => {
    for (const q of questions) if (!q.label.trim()) { toast.error("Every question needs a label"); return; }
    try { await api.put(`/shops/${shopId}/questions`, { questions }); toast.success("Booking questions saved"); load(); }
    catch (e) { toast.error(apiErr(e)); }
  };

  const addQ = () => setQuestions([...questions, { label: "", type: "text", options: [], required: false }]);
  const updQ = (i, patch) => setQuestions(questions.map((q, idx) => idx === i ? { ...q, ...patch } : q));
  const delQ = (i) => setQuestions(questions.filter((_, idx) => idx !== i));

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Tailor" title="Customise" />
      <Panel className="mb-6">
        <Field label="Boutique">
          <select className="input-wtb max-w-xs" value={shopId} data-testid="customise-shop" onChange={(e) => setShopId(e.target.value)}>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </Panel>

      <div className="grid lg:grid-cols-2 gap-6">
        <Panel>
          <h3 className="text-2xl mb-6">Boutique Details</h3>
          <div className="space-y-5">
            <Field label="Intro / Blurb"><textarea className="input-wtb" rows={2} value={info.blurb} data-testid="cust-blurb"
              onChange={(e) => setInfo({ ...info, blurb: e.target.value })} /></Field>
            <Field label="Opening Hours (text)"><input className="input-wtb" value={info.hours_text} data-testid="cust-hours"
              onChange={(e) => setInfo({ ...info, hours_text: e.target.value })} placeholder="Tue–Fri 11am–5pm · Sat 10am–5pm" /></Field>
            <Field label="Photo URL"><input className="input-wtb" value={info.photo_url} data-testid="cust-photo"
              onChange={(e) => setInfo({ ...info, photo_url: e.target.value })} placeholder="https://…/boutique.jpg" /></Field>
            <Field label="What To Expect"><textarea className="input-wtb" rows={3} value={info.what_to_expect} data-testid="cust-expect"
              onChange={(e) => setInfo({ ...info, what_to_expect: e.target.value })} placeholder="Bring up to 3 guests, allow 90 minutes…" /></Field>
            <div className="border-t pt-5" style={{ borderColor: "var(--line)" }}>
              <p className="field-label mb-3">Deposit</p>
              <div className="flex flex-wrap items-center gap-4">
                <Field label="Deposit amount (£)">
                  <input type="number" min={0} step="0.01" className="input-wtb max-w-[140px]" value={info.deposit_amount}
                    data-testid="cust-deposit-amount"
                    onChange={(e) => setInfo({ ...info, deposit_amount: parseFloat(e.target.value || "0") })} />
                </Field>
                <label className="flex items-center gap-2 font-sans-j text-sm mt-6">
                  <Toggle checked={info.deposit_required} onChange={(v) => setInfo({ ...info, deposit_required: v })} testid="cust-deposit-required" />
                  Deposit required to confirm
                </label>
              </div>
              <p className="font-sans-j text-xs mt-2" style={{ color: "var(--taupe)" }}>Set to £0 for no deposit. Payment method is chosen in Settings.</p>
            </div>
            <button className="btn-wtb btn-gold" onClick={saveInfo} data-testid="save-info">Save Details</button>
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl">Booking Form Questions</h3>
            <button className="btn-wtb btn-ghost-wtb" onClick={addQ} data-testid="add-question"><Plus size={14} className="mr-2" />Add</button>
          </div>
          <div className="space-y-4" data-testid="questions-list">
            {questions.length === 0 && <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>No extra questions — customers only fill name, email, phone & notes.</p>}
            {questions.map((q, i) => (
              <div key={i} className="border p-4" style={{ borderColor: "var(--line)" }} data-testid={`question-${i}`}>
                <div className="flex items-center gap-2 mb-3">
                  <GripVertical size={15} style={{ color: "var(--taupe)" }} />
                  <input className="input-wtb flex-1" value={q.label} placeholder="Question label" data-testid={`q-label-${i}`}
                    onChange={(e) => updQ(i, { label: e.target.value })} />
                  <button onClick={() => delQ(i)} style={{ color: "#9a4a3f" }} data-testid={`del-question-${i}`}><Trash2 size={16} /></button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <select className="input-wtb w-40 py-2" value={q.type} data-testid={`q-type-${i}`} onChange={(e) => updQ(i, { type: e.target.value })}>
                    {Q_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                  </select>
                  <label className="flex items-center gap-2 font-sans-j text-sm">
                    <Toggle checked={q.required} onChange={(v) => updQ(i, { required: v })} testid={`q-req-${i}`} /> Required
                  </label>
                </div>
                {q.type === "select" && (
                  <input className="input-wtb mt-3" value={(q.options || []).join(", ")} placeholder="Options, comma separated" data-testid={`q-options-${i}`}
                    onChange={(e) => updQ(i, { options: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
                )}
              </div>
            ))}
          </div>
          <button className="btn-wtb btn-gold mt-6" onClick={saveQuestions} data-testid="save-questions">Save Questions</button>
        </Panel>
      </div>
    </div>
  );
}
