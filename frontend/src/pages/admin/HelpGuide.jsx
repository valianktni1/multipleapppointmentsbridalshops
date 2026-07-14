import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Rocket, Palette, MapPin, Tags, Clock, CalendarDays, Contact, Mail,
  Sliders, LifeBuoy, BookOpen, ArrowRight, CheckCircle2,
} from "lucide-react";
import { PageHead, Panel } from "@/components/admin/ui";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import SmtpGuideModal from "@/components/admin/SmtpGuideModal";

const QUICK_START = [
  "Set your brand name, colours and logo on the Branding page.",
  "Add or edit your boutique locations (name, address, phone).",
  "Create your appointment types (e.g. Bridal Consultation, Fitting).",
  "Set your weekly availability so customers can only book open slots.",
  "Configure your email (SMTP) so confirmations send from your address.",
  "Send yourself a test booking to see the whole flow end-to-end.",
];

const SECTIONS = [
  {
    icon: Palette,
    title: "Branding",
    body: "Make the booking page yours. Upload a logo, choose your brand name and accent colours. Everything customers see — the public booking page and confirmation emails — follows your branding automatically.",
  },
  {
    icon: MapPin,
    title: "Locations",
    body: "Manage each boutique you operate from. Edit the shop name, address and phone number. Customers pick a location when booking, and each location has its own availability and appointments.",
  },
  {
    icon: Tags,
    title: "Appointments",
    body: "Define the types of appointments you offer, how long they last, and any deposit required. Customers choose an appointment type as the first step of booking.",
  },
  {
    icon: Clock,
    title: "Availability",
    body: "Set the days and hours you accept appointments. The public calendar only shows open slots, so you never get double-booked or booked outside your hours.",
  },
  {
    icon: CalendarDays,
    title: "Bookings",
    body: "See every appointment request in one place. Confirm, cancel or mark bookings as completed. Statuses include pending, confirmed, cancelled, completed and no-show. Confirmation emails send automatically when enabled.",
  },
  {
    icon: Contact,
    title: "Customers",
    body: "A running record of everyone who has booked with you, so you can quickly see history and contact details for returning brides.",
  },
  {
    icon: Sliders,
    title: "Customise",
    body: "Fine-tune deposits per boutique and the small details of your booking experience so it matches how you like to work.",
  },
];

const FAQS = [
  {
    q: "How do customers book an appointment?",
    a: "They visit your public booking link, choose a location and appointment type, pick an available slot, and enter their details. You then receive the request and can confirm it.",
  },
  {
    q: "Why aren't my confirmation emails sending?",
    a: "Emails only send once you've configured your SMTP settings on the My Account page and turned on the relevant notifications. Use the “Send Test Email” button to confirm it works. If it fails, check the Common SMTP Settings reference.",
  },
  {
    q: "Do I need an “App Password” for my email?",
    a: "Many providers (Gmail, Yahoo, iCloud, Fastmail and others) require an App Password instead of your normal password when two-step verification is on. Open the Common SMTP Settings guide for details for your provider.",
  },
  {
    q: "Can I add more than one boutique?",
    a: "Yes, up to the number of locations included in your plan. If you need more, contact us and we'll increase your allowance.",
  },
  {
    q: "What happens when my free trial ends?",
    a: "Your data is safely stored. You'll see a prompt to continue — just get in touch and we'll keep everything running without losing a single booking.",
  },
];

export default function HelpGuide() {
  const { tenant } = useParams();
  const [smtpOpen, setSmtpOpen] = useState(false);
  const base = `/${tenant}/admin`;

  return (
    <div className="reveal-up" data-testid="help-guide-page">
      <PageHead eyebrow="Support" title="Help & Guide" />

      <p className="font-sans-j text-sm max-w-2xl mb-8" style={{ color: "var(--taupe)" }}>
        Everything you need to set up and run your booking system. Work through the quick-start checklist,
        then explore each feature below. Stuck on email? Open the common SMTP settings for your provider.
      </p>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Quick start */}
        <Panel className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-1">
            <Rocket size={18} style={{ color: "var(--gold)" }} />
            <h3 className="text-2xl">Quick Start</h3>
          </div>
          <p className="font-sans-j text-sm mb-6" style={{ color: "var(--taupe)" }}>
            Six steps to a live booking page. You can revisit any of these at any time.
          </p>
          <ol className="space-y-3">
            {QUICK_START.map((step, i) => (
              <li key={i} className="flex items-start gap-3" data-testid={`quickstart-${i}`}>
                <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center eyebrow"
                  style={{ background: "var(--champagne)", color: "var(--gold-deep)", fontSize: "0.55rem" }}>
                  {i + 1}
                </span>
                <span className="font-sans-j text-sm" style={{ color: "var(--charcoal)" }}>{step}</span>
              </li>
            ))}
          </ol>
        </Panel>

        {/* Email helper card */}
        <Panel>
          <div className="flex items-center gap-3 mb-1">
            <Mail size={18} style={{ color: "var(--gold)" }} />
            <h3 className="text-2xl">Email Setup</h3>
          </div>
          <p className="font-sans-j text-sm mb-5" style={{ color: "var(--taupe)" }}>
            Send booking confirmations from your own address. Configure SMTP under My Account, then send a test email.
          </p>
          <div className="space-y-3">
            <button className="btn-wtb btn-gold w-full justify-center" onClick={() => setSmtpOpen(true)} data-testid="help-open-smtp-guide">
              <BookOpen size={14} className="mr-2" /> Common SMTP Settings
            </button>
            <Link to={`${base}/account`} className="btn-wtb btn-ghost-wtb w-full justify-center" data-testid="help-go-account">
              Go to Email Settings <ArrowRight size={14} className="ml-2" />
            </Link>
          </div>
        </Panel>
      </div>

      {/* Feature guide */}
      <Panel className="mb-8">
        <h3 className="text-2xl mb-6">Feature Guide</h3>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
          {SECTIONS.map((s) => (
            <div key={s.title} className="flex gap-4" data-testid={`help-section-${s.title.toLowerCase()}`}>
              <div className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
                style={{ background: "var(--ivory-2)" }}>
                <s.icon size={18} style={{ color: "var(--gold-deep)" }} />
              </div>
              <div>
                <h4 className="text-lg mb-1">{s.title}</h4>
                <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* FAQ */}
      <Panel className="mb-8">
        <h3 className="text-2xl mb-4">Frequently Asked Questions</h3>
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`} style={{ borderColor: "var(--line)" }}>
              <AccordionTrigger className="text-base font-sans-j" data-testid={`faq-trigger-${i}`} style={{ color: "var(--charcoal)" }}>
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="font-sans-j text-sm" data-testid={`faq-content-${i}`}>
                <span style={{ color: "var(--taupe)" }}>{f.a}</span>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Panel>

      {/* Contact support */}
      <Panel className="text-center">
        <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--champagne)" }}>
          <LifeBuoy size={22} style={{ color: "var(--gold-deep)" }} />
        </div>
        <h3 className="text-2xl mb-2">Need a hand?</h3>
        <p className="font-sans-j text-sm mb-5 max-w-lg mx-auto" style={{ color: "var(--taupe)" }}>
          We're here to help you get set up and answer any questions about your booking system.
        </p>
        <a href="mailto:hello@ivory-digital.uk" className="btn-wtb btn-gold inline-flex" data-testid="help-contact-support">
          <Mail size={14} className="mr-2" /> Contact Support
        </a>
      </Panel>

      <SmtpGuideModal open={smtpOpen} onClose={() => setSmtpOpen(false)} />
    </div>
  );
}
