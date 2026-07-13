import React, { useEffect, useState } from "react";
import { format } from "date-fns";
import api from "@/lib/api";
import { PageHead, Panel, StatusBadge } from "@/components/admin/ui";
import { useAuth } from "@/context/AuthContext";

function Stat({ label, value, testid }) {
  return (
    <div className="card-wtb p-6 text-center">
      <div className="font-serif-c text-5xl" style={{ color: "var(--gold-deep)" }} data-testid={testid}>{value}</div>
      <div className="eyebrow mt-2" style={{ fontSize: "0.55rem" }}>{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => { api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {}); }, []);

  return (
    <div className="reveal-up">
      <PageHead eyebrow={`Welcome, ${user?.name?.split(" ")[0] || ""}`} title="Dashboard" />
      {!stats ? <p className="eyebrow">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <Stat label="Upcoming" value={stats.upcoming} testid="stat-upcoming" />
            <Stat label="Pending" value={stats.pending} testid="stat-pending" />
            <Stat label="Confirmed" value={stats.confirmed} testid="stat-confirmed" />
            <Stat label="All Time" value={stats.total} testid="stat-total" />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Panel>
                <h3 className="text-2xl mb-5">Today's Appointments</h3>
                {stats.today.length === 0 ? (
                  <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>No appointments scheduled for today.</p>
                ) : (
                  <div className="space-y-3" data-testid="today-list">
                    {stats.today.map((b) => (
                      <div key={b.id} className="flex items-center justify-between border-b pb-3" style={{ borderColor: "var(--line)" }}>
                        <div>
                          <p className="font-serif-c text-lg">{b.customer_name}</p>
                          <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>{b.shop_name} · {b.appointment_type_name}</p>
                        </div>
                        <div className="text-right flex items-center gap-4">
                          <span className="font-sans-j" style={{ color: "var(--gold-deep)" }}>{b.start_time}</span>
                          <StatusBadge status={b.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
            <Panel>
              <h3 className="text-2xl mb-5">By Boutique</h3>
              <div className="space-y-4">
                {stats.per_shop.map((s) => (
                  <div key={s.shop} className="flex items-center justify-between">
                    <span className="font-sans-j text-sm">{s.shop}</span>
                    <span className="font-serif-c text-2xl" style={{ color: "var(--gold-deep)" }}>{s.upcoming}</span>
                  </div>
                ))}
              </div>
              <p className="eyebrow mt-6" style={{ fontSize: "0.5rem" }}>Upcoming appointments</p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
