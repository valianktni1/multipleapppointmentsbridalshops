import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { Check, CalendarClock, XCircle } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { Wordmark, Eyebrow, GoldRule, DesignerCredit } from "@/components/Brand";
import { useTenant } from "@/context/TenantContext";
import PaymentPanel from "@/components/PaymentPanel";

function Header() {
  const t = useTenant();
  const { tenant } = useParams();
  const tagline = t?.tenant?.branding?.tagline || "";
  return (
    <header className="w-full py-6 px-6 md:px-12 flex items-center justify-between border-b" style={{ borderColor: "var(--line)", background: "var(--ivory)" }}>
      <a href={`/${tenant}`} className="flex flex-col leading-none">
        <Wordmark size="text-3xl md:text-4xl" />
        {tagline && <span className="eyebrow mt-1" style={{ fontSize: "0.55rem" }}>{tagline}</span>}
      </a>
      <a href={`/${tenant}`} className="eyebrow hover:opacity-70 transition-opacity" data-testid="new-booking-link">New Booking →</a>
    </header>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between items-baseline gap-4 border-b pb-3" style={{ borderColor: "var(--line)" }}>
      <span className="field-label">{k}</span>
      <span className="font-sans-j text-sm text-right" style={{ color: "var(--charcoal)" }}>{v}</span>
    </div>
  );
}

export default function ManageBooking() {
  const { reference, tenant } = useParams();
  const [b, setB] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [reschedule, setReschedule] = useState(false);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState(null);
  const [busy, setBusy] = useState(false);
  const [payConfig, setPayConfig] = useState(null);

  const load = () => api.get(`/public/bookings/${reference}`).then((r) => setB(r.data)).catch(() => setNotFound(true));
  useEffect(() => { load(); api.get("/payments/config").then((r) => setPayConfig(r.data)).catch(() => {}); /* eslint-disable-next-line */ }, [reference]);

  const findSlots = async (d) => {
    setDate(d); setSlots(null);
    try { const { data } = await api.get("/public/slots", { params: { shop_id: b.shop_id, date: d, duration: b.duration } }); setSlots(data.slots); }
    catch { setSlots([]); }
  };

  const doReschedule = async (start_time) => {
    setBusy(true);
    try { await api.post(`/public/bookings/${reference}/reschedule`, { date, start_time }); toast.success("Appointment rescheduled"); setReschedule(false); setSlots(null); load(); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const doCancel = async () => {
    if (!window.confirm("Cancel this appointment?")) return;
    setBusy(true);
    try { await api.post(`/public/bookings/${reference}/cancel`); toast.success("Appointment cancelled"); load(); }
    catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const canChange = b && (b.status === "pending" || b.status === "confirmed");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--ivory)" }}>
      <Header />
      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-xl reveal-up">
          {notFound ? (
            <div className="card-wtb p-10 text-center">
              <h1 className="text-4xl mb-3">Booking Not Found</h1>
              <GoldRule className="mx-auto mb-5" />
              <p className="font-sans-j" style={{ color: "var(--taupe)" }}>We couldn't find a booking with reference <b>{reference}</b>.</p>
              <a href={`/${tenant}`} className="btn-wtb btn-gold inline-block mt-8">Make a New Booking</a>
            </div>
          ) : !b ? (
            <p className="text-center eyebrow">Loading…</p>
          ) : (
            <div className="card-wtb p-10">
              <div className="text-center mb-8">
                <Eyebrow>Reference {b.reference}</Eyebrow>
                <h1 className="text-4xl md:text-5xl mt-2">Your Appointment</h1>
                <GoldRule className="mx-auto mt-4" />
              </div>
              <div className="space-y-3 mb-8" data-testid="manage-details">
                <Row k="Status" v={<span style={{ textTransform: "capitalize" }}>{b.status}</span>} />
                <Row k="Boutique" v={b.shop_name} />
                <Row k="Appointment" v={`${b.appointment_type_name} · ${b.duration} min`} />
                <Row k="Date" v={format(new Date(b.date), "EEEE d MMMM yyyy")} />
                <Row k="Time" v={b.start_time} />
                <Row k="Name" v={b.customer_name} />
              </div>

              <PaymentPanel booking={b} config={payConfig} onUpdate={setB} />

              {b.status === "cancelled" && <p className="text-center font-sans-j" style={{ color: "#9a4a3f" }}>This appointment has been cancelled.</p>}
              {b.status === "completed" && <p className="text-center font-sans-j" style={{ color: "var(--taupe)" }}>This appointment is complete.</p>}

              {canChange && !reschedule && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button className="btn-wtb btn-gold flex-1" onClick={() => setReschedule(true)} data-testid="start-reschedule">
                    <CalendarClock size={15} className="mr-2" /> Reschedule
                  </button>
                  <button className="btn-wtb flex-1" style={{ borderColor: "#9a4a3f", color: "#9a4a3f" }} onClick={doCancel} disabled={busy} data-testid="cancel-my-booking">
                    <XCircle size={15} className="mr-2" /> Cancel Appointment
                  </button>
                </div>
              )}

              {canChange && reschedule && (
                <div className="border-t pt-6" style={{ borderColor: "var(--line)" }}>
                  <p className="field-label mb-3">Pick a new date</p>
                  <input type="date" className="input-wtb mb-5" value={date} min={format(new Date(), "yyyy-MM-dd")}
                    data-testid="reschedule-date" onChange={(e) => findSlots(e.target.value)} />
                  {slots === null && date && <p className="eyebrow">Finding availability…</p>}
                  {slots && slots.length === 0 && <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>No availability on this date.</p>}
                  {slots && slots.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3" data-testid="reschedule-slots">
                      {slots.map((t) => (
                        <button key={t} disabled={busy} onClick={() => doReschedule(t)} data-testid={`reslot-${t}`}
                          className="py-3 border font-sans-j text-sm transition-colors hover:bg-[var(--gold)] hover:text-white"
                          style={{ borderColor: "var(--line)", background: "#fff", color: "var(--charcoal)" }}>{t}</button>
                      ))}
                    </div>
                  )}
                  <button className="btn-wtb btn-ghost-wtb mt-6" onClick={() => { setReschedule(false); setSlots(null); }}>← Back</button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <DesignerCredit />
    </div>
  );
}
