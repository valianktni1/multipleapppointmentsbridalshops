import React, { useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { toast } from "sonner";
import api, { apiErr } from "@/lib/api";

const CUR = { GBP: "£", USD: "$", EUR: "€" };
const money = (amount, currency) => `${CUR[currency] || ""}${Number(amount || 0).toFixed(2)}`;

export default function PaymentPanel({ booking, config, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  if (!booking || !config) return null;

  const amount = Number(booking.deposit_amount || 0);
  const status = booking.payment_status || "not_required";
  const cur = config.currency || "GBP";
  if (status === "not_required" || amount <= 0) return null;

  if (status === "paid") {
    return (
      <div className="border-t border-b py-5 my-6 text-center" style={{ borderColor: "var(--line)" }} data-testid="payment-paid">
        <p className="font-sans-j text-sm" style={{ color: "#3f6b39" }}>✓ Deposit of {money(amount, cur)} paid — thank you.</p>
      </div>
    );
  }
  if (status === "pay_in_person") {
    return (
      <div className="border-t border-b py-5 my-6 text-center" style={{ borderColor: "var(--line)" }} data-testid="payment-in-person">
        <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>A deposit of {money(amount, cur)} is payable in person / on the day.</p>
      </div>
    );
  }

  const methods = config.methods || [];
  if (methods.length === 0) return null;
  const hasClaimed = claimed || booking.deposit_claimed;

  const call = async (path, successMsg, mark) => {
    setBusy(true);
    try {
      const { data } = await api.post(path);
      onUpdate?.(data);
      if (mark) setClaimed(true);
      toast.success(successMsg);
    } catch (e) { toast.error(apiErr(e)); }
    finally { setBusy(false); }
  };

  const notifyPaid = () => call(`/public/bookings/${booking.reference}/notify-paid`, "Thank you — we'll confirm your deposit shortly.", true);
  const payInPerson = () => call(`/public/bookings/${booking.reference}/pay-in-person`, "Noted — please pay on the day.");

  const IvePaid = () => hasClaimed ? (
    <p className="font-sans-j text-sm" data-testid="deposit-claimed" style={{ color: "#3f6b39" }}>Thank you — we'll confirm your deposit shortly.</p>
  ) : (
    <button className="btn-wtb btn-ghost-wtb" onClick={notifyPaid} disabled={busy} data-testid="notify-paid-btn">I've paid — notify the boutique</button>
  );

  return (
    <div className="border-t border-b py-6 my-6 text-center" style={{ borderColor: "var(--line)" }} data-testid="payment-panel">
      <p className="field-label mb-1">Deposit Due</p>
      <p className="font-serif-c text-3xl mb-2" style={{ color: "var(--gold-deep)" }} data-testid="payment-amount">{money(amount, cur)}</p>
      {methods.length > 1 && <p className="font-sans-j text-xs mb-4" style={{ color: "var(--taupe)" }}>Choose how you'd like to pay:</p>}

      <div className="space-y-6">
        {methods.includes("paypal_me") && config.paypal_me_url && (
          <div className="space-y-2" data-testid="method-paypal_me">
            {methods.length > 1 && <p className="eyebrow" style={{ fontSize: "0.55rem" }}>PayPal</p>}
            <a className="btn-wtb btn-gold inline-block" data-testid="paypalme-link" target="_blank" rel="noreferrer"
              href={`${config.paypal_me_url}/${amount.toFixed(2)}${cur}`}>Pay {money(amount, cur)} with PayPal</a>
            <p className="font-sans-j text-xs" style={{ color: "var(--taupe)" }}>Please use your reference <b>{booking.reference}</b> as the payment note.</p>
          </div>
        )}

        {methods.includes("bank_transfer") && (
          <div className="space-y-2" data-testid="method-bank_transfer">
            {methods.length > 1 && <p className="eyebrow" style={{ fontSize: "0.55rem" }}>Bank Transfer</p>}
            <div className="font-sans-j text-sm inline-block text-left" style={{ color: "var(--charcoal)" }}>
              {config.bank?.account_name && <div><b>Name:</b> {config.bank.account_name}</div>}
              {config.bank?.sort_code && <div><b>Sort code:</b> {config.bank.sort_code}</div>}
              {config.bank?.account_number && <div><b>Account no:</b> {config.bank.account_number}</div>}
              <div><b>Reference:</b> {booking.reference}</div>
            </div>
          </div>
        )}

        {methods.includes("paypal") && config.paypal_configured && (
          <div className="max-w-xs mx-auto" data-testid="method-paypal">
            {methods.length > 1 && <p className="eyebrow mb-2" style={{ fontSize: "0.55rem" }}>Pay by Card</p>}
            <PayPalScriptProvider options={{ clientId: config.paypal_client_id, currency: cur }}>
              <PayPalButtons
                style={{ layout: "vertical", color: "gold", shape: "rect" }}
                createOrder={async () => (await api.post(`/public/bookings/${booking.reference}/paypal/create-order`)).data.id}
                onApprove={async (data) => {
                  try {
                    const { data: b } = await api.post(`/public/bookings/${booking.reference}/paypal/capture-order`, null, { params: { order_id: data.orderID } });
                    onUpdate?.(b);
                    toast.success("Payment received — thank you!");
                  } catch (e) { toast.error(apiErr(e)); }
                }}
                onError={() => toast.error("PayPal payment could not be completed.")}
              />
            </PayPalScriptProvider>
          </div>
        )}

        {methods.includes("paypal") && !config.paypal_configured && methods.length === 1 && (
          <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>Online payment is not yet available — we'll take your deposit another way.</p>
        )}

        {methods.includes("in_person") && (
          <div data-testid="method-in_person">
            {methods.length > 1 && <p className="eyebrow" style={{ fontSize: "0.55rem" }}>Pay in Person</p>}
            <p className="font-sans-j text-sm" style={{ color: "var(--taupe)" }}>You can pay your deposit in person / on the day.</p>
          </div>
        )}
      </div>

      <div className="mt-6 space-y-3">
        {(methods.includes("paypal_me") || methods.includes("bank_transfer")) && <IvePaid />}
        {methods.includes("in_person") && methods.length > 1 && (
          <button className="block mx-auto eyebrow hover:opacity-70" style={{ fontSize: "0.6rem", color: "var(--taupe)" }}
            onClick={payInPerson} disabled={busy} data-testid="pay-in-person-btn">I'll pay in person →</button>
        )}
      </div>
    </div>
  );
}
