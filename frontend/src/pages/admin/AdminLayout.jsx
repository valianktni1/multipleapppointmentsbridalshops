import React from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { LayoutDashboard, CalendarDays, Clock, Tags, Users, Settings as Cog, UserCircle, LogOut, Sliders, ListChecks, BarChart3, Contact, MapPin, Palette, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Wordmark, DesignerCredit } from "@/components/Brand";

const NAV = [
  { seg: "", icon: LayoutDashboard, label: "Dashboard", end: true },
  { seg: "bookings", icon: CalendarDays, label: "Bookings" },
  { seg: "customers", icon: Contact, label: "Customers" },
  { seg: "analytics", icon: BarChart3, label: "Analytics" },
  { seg: "availability", icon: Clock, label: "Availability" },
  { seg: "appointment-types", icon: Tags, label: "Appointments" },
  { seg: "locations", icon: MapPin, label: "Locations" },
  { seg: "waitlist", icon: ListChecks, label: "Waitlist" },
  { seg: "customise", icon: Sliders, label: "Customise" },
  { seg: "branding", icon: Palette, label: "Branding", superadmin: true },
  { seg: "admins", icon: Users, label: "Admins", superadmin: true },
  { seg: "settings", icon: Cog, label: "Settings", superadmin: true },
  { seg: "account", icon: UserCircle, label: "My Account" },
];

function LockScreen({ status, brand }) {
  const expired = status === "expired";
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--ivory)" }}>
      <div className="card-wtb p-10 md:p-14 max-w-lg text-center reveal-up" data-testid={`lock-${status}`}>
        <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-6" style={{ background: "var(--champagne)" }}>
          <AlertTriangle size={26} style={{ color: "var(--gold-deep)" }} />
        </div>
        <h1 className="text-4xl mb-3">{expired ? "Your Trial Has Ended" : "Account Suspended"}</h1>
        <span className="gold-rule block mx-auto mb-5" />
        <p className="font-sans-j mb-8" style={{ color: "var(--taupe)" }}>
          {expired
            ? `Your ${brand} free trial has come to an end. Please contact us to continue using your booking system — all your data is safely stored.`
            : `Access to ${brand} has been temporarily suspended. Please contact support to restore your account.`}
        </p>
        <a href="mailto:hello@ivory-digital.uk" className="btn-wtb btn-gold inline-block">Contact Us</a>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { tenant } = useParams();
  const nav = useNavigate();
  const base = `/${tenant}/admin`;
  const items = NAV.filter((n) => !n.superadmin || user?.role === "superadmin");

  const status = user?.tenant?.status;
  const daysLeft = user?.tenant?.trial_days_remaining;
  const brand = user?.tenant?.branding?.brand_name || "your";

  const doLogout = () => { logout(); nav(`/${tenant}/admin/login`); };

  if (status === "expired" || status === "suspended") {
    return (
      <div>
        <div className="fixed top-0 right-0 p-4 z-50">
          <button onClick={doLogout} data-testid="lock-logout" className="flex items-center gap-2 font-sans-j text-sm" style={{ color: "var(--taupe)" }}><LogOut size={16} /> Sign Out</button>
        </div>
        <LockScreen status={status} brand={brand} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--ivory)" }}>
      <aside className="w-64 shrink-0 hidden md:flex flex-col border-r" style={{ borderColor: "var(--line)", background: "#fff" }}>
        <div className="p-6 border-b" style={{ borderColor: "var(--line)" }}>
          <Wordmark size="text-3xl" />
          <p className="eyebrow mt-1" style={{ fontSize: "0.5rem" }}>Appointments Admin</p>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {items.map((n) => (
            <NavLink key={n.seg} to={`${base}/${n.seg}`.replace(/\/$/, "")} end={n.end} data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              className="flex items-center gap-3 px-4 py-3 font-sans-j text-sm transition-colors"
              style={({ isActive }) => ({
                background: isActive ? "var(--charcoal)" : "transparent",
                color: isActive ? "var(--ivory)" : "var(--ink)",
              })}>
              <n.icon size={17} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t" style={{ borderColor: "var(--line)" }}>
          <div className="px-2 mb-3">
            <p className="font-sans-j text-sm" style={{ color: "var(--charcoal)" }}>{user?.name}</p>
            <p className="eyebrow" style={{ fontSize: "0.5rem" }}>{user?.role === "superadmin" ? "Owner" : "Admin"}</p>
          </div>
          <button onClick={doLogout} data-testid="logout-btn"
            className="flex items-center gap-2 px-2 font-sans-j text-sm hover:text-[var(--gold-deep)]" style={{ color: "var(--taupe)" }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--line)", background: "#fff" }}>
        <Wordmark size="text-2xl" />
        <button onClick={doLogout} style={{ color: "var(--taupe)" }} data-testid="logout-btn-mobile"><LogOut size={18} /></button>
      </div>

      <main className="flex-1 min-w-0 p-6 md:p-10 pt-20 md:pt-10 overflow-x-hidden">
        {status === "trial" && (
          <div className="mb-6 flex items-center gap-3 px-5 py-3 border" data-testid="trial-banner"
            style={{ background: "var(--champagne)", borderColor: "var(--gold)", color: "var(--gold-deep)" }}>
            <Clock size={16} />
            <span className="font-sans-j text-sm">
              {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left in your free trial.` : "Your free trial ends today."} Enjoy full access to every feature.
            </span>
          </div>
        )}
        <div className="md:hidden flex gap-2 overflow-x-auto pb-4 mb-4">
          {items.map((n) => (
            <NavLink key={n.seg} to={`${base}/${n.seg}`.replace(/\/$/, "")} end={n.end}
              className="eyebrow whitespace-nowrap px-3 py-2 border" style={{ fontSize: "0.55rem", borderColor: "var(--line)" }}>
              {n.label}
            </NavLink>
          ))}
        </div>
        <Outlet />
        <div className="mt-12"><DesignerCredit /></div>
      </main>
    </div>
  );
}
