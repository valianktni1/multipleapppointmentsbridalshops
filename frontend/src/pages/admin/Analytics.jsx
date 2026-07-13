import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";
import { PageHead, Panel, Field } from "@/components/admin/ui";

function Bars({ data, labelKey, valueKey, testid }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  if (!data.length) return <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>No data yet.</p>;
  return (
    <div className="space-y-3" data-testid={testid}>
      {data.map((d) => (
        <div key={d[labelKey]} className="flex items-center gap-3">
          <span className="font-sans-j text-xs w-32 shrink-0 truncate" style={{ color: "var(--charcoal)" }}>{d[labelKey]}</span>
          <div className="flex-1 h-5" style={{ background: "var(--ivory-2)" }}>
            <div className="h-5 flex items-center justify-end pr-2" style={{ width: `${Math.max(6, (d[valueKey] / max) * 100)}%`, background: "var(--gold)" }}>
              <span className="font-sans-j text-xs" style={{ color: "#fff" }}>{d[valueKey]}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  const [shops, setShops] = useState([]);
  const [shopId, setShopId] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => { api.get("/shops").then((r) => setShops(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    const params = {}; if (shopId) params.shop_id = shopId;
    api.get("/analytics", { params }).then((r) => setData(r.data)).catch((e) => toast.error(apiErr(e)));
  }, [shopId]);

  return (
    <div className="reveal-up">
      <PageHead eyebrow="Insights" title="Analytics">
        <Field label="Boutique">
          <select className="input-wtb" value={shopId} onChange={(e) => setShopId(e.target.value)} data-testid="analytics-shop">
            <option value="">All boutiques</option>
            {shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </PageHead>

      {!data ? <p className="eyebrow">Loading…</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
            <Stat label="Active Bookings" value={data.total} testid="an-total" />
            <Stat label="Completed" value={data.completed} testid="an-completed" />
            <Stat label="No-shows" value={data.no_show} testid="an-noshow" />
            <Stat label="No-show Rate" value={`${data.no_show_rate}%`} testid="an-noshow-rate" />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Panel>
              <h3 className="text-2xl mb-5">Busiest Days</h3>
              <Bars data={data.by_weekday} labelKey="day" valueKey="count" testid="chart-weekday" />
            </Panel>
            <Panel>
              <h3 className="text-2xl mb-5">Busiest Times</h3>
              <Bars data={data.by_hour} labelKey="hour" valueKey="count" testid="chart-hour" />
            </Panel>
            <Panel>
              <h3 className="text-2xl mb-5">By Boutique</h3>
              <Bars data={data.by_shop} labelKey="shop" valueKey="count" testid="chart-shop" />
            </Panel>
            <Panel>
              <h3 className="text-2xl mb-5">Where Brides Come From</h3>
              <Bars data={data.by_source} labelKey="source" valueKey="count" testid="chart-source" />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, testid }) {
  return (
    <div className="card-wtb p-6 text-center">
      <div className="font-serif-c text-5xl" style={{ color: "var(--gold-deep)" }} data-testid={testid}>{value}</div>
      <div className="eyebrow mt-2" style={{ fontSize: "0.55rem" }}>{label}</div>
    </div>
  );
}
