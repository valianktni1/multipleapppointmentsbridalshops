import React, { useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Modal, StatusBadge } from "@/components/admin/ui";

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {}; if (q) params.q = q;
      const { data } = await api.get("/customers", { params });
      setRows(data);
    } catch (e) { toast.error(apiErr(e)); }
  }, [q]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const openDetail = async (email) => {
    try { const { data } = await api.get(`/customers/${encodeURIComponent(email)}`); setActive(data); }
    catch (e) { toast.error(apiErr(e)); }
  };

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Directory" title="Customers" />
      <Panel className="mb-6">
        <input className="input-wtb w-full" placeholder="Search by name, email or phone…" value={q}
          onChange={(e) => setQ(e.target.value)} data-testid="customer-search" />
      </Panel>

      <div className="card-wtb overflow-x-auto" data-testid="customers-table">
        <table className="w-full text-sm font-sans-j">
          <thead>
            <tr className="text-left" style={{ background: "var(--ivory-2)" }}>
              {["Name", "Email", "Phone", "Visits", "Last Visit", ""].map((h) => <th key={h} className="field-label p-4">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center" style={{ color: "var(--taupe)" }}>No customers found.</td></tr>}
            {rows.map((c) => (
              <tr key={c.email} className="border-t hover:bg-[var(--ivory-2)] cursor-pointer" style={{ borderColor: "var(--line)" }}
                onClick={() => openDetail(c.email)} data-testid={`customer-row-${c.email}`}>
                <td className="p-4">{c.name}</td>
                <td className="p-4">{c.email}</td>
                <td className="p-4">{c.phone}</td>
                <td className="p-4" style={{ color: "var(--gold-deep)" }}>{c.total}</td>
                <td className="p-4 whitespace-nowrap">{c.last_date ? format(new Date(c.last_date), "d MMM yyyy") : "—"}</td>
                <td className="p-4 text-right eyebrow" style={{ color: "var(--gold-deep)", fontSize: "0.55rem" }}>History</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!active} onClose={() => setActive(null)} title={active?.name || "Customer"} testid="customer-modal">
        {active && (
          <div className="space-y-5">
            <div className="font-sans-j text-sm space-y-1">
              <div><b>Email:</b> {active.email}</div>
              <div><b>Phone:</b> {active.phone}</div>
              <div><b>Total visits:</b> {active.total}</div>
            </div>
            <div className="border-t pt-5" style={{ borderColor: "var(--line)" }}>
              <p className="field-label mb-3">Appointment History</p>
              <div className="space-y-4" data-testid="customer-history">
                {active.bookings.map((b) => (
                  <div key={b.id} className="border-b pb-4" style={{ borderColor: "var(--line)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-serif-c text-lg">{format(new Date(b.date), "EEE d MMM yyyy")} · {b.start_time}</span>
                      <StatusBadge status={b.status} />
                    </div>
                    <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>{b.shop_name} · {b.appointment_type_name} · Ref {b.reference}</p>
                    {b.notes && <p className="font-sans-j text-sm mt-1"><b>Notes:</b> {b.notes}</p>}
                    {b.admin_notes && <p className="font-sans-j text-sm mt-1" style={{ color: "var(--gold-deep)" }}><b>Admin notes:</b> {b.admin_notes}</p>}
                    {b.answers && b.answers.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {b.answers.map((a, i) => <div key={i} className="font-sans-j text-xs"><b>{a.label}:</b> {a.value}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn-wtb btn-ghost-wtb w-full" onClick={() => setActive(null)} data-testid="close-customer-modal">Close</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
