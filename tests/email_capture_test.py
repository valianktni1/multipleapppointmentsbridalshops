import asyncio
import time
import threading
import requests
from datetime import date, timedelta
from aiosmtpd.controller import Controller

B = "http://localhost:8001/api"
CAPTURED = []


class Handler:
    async def handle_DATA(self, server, session, envelope):
        CAPTURED.append({"from": envelope.mail_from, "to": envelope.rcpt_tos,
                         "data": envelope.content.decode("utf8", "replace")})
        return "250 OK"


def next_wed():
    d = date.today() + timedelta(days=1)
    while d.weekday() != 2:
        d += timedelta(days=1)
    return d.isoformat()


def make_tenant(slug, tok):
    hd = {"Authorization": f"Bearer {tok}"}
    for t in requests.get(f"{B}/platform/tenants", headers=hd).json():
        if t["slug"] == slug:
            requests.delete(f"{B}/platform/tenants/{t['id']}", headers=hd)
    requests.post(f"{B}/platform/tenants", headers=hd, json={
        "name": slug, "slug": slug, "owner_email": f"o@{slug}.com", "owner_password": "pass123", "locations": 1})


def book(slug):
    th = {"X-Tenant": slug}
    shop = requests.get(f"{B}/shops", headers=th).json()[0]
    types = requests.get(f"{B}/shops/{shop['id']}/appointment-types", headers=th).json()
    d = next_wed()
    slots = requests.get(f"{B}/public/slots?shop_id={shop['id']}&date={d}&duration={types[0]['duration']}", headers=th).json()["slots"]
    t0 = time.time()
    r = requests.post(f"{B}/public/bookings", headers=th, json={
        "shop_id": shop["id"], "appointment_type_id": types[0]["id"], "date": d, "start_time": slots[0],
        "customer_name": "Jane Test", "customer_email": "jane@example.com", "customer_phone": "0700"}, timeout=30)
    return r.status_code, round(time.time() - t0, 2)


def main():
    controller = Controller(Handler(), hostname="127.0.0.1", port=8025)
    controller.start()
    try:
        tok = requests.post(f"{B}/platform/login", json={"email": "admin@ivory-digital.uk", "password": "IvoryAdmin2025!"}).json()["access_token"]

        # === Test 1: working local SMTP -> email must be captured, booking fast ===
        make_tenant("mailtest", tok)
        ownertok = requests.post(f"{B}/auth/login", headers={"X-Tenant": "mailtest"},
                                 json={"email": "o@mailtest.com", "password": "pass123"}).json()["access_token"]
        ah = {"Authorization": f"Bearer {ownertok}", "X-Tenant": "mailtest"}
        requests.put(f"{B}/settings", headers=ah, json={
            "smtp_host": "127.0.0.1", "smtp_port": 8025, "smtp_user": "", "business_email": "shop@mailtest.com",
            "from_name": "Mailtest", "notify_customer_on_booking": True, "notify_shop_on_booking": True})
        CAPTURED.clear()
        status, elapsed = book("mailtest")
        time.sleep(2)  # allow background email tasks to complete
        print(f"[working SMTP] booking status={status} elapsed={elapsed}s  emails_captured={len(CAPTURED)}")
        recips = [r for c in CAPTURED for r in c["to"]]
        print(f"  recipients: {recips}")
        assert status == 200, "booking failed"
        assert elapsed < 3, f"booking too slow ({elapsed}s) - email is blocking the request"
        assert len(CAPTURED) >= 2, f"expected 2 emails (customer + shop), captured {len(CAPTURED)}"
        assert "jane@example.com" in recips and "shop@mailtest.com" in recips, "wrong recipients"
        print("  PASS: emails sent AND booking fast")

        # === Test 2: UNREACHABLE SMTP -> booking must STILL be fast (non-blocking) ===
        make_tenant("slowtest", tok)
        ot2 = requests.post(f"{B}/auth/login", headers={"X-Tenant": "slowtest"},
                            json={"email": "o@slowtest.com", "password": "pass123"}).json()["access_token"]
        ah2 = {"Authorization": f"Bearer {ot2}", "X-Tenant": "slowtest"}
        requests.put(f"{B}/settings", headers=ah2, json={
            "smtp_host": "10.255.255.1", "smtp_port": 587, "smtp_user": "", "business_email": "shop@slowtest.com",
            "from_name": "Slowtest", "notify_customer_on_booking": True, "notify_shop_on_booking": True})
        status, elapsed = book("slowtest")
        print(f"[unreachable SMTP] booking status={status} elapsed={elapsed}s")
        assert status == 200 and elapsed < 3, f"booking blocked by unreachable SMTP ({elapsed}s)"
        print("  PASS: booking stays fast even when SMTP is unreachable")

        # cleanup
        hd = {"Authorization": f"Bearer {tok}"}
        for t in requests.get(f"{B}/platform/tenants", headers=hd).json():
            if t["slug"] in ("mailtest", "slowtest"):
                requests.delete(f"{B}/platform/tenants/{t['id']}", headers=hd)
        print("\nALL EMAIL/PERFORMANCE CHECKS PASSED")
    finally:
        controller.stop()


if __name__ == "__main__":
    main()
