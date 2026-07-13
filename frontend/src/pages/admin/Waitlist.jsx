import React, { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Trash2, Check } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel } from "@/components/admin/ui";

export default function Waitlist() {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => { api.get("/shops").then((r) => setShops(r.data)); }, []);

  const load = useCallback(async () => {
    const params = shopId ? { shop_id: shopId } : {};
    try { const { data } = await api.get("/waitlist", { params }); setRows(data); } catch (e) { toast.error(apiErr(e)); }
  }, [shopId]);
  useEffect(() => { load(); }, [load]);

  const mark = async (r) => { try { await api.patch(`/waitlist/${r.id}`, { status: r.status === "contacted" ? "waiting" : "contacted" }); load(); } catch (e) { toast.error(apiErr(e)); } };
  const del = async (r) => { try { await api.delete(`/waitlist/${r.id}`); load(); } catch (e) { toast.error(apiErr(e)); } };

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Enquiries" title="Waitlist" />
      <Panel className="mb-6">
        <select className="input-wtb max-w-xs" value={shopId} data-testid="waitlist-shop" onChange={(e) => setShopId(e.target.value)}>
          <option value="">All boutiques</option>
          {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Panel>

      <div className="space-y-3" data-testid="waitlist-list">
        {rows.length === 0 && <p className="font-sans-j" style={{ color: "var(--taupe)" }}>No one on the waitlist right now.</p>}
        {rows.map((r) => (
          <div key={r.id} className="card-wtb p-5 flex flex-wrap items-center justify-between gap-4" data-testid={`waitlist-${r.id}`}>
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl">{r.customer_name}</h3>
                <span className="eyebrow px-2 py-1" style={{ fontSize: "0.5rem", background: r.status === "contacted" ? "#DCEAD9" : "var(--champagne)", color: r.status === "contacted" ? "#3f6b39" : "var(--gold-deep)" }}>{r.status}</span>
              </div>
              <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>
                {r.shop_name}{r.appointment_type_name ? ` · ${r.appointment_type_name}` : ""}{r.date ? ` · prefers ${format(new Date(r.date), "d MMM yyyy")}` : ""}
              </p>
              <p className="font-sans-j text-sm">{r.customer_email} · {r.customer_phone}</p>
              {r.notes && <p className="font-sans-j text-xs mt-1" style={{ color: "var(--taupe)" }}>{r.notes}</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn-wtb btn-ghost-wtb" onClick={() => mark(r)} data-testid={`toggle-contacted-${r.id}`}><Check size={14} className="mr-2" />{r.status === "contacted" ? "Mark waiting" : "Mark contacted"}</button>
              <button className="btn-wtb" style={{ borderColor: "#9a4a3f", color: "#9a4a3f" }} onClick={() => del(r)} data-testid={`del-waitlist-${r.id}`}><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
