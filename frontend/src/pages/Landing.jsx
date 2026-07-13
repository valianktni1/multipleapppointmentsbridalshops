import React from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, Building2, ShieldCheck, Sparkles } from "lucide-react";

const HERO = "https://images.unsplash.com/photo-1585241920473-b472eb9ffbae?q=75&w=1600&auto=format&fit=crop";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--ivory)" }}>
      <header className="w-full py-6 px-6 md:px-12 flex items-center justify-between border-b" style={{ borderColor: "var(--line)" }}>
        <span className="wordmark text-3xl md:text-4xl" data-testid="platform-wordmark">Ivory Digital</span>
        <Link to="/superadmin" className="btn-wtb btn-ghost-wtb" data-testid="platform-login-link">Platform Login</Link>
      </header>

      <section className="relative h-[420px] flex items-center justify-center overflow-hidden">
        <img src={HERO} alt="Elegant bridal boutique" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(42,37,33,.45), rgba(42,37,33,.65))" }} />
        <div className="relative text-center px-6 reveal-up">
          <span className="eyebrow" style={{ color: "var(--champagne)" }}>White-label Booking Platform</span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl mt-4 mb-3" style={{ color: "#fff" }}>Beautiful Appointments, Your Brand</h1>
          <p className="font-sans-j max-w-xl mx-auto" style={{ color: "rgba(255,255,255,.9)", fontWeight: 300 }}>
            A refined, multi-tenant appointment system for bridal boutiques — each company with its own site, branding and a 7-day free trial.
          </p>
          <Link to="/superadmin" className="btn-wtb btn-gold mt-8 inline-block" data-testid="hero-cta">Enter Platform</Link>
        </div>
      </section>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: Building2, t: "Multi-tenant", d: "Onboard unlimited companies, each fully isolated with their own data." },
            { icon: Sparkles, t: "White-label", d: "Per-company brand name, logo and colours across site and emails." },
            { icon: CalendarCheck, t: "Full booking suite", d: "Availability, deposits, waitlists, reminders, analytics & more." },
            { icon: ShieldCheck, t: "7-day trials", d: "Every company starts on a full-feature trial you control centrally." },
          ].map((f) => (
            <div key={f.t} className="card-wtb p-8 text-center">
              <f.icon size={26} style={{ color: "var(--gold)" }} className="mx-auto mb-4" />
              <h3 className="text-2xl mb-2">{f.t}</h3>
              <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>{f.d}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-16">
          <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>
            Companies are hosted at <b>ivory-digital.uk/company-name</b>. Manage them all from the platform panel.
          </p>
        </div>
      </main>

      <footer className="py-8 text-center border-t" style={{ borderColor: "var(--line)" }}>
        <span className="eyebrow" style={{ fontSize: "0.55rem" }}>Ivory Digital · ivory-digital.uk</span>
      </footer>
    </div>
  );
}
