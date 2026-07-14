"""
Backend API tests for bridal booking platform - email bug fix verification.
Tests regression scenarios: booking without SMTP, admin confirm, test-email endpoint.
"""
import sys
import time
import requests
from datetime import date, timedelta

BASE = "http://localhost:8001/api"
PLATFORM_EMAIL = "admin@ivory-digital.uk"
PLATFORM_PW = "IvoryAdmin2025!"

passed = 0
failed = 0


def check(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✅ PASS: {msg}")
    else:
        failed += 1
        print(f"  ❌ FAIL: {msg}")


def h(token=None, tenant=None):
    hd = {"Content-Type": "application/json"}
    if token:
        hd["Authorization"] = f"Bearer {token}"
    if tenant:
        hd["X-Tenant"] = tenant
    return hd


def next_wed():
    """Get next Wednesday (default seed hours: Tue-Sat open)"""
    d = date.today() + timedelta(days=1)
    while d.weekday() != 2:  # Wednesday
        d += timedelta(days=1)
    return d.isoformat()


def main():
    print("\n=== Backend API Tests - Email Bug Fix Verification ===\n")
    
    # Platform login
    print("1. Platform login")
    r = requests.post(f"{BASE}/platform/login", json={"email": PLATFORM_EMAIL, "password": PLATFORM_PW})
    check(r.status_code == 200, f"platform login -> {r.status_code}")
    if r.status_code != 200:
        print(f"Cannot proceed without platform access. Response: {r.text}")
        sys.exit(1)
    ptok = r.json()["access_token"]
    
    # Cleanup previous test tenant
    print("\n2. Setup test tenant")
    tl = requests.get(f"{BASE}/platform/tenants", headers=h(ptok)).json()
    for t in tl:
        if t["slug"] == "regtest":
            requests.delete(f"{BASE}/platform/tenants/{t['id']}", headers=h(ptok))
    
    # Create test tenant
    rt = requests.post(f"{BASE}/platform/tenants", headers=h(ptok), json={
        "name": "Regression Test", "slug": "regtest", "owner_email": "owner@regtest.com",
        "owner_password": "regtest123", "locations": 1})
    check(rt.status_code == 200, f"create test tenant -> {rt.status_code}")
    if rt.status_code != 200:
        print(f"Cannot proceed. Response: {rt.text}")
        sys.exit(1)
    tenant = rt.json()
    
    # Tenant owner login
    print("\n3. Tenant owner login")
    lo = requests.post(f"{BASE}/auth/login", headers=h(tenant="regtest"),
                       json={"email": "owner@regtest.com", "password": "regtest123"})
    check(lo.status_code == 200, f"owner login -> {lo.status_code}")
    if lo.status_code != 200:
        print(f"Cannot proceed. Response: {lo.text}")
        sys.exit(1)
    otok = lo.json()["access_token"]
    
    # Get shop and appointment type
    shops = requests.get(f"{BASE}/shops", headers=h(tenant="regtest")).json()
    shop = shops[0]
    types = requests.get(f"{BASE}/shops/{shop['id']}/appointment-types", headers=h(tenant="regtest")).json()
    atype = types[0]
    
    # === TEST 1: Normal booking WITHOUT SMTP (regression) ===
    print("\n4. TEST: Normal booking without SMTP configured")
    d = next_wed()
    slots = requests.get(f"{BASE}/public/slots?shop_id={shop['id']}&date={d}&duration={atype['duration']}",
                        headers=h(tenant="regtest")).json()
    check(len(slots.get("slots", [])) > 0, f"slots available ({len(slots.get('slots', []))} slots)")
    
    t0 = time.time()
    rb = requests.post(f"{BASE}/public/bookings", headers=h(tenant="regtest"), json={
        "shop_id": shop["id"], "appointment_type_id": atype["id"], "date": d,
        "start_time": slots["slots"][0], "customer_name": "Test Customer",
        "customer_email": "test@example.com", "customer_phone": "0700"}, timeout=10)
    elapsed = round(time.time() - t0, 2)
    check(rb.status_code == 200, f"booking created without SMTP -> {rb.status_code}")
    check(elapsed < 3, f"booking fast without SMTP ({elapsed}s < 3s)")
    if rb.status_code != 200:
        print(f"  Response: {rb.text}")
        sys.exit(1)
    booking = rb.json()
    check("reference" in booking, f"booking has reference: {booking.get('reference')}")
    
    # === TEST 2: GET booking by reference (regression) ===
    print("\n5. TEST: GET booking by reference")
    rg = requests.get(f"{BASE}/public/bookings/{booking['reference']}", headers=h(tenant="regtest"))
    check(rg.status_code == 200, f"GET booking by reference -> {rg.status_code}")
    check(rg.json().get("reference") == booking["reference"], "reference matches")
    
    # === TEST 3: Reschedule booking (regression) ===
    print("\n6. TEST: Reschedule booking")
    slots2 = requests.get(f"{BASE}/public/slots?shop_id={shop['id']}&date={d}&duration={atype['duration']}",
                         headers=h(tenant="regtest")).json()
    if len(slots2["slots"]) > 1:
        rr = requests.post(f"{BASE}/public/bookings/{booking['reference']}/reschedule",
                          headers=h(tenant="regtest"),
                          json={"date": d, "start_time": slots2["slots"][1]})
        check(rr.status_code == 200, f"reschedule booking -> {rr.status_code}")
    else:
        print("  ⚠️  SKIP: not enough slots to test reschedule")
    
    # === TEST 4: Cancel booking (regression) ===
    print("\n7. TEST: Cancel booking")
    rc = requests.post(f"{BASE}/public/bookings/{booking['reference']}/cancel", headers=h(tenant="regtest"))
    check(rc.status_code == 200, f"cancel booking -> {rc.status_code}")
    
    # === TEST 5: Admin confirm endpoint (regression) ===
    print("\n8. TEST: Admin confirm endpoint (must be fast)")
    # Create another booking to confirm
    slots3 = requests.get(f"{BASE}/public/slots?shop_id={shop['id']}&date={d}&duration={atype['duration']}",
                         headers=h(tenant="regtest")).json()
    rb2 = requests.post(f"{BASE}/public/bookings", headers=h(tenant="regtest"), json={
        "shop_id": shop["id"], "appointment_type_id": atype["id"], "date": d,
        "start_time": slots3["slots"][0], "customer_name": "Test Customer 2",
        "customer_email": "test2@example.com", "customer_phone": "0701"})
    booking2 = rb2.json()
    
    # Admin confirm (should be fast even with notify_on_confirm enabled)
    t0 = time.time()
    rconf = requests.patch(f"{BASE}/bookings/{booking2['id']}", headers=h(otok, "regtest"),
                          json={"status": "confirmed"})
    elapsed = round(time.time() - t0, 2)
    check(rconf.status_code == 200, f"admin confirm -> {rconf.status_code}")
    check(elapsed < 3, f"admin confirm fast ({elapsed}s < 3s)")
    
    # === TEST 6: Test-email endpoint with no SMTP configured ===
    print("\n9. TEST: Test-email endpoint without SMTP")
    rte = requests.post(f"{BASE}/auth/my-email-settings/test", headers=h(otok, "regtest"),
                       json={"to": "test@example.com"})
    check(rte.status_code == 400, f"test-email without SMTP returns 400 -> {rte.status_code}")
    check("SMTP" in rte.text or "smtp" in rte.text.lower(), "error message mentions SMTP")
    
    # === TEST 7: Test-email endpoint with SMTP configured (should not block) ===
    print("\n10. TEST: Test-email endpoint with unreachable SMTP (must not block)")
    # Configure unreachable SMTP
    requests.put(f"{BASE}/auth/my-email-settings", headers=h(otok, "regtest"), json={
        "smtp_host": "10.255.255.1", "smtp_port": 587, "smtp_user": "test",
        "smtp_password": "test", "sender_email": "test@regtest.com"})
    
    t0 = time.time()
    rte2 = requests.post(f"{BASE}/auth/my-email-settings/test", headers=h(otok, "regtest"),
                        json={"to": "test@example.com"}, timeout=15)
    elapsed = round(time.time() - t0, 2)
    # Should fail but NOT hang
    check(rte2.status_code in (400, 500), f"test-email with bad SMTP fails gracefully -> {rte2.status_code}")
    check(elapsed < 15, f"test-email does not hang ({elapsed}s < 15s)")
    
    # === TEST 8: Booking with SMTP configured but unreachable (performance check) ===
    print("\n11. TEST: Booking with unreachable SMTP (performance)")
    # Enable notifications
    requests.put(f"{BASE}/settings", headers=h(otok, "regtest"), json={
        "business_email": "shop@regtest.com", "notify_customer_on_booking": True,
        "notify_shop_on_booking": True})
    
    slots4 = requests.get(f"{BASE}/public/slots?shop_id={shop['id']}&date={d}&duration={atype['duration']}",
                         headers=h(tenant="regtest")).json()
    t0 = time.time()
    rb3 = requests.post(f"{BASE}/public/bookings", headers=h(tenant="regtest"), json={
        "shop_id": shop["id"], "appointment_type_id": atype["id"], "date": d,
        "start_time": slots4["slots"][-1], "customer_name": "Test Customer 3",
        "customer_email": "test3@example.com", "customer_phone": "0702"}, timeout=10)
    elapsed = round(time.time() - t0, 2)
    check(rb3.status_code == 200, f"booking with unreachable SMTP -> {rb3.status_code}")
    check(elapsed < 3, f"booking FAST with unreachable SMTP ({elapsed}s < 3s) - NON-BLOCKING ✅")
    
    # Cleanup
    print("\n12. Cleanup")
    requests.delete(f"{BASE}/platform/tenants/{tenant['id']}", headers=h(ptok))
    
    print(f"\n{'='*60}")
    print(f"RESULT: {passed} passed, {failed} failed")
    print(f"{'='*60}\n")
    
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
