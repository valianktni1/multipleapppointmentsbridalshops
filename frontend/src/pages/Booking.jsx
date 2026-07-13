import React, { useEffect, useState, useMemo } from "react";
import {
  startOfToday, startOfMonth, endOfMonth, eachDayOfInterval, format,
  addMonths, isSameDay, isBefore, getDay,
} from "date-fns";
import { ChevronLeft, ChevronRight, MapPin, Phone, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { useParams, Link } from "react-router-dom";
import api, { apiErr } from "@/lib/api";
import { Wordmark, Eyebrow, GoldRule, DesignerCredit } from "@/components/Brand";
import { useTenant } from "@/context/TenantContext";
import PaymentPanel from "@/components/PaymentPanel";

const HERO = "https://images.unsplash.com/photo-1585241920473-b472eb9ffbae?q=75&w=1600&auto=format&fit=crop";

const STEPS = ["Boutique", "Appointment", "Date", "Time", "Your Details"];

function gcalUrl(b) {
  const pad = (n) => String(n).padStart(2, "0");
  const [y, m, d] = b.date.split("-").map(Number);
  const [hh, mm] = b.start_time.split(":").map(Number);
  const startMin = hh * 60 + mm;
  const endMin = startMin + (b.duration || 60);
  const dt = (mins) => `${y}${pad(m)}${pad(d)}T${pad(Math.floor(mins / 60))}${pad(mins % 60)}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.appointment_type_name} — ${b.shop_name}`,
    dates: `${dt(startMin)}/${dt(endMin)}`,
    details: `Reference ${b.reference}`,
    location: b.shop_address || b.shop_name || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function Header() {
  const t = useTenant();
  const { tenant } = useParams();
  const tagline = t?.tenant?.branding?.tagline || "";
  return (
    <header className="w-full py-6 px-6 md:px-12 flex items-center justify-between border-b" style={{ borderColor: "var(--line)", background: "var(--ivory)" }}>
      <Link to={`/${tenant}`} className="flex flex-col leading-none" data-testid="header-home-link">
        <Wordmark size="text-3xl md:text-4xl" />
        {tagline && <span className="eyebrow mt-1" style={{ fontSize: "0.55rem" }}>{tagline}</span>}
      </Link>
    </header>
  );
}

function Stepper({ step }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-12" data-testid="booking-stepper">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 text-xs rounded-full transition-colors"
            style={{
              background: i <= step ? "var(--gold)" : "transparent",
              color: i <= step ? "#fff" : "var(--taupe)",
              border: `1px solid ${i <= step ? "var(--gold)" : "var(--line)"}`,
            }}>{i < step ? <Check size={13} /> : i + 1}</span>
          <span className="eyebrow" style={{ fontSize: "0.6rem", color: i <= step ? "var(--gold-deep)" : "var(--taupe)" }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function MonthCalendar({ selected, onSelect }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const today = startOfToday();
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const leadEmpty = (getDay(startOfMonth(month)) + 6) % 7; // Mon-first
  const canPrev = !isSameDay(startOfMonth(month), startOfMonth(today)) && isBefore(startOfMonth(today), month);
  return (
    <div className="card-wtb p-6 max-w-md mx-auto" data-testid="booking-calendar">
      <div className="flex items-center justify-between mb-5">
        <button disabled={!canPrev} onClick={() => setMonth(addMonths(month, -1))}
          className="p-2 disabled:opacity-25 hover:text-[var(--gold-deep)]" data-testid="cal-prev"><ChevronLeft size={18} /></button>
        <span className="font-serif-c text-2xl">{format(month, "MMMM yyyy")}</span>
        <button onClick={() => setMonth(addMonths(month, 1))} className="p-2 hover:text-[var(--gold-deep)]" data-testid="cal-next"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mb-2">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="eyebrow" style={{ fontSize: "0.55rem" }}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: leadEmpty }).map((_, i) => <span key={`e${i}`} />)}
        {days.map((d) => {
          const past = isBefore(d, today);
          const isSel = selected && isSameDay(d, selected);
          return (
            <button key={d.toISOString()} disabled={past} onClick={() => onSelect(d)}
              data-testid={`cal-day-${format(d, "yyyy-MM-dd")}`}
              className="aspect-square flex items-center justify-center text-sm transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
              style={{
                background: isSel ? "var(--gold)" : "transparent",
                color: isSel ? "#fff" : "var(--charcoal)",
                border: `1px solid ${isSel ? "var(--gold)" : "transparent"}`,
              }}
              onMouseEnter={(e) => { if (!isSel && !past) e.currentTarget.style.background = "var(--ivory-2)"; }}
              onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Booking() {
  const { tenant: slug } = useParams();
  const tctx = useTenant();
  const status = tctx?.tenant?.status;
  const [step, setStep] = useState(0);
  const [shops, setShops] = useState([]);
  const [shop, setShop] = useState(null);
  const [types, setTypes] = useState([]);
  const [type, setType] = useState(null);
  const [date, setDate] = useState(null);
  const [slots, setSlots] = useState(null);
  const [slot, setSlot] = useState(null);
  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_phone: "", notes: "" });
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const [waitOpen, setWaitOpen] = useState(false);
  const [waitDone, setWaitDone] = useState(false);
  const [payConfig, setPayConfig] = useState(null);

  useEffect(() => { api.get("/shops").then((r) => setShops(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get("/payments/config").then((r) => setPayConfig(r.data)).catch(() => {}); }, []);

  const pickShop = async (s) => {
    setShop(s); setType(null); setDate(null); setSlot(null); setAnswers({});
    try { const { data } = await api.get(`/shops/${s.id}/appointment-types`); setTypes(data); } catch { setTypes([]); }
    setStep(1);
  };
  const pickType = (t) => { setType(t); setDate(null); setSlot(null); setStep(2); };
  const pickDate = async (d) => {
    setDate(d); setSlot(null); setSlots(null); setStep(3); setWaitOpen(false); setWaitDone(false);
    try {
      const { data } = await api.get("/public/slots", { params: { shop_id: shop.id, date: format(d, "yyyy-MM-dd"), duration: type.duration } });
      setSlots(data.slots);
    } catch { setSlots([]); }
  };
  const pickSlot = (t) => { setSlot(t); setStep(4); };

  const joinWaitlist = async () => {
    if (!form.customer_name || !form.customer_email || !form.customer_phone) {
      toast.error("Please add your name, email and phone to join the waitlist.");
      return;
    }
    try {
      await api.post("/public/waitlist", {
        shop_id: shop.id, appointment_type_id: type?.id, date: date ? format(date, "yyyy-MM-dd") : null,
        customer_name: form.customer_name, customer_email: form.customer_email, customer_phone: form.customer_phone, notes: form.notes,
      });
      setWaitDone(true); setWaitOpen(false);
    } catch (e) { toast.error(apiErr(e)); }
  };

  const submit = async () => {
    if (!form.customer_name || !form.customer_email || !form.customer_phone) {
      toast.error("Please complete your name, email and phone.");
      return;
    }
    const qs = (shop?.questions || []);
    for (const q of qs) {
      if (q.required && !(answers[q.id] || "").toString().trim()) {
        toast.error(`Please answer: ${q.label}`); return;
      }
    }
    const answerList = qs.map((q) => ({ label: q.label, value: (answers[q.id] || "").toString() })).filter((a) => a.value);
    setSubmitting(true);
    try {
      const { data } = await api.post("/public/bookings", {
        shop_id: shop.id, appointment_type_id: type.id, date: format(date, "yyyy-MM-dd"),
        start_time: slot, ...form, answers: answerList,
      });
      setConfirmed(data);
    } catch (e) {
      toast.error(apiErr(e));
    } finally { setSubmitting(false); }
  };

  const back = () => setStep((s) => Math.max(0, s - 1));

  if (status === "suspended" || status === "expired") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--ivory)" }}>
        <Header />
        <div className="flex-1 flex items-center justify-center px-6 py-20">
          <div className="card-wtb p-10 md:p-14 max-w-xl w-full text-center reveal-up" data-testid="booking-unavailable">
            <Eyebrow>Booking</Eyebrow>
            <h1 className="text-4xl md:text-5xl mt-3 mb-4">Temporarily Unavailable</h1>
            <GoldRule className="mx-auto mb-6" />
            <p className="font-sans-j" style={{ color: "var(--taupe)" }}>
              Online booking is currently unavailable. Please check back soon or contact the boutique directly.
            </p>
          </div>
        </div>
        <DesignerCredit />
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "var(--ivory)" }}>
        <Header />
        <div className="flex-1 flex items-center justify-center px-6 py-20">
          <div className="card-wtb p-10 md:p-14 max-w-xl w-full text-center reveal-up" data-testid="confirmation-card">
            <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-6" style={{ background: "var(--champagne)" }}>
              <Check size={26} style={{ color: "var(--gold-deep)" }} />
            </div>
            <Eyebrow>Request Received</Eyebrow>
            <h1 className="text-4xl md:text-5xl mt-3 mb-4">Thank You, {confirmed.customer_name.split(" ")[0]}</h1>
            <GoldRule className="mx-auto mb-6" />
            <p className="text-taupe font-sans-j mb-8" style={{ color: "var(--taupe)" }}>
              We've received your appointment request and will be in touch shortly to confirm. A member of our team looks forward to welcoming you.
            </p>
            <div className="text-left space-y-3 border-t border-b py-6 mb-8" style={{ borderColor: "var(--line)" }}>
              <Row k="Reference" v={confirmed.reference} testid="conf-ref" />
              <Row k="Boutique" v={confirmed.shop_name} />
              <Row k="Appointment" v={`${confirmed.appointment_type_name} · ${confirmed.duration} min`} />
              <Row k="Date" v={format(new Date(confirmed.date), "EEEE d MMMM yyyy")} />
              <Row k="Time" v={confirmed.start_time} />
              <Row k="Status" v="Pending confirmation" />
            </div>
            <PaymentPanel booking={confirmed} config={payConfig} onUpdate={setConfirmed} />
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6" data-testid="add-to-calendar">
              <a className="btn-wtb btn-ghost-wtb" data-testid="gcal-link" target="_blank" rel="noreferrer"
                href={gcalUrl(confirmed)}>Add to Google Calendar</a>
              <a className="btn-wtb btn-ghost-wtb" data-testid="ics-link"
                href={`${process.env.REACT_APP_BACKEND_URL}/api/public/bookings/${confirmed.reference}/calendar.ics?tenant=${slug}`}>Download .ics</a>
            </div>
            <button className="btn-wtb btn-gold" onClick={() => window.location.reload()} data-testid="book-another">Book Another</button>
            <a href={`/${slug}/booking/${confirmed.reference}`} className="block mt-5 eyebrow hover:opacity-70" style={{ fontSize: "0.6rem", color: "var(--gold-deep)" }} data-testid="manage-link">Manage or reschedule this booking →</a>
          </div>
        </div>
        <DesignerCredit />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--ivory)" }}>
      <Header />
      {/* Hero */}
      <section className="relative h-[320px] md:h-[420px] flex items-center justify-center overflow-hidden">
        <img src={HERO} alt="Bride in an elegant designer wedding gown" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(42,37,33,.35), rgba(42,37,33,.55))" }} />
        <div className="relative text-center px-6 reveal-up">
          <span className="eyebrow" style={{ color: "var(--champagne)" }}>Begin Your Story</span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl mt-4 mb-3" style={{ color: "#fff" }}>Book Your Private Appointment</h1>
          <p className="font-sans-j max-w-xl mx-auto" style={{ color: "rgba(255,255,255,.9)", fontWeight: 300 }}>
            A calm, unhurried experience, by appointment.
          </p>
        </div>
      </section>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16 md:py-20">
        <Stepper step={step} />

        {step === 0 && (
          <div className="reveal-up">
            <div className="text-center mb-12">
              <Eyebrow>Step One</Eyebrow>
              <h2 className="text-4xl md:text-5xl mt-3">Choose Your Boutique</h2>
              <GoldRule className="mx-auto mt-5" />
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {shops.map((s) => (
                <button key={s.id} onClick={() => pickShop(s)} data-testid={`shop-${s.slug}`}
                  className="card-wtb text-left transition-transform hover:-translate-y-1 duration-300 group overflow-hidden">
                  {s.photo_url && <img src={s.photo_url} alt={s.name} className="w-full h-40 object-cover" />}
                  <div className="p-8">
                    <Eyebrow style={{ fontSize: "0.6rem" }}>{s.role_label}</Eyebrow>
                    <h3 className="text-3xl mt-3 mb-4 group-hover:text-[var(--gold-deep)] transition-colors">{s.name}</h3>
                    <p className="font-sans-j mb-6" style={{ color: "var(--taupe)", fontWeight: 300 }}>{s.blurb}</p>
                    <div className="space-y-2 font-sans-j text-sm" style={{ color: "var(--ink)" }}>
                      <div className="flex items-center gap-2"><MapPin size={15} style={{ color: "var(--gold)" }} />{s.address}</div>
                      <div className="flex items-center gap-2"><Phone size={15} style={{ color: "var(--gold)" }} />{s.phone}</div>
                      {s.hours_text && <div className="flex items-center gap-2"><Clock size={15} style={{ color: "var(--gold)" }} />{s.hours_text}</div>}
                    </div>
                    <span className="inline-block mt-6 eyebrow group-hover:opacity-70" style={{ color: "var(--gold-deep)", fontSize: "0.6rem" }}>Select →</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="reveal-up">
            <div className="text-center mb-12">
              <Eyebrow>{shop.name}</Eyebrow>
              <h2 className="text-4xl md:text-5xl mt-3">Select An Appointment</h2>
              <GoldRule className="mx-auto mt-5" />
            </div>
            <div className="grid sm:grid-cols-2 gap-5 max-w-3xl mx-auto">
              {types.map((t) => (
                <button key={t.id} onClick={() => pickType(t)} data-testid={`type-${t.id}`}
                  className="card-wtb p-7 text-left transition-transform hover:-translate-y-1 duration-300 group">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-2xl group-hover:text-[var(--gold-deep)] transition-colors">{t.name}</h3>
                    <span className="flex items-center gap-1 eyebrow" style={{ color: "var(--gold-deep)", fontSize: "0.58rem" }}><Clock size={13} />{t.duration}m</span>
                  </div>
                  <p className="font-sans-j text-sm" style={{ color: "var(--taupe)", fontWeight: 300 }}>{t.description}</p>
                </button>
              ))}
              {types.length === 0 && <p className="font-sans-j text-center col-span-2" style={{ color: "var(--taupe)" }}>No appointment types available.</p>}
            </div>
            <div className="text-center mt-10"><button className="btn-wtb btn-ghost-wtb" onClick={back} data-testid="back-btn">← Back</button></div>
          </div>
        )}

        {step === 2 && (
          <div className="reveal-up">
            <div className="text-center mb-12">
              <Eyebrow>{type.name} · {type.duration} min</Eyebrow>
              <h2 className="text-4xl md:text-5xl mt-3">Choose A Date</h2>
              <GoldRule className="mx-auto mt-5" />
            </div>
            <MonthCalendar selected={date} onSelect={pickDate} />
            <div className="text-center mt-10"><button className="btn-wtb btn-ghost-wtb" onClick={back} data-testid="back-btn">← Back</button></div>
          </div>
        )}

        {step === 3 && (
          <div className="reveal-up">
            <div className="text-center mb-12">
              <Eyebrow>{format(date, "EEEE d MMMM")}</Eyebrow>
              <h2 className="text-4xl md:text-5xl mt-3">Choose A Time</h2>
              <GoldRule className="mx-auto mt-5" />
            </div>
            {slots === null && <p className="text-center eyebrow">Finding availability…</p>}
            {slots && slots.length === 0 && (
              <div className="max-w-md mx-auto text-center">
                <p className="font-sans-j mb-6" style={{ color: "var(--taupe)" }}>
                  No availability on this date. Please choose another day{waitDone ? "" : ", or join the waitlist and we'll be in touch if a slot frees up"}.
                </p>
                {waitDone ? (
                  <p className="eyebrow" data-testid="waitlist-done" style={{ color: "var(--gold-deep)" }}>You're on the waitlist — thank you.</p>
                ) : !waitOpen ? (
                  <button className="btn-wtb btn-gold" onClick={() => setWaitOpen(true)} data-testid="open-waitlist">Join the Waitlist</button>
                ) : (
                  <div className="card-wtb p-6 text-left space-y-4" data-testid="waitlist-form">
                    {[
                      { k: "customer_name", l: "Full Name", t: "text" },
                      { k: "customer_email", l: "Email", t: "email" },
                      { k: "customer_phone", l: "Phone", t: "tel" },
                    ].map((f) => (
                      <div key={f.k}>
                        <label className="field-label block mb-2">{f.l}</label>
                        <input className="input-wtb" type={f.t} value={form[f.k]} data-testid={`wait-${f.k}`}
                          onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                      </div>
                    ))}
                    <button className="btn-wtb btn-gold w-full" onClick={joinWaitlist} data-testid="submit-waitlist">Join Waitlist</button>
                  </div>
                )}
              </div>
            )}
            {slots && slots.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-w-2xl mx-auto" data-testid="slot-grid">
                {slots.map((t) => (
                  <button key={t} onClick={() => pickSlot(t)} data-testid={`slot-${t}`}
                    className="py-3 border font-sans-j text-sm transition-colors"
                    style={{ borderColor: "var(--line)", background: "#fff", color: "var(--charcoal)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--gold)"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "var(--gold)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.color = "var(--charcoal)"; e.currentTarget.style.borderColor = "var(--line)"; }}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="text-center mt-10"><button className="btn-wtb btn-ghost-wtb" onClick={back} data-testid="back-btn">← Back</button></div>
          </div>
        )}

        {step === 4 && (
          <div className="reveal-up max-w-2xl mx-auto">
            <div className="text-center mb-12">
              <Eyebrow>Almost There</Eyebrow>
              <h2 className="text-4xl md:text-5xl mt-3">Your Details</h2>
              <GoldRule className="mx-auto mt-5" />
            </div>
            <div className="card-wtb p-6 mb-8 flex flex-wrap gap-x-8 gap-y-2 justify-center text-sm font-sans-j" style={{ color: "var(--ink)" }}>
              <span><b className="font-serif-c text-lg">{shop.name}</b></span>
              <span>{type.name} · {type.duration} min</span>
              <span>{format(date, "EEE d MMM yyyy")}</span>
              <span style={{ color: "var(--gold-deep)" }}>{slot}</span>
            </div>
            <div className="space-y-5">
              {[
                { k: "customer_name", l: "Full Name", ph: "Your name", type: "text" },
                { k: "customer_email", l: "Email Address", ph: "you@email.com", type: "email" },
                { k: "customer_phone", l: "Phone Number", ph: "07…", type: "tel" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="field-label block mb-2">{f.l}</label>
                  <input className="input-wtb" type={f.type} placeholder={f.ph} value={form[f.k]}
                    data-testid={`input-${f.k}`}
                    onChange={(e) => setForm({ ...form, [f.k]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="field-label block mb-2">Notes (optional)</label>
                <textarea className="input-wtb" rows={3} placeholder="Anything you'd like us to know…" value={form.notes}
                  data-testid="input-notes"
                  onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              {(shop?.questions || []).map((q) => (
                <div key={q.id} data-testid={`question-field-${q.id}`}>
                  <label className="field-label block mb-2">{q.label}{q.required ? " *" : ""}</label>
                  {q.type === "textarea" ? (
                    <textarea className="input-wtb" rows={2} value={answers[q.id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                  ) : q.type === "select" ? (
                    <select className="input-wtb" value={answers[q.id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                      <option value="">Please choose…</option>
                      {(q.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className="input-wtb" type={q.type === "date" ? "date" : "text"} value={answers[q.id] || ""}
                      onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-10">
              <button className="btn-wtb btn-ghost-wtb" onClick={back} data-testid="back-btn">← Back</button>
              <button className="btn-wtb btn-gold" onClick={submit} disabled={submitting} data-testid="submit-booking">
                {submitting ? "Submitting…" : "Request Appointment"}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="band-champagne py-10 px-6 text-center">
        <Wordmark size="text-3xl" />
        {tctx?.tenant?.branding?.tagline && <p className="eyebrow mt-3" style={{ fontSize: "0.58rem" }}>{tctx.tenant.branding.tagline}</p>}
      </footer>
      <DesignerCredit />
    </div>
  );
}

function Row({ k, v, testid }) {
  return (
    <div className="flex justify-between items-baseline gap-4">
      <span className="field-label">{k}</span>
      <span className="font-sans-j text-sm text-right" data-testid={testid} style={{ color: "var(--charcoal)" }}>{v}</span>
    </div>
  );
}
