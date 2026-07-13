"""
Phase 1 POC — Multi-tenant isolation + platform + trial gating.
Proves: platform can create/manage tenants; per-tenant seed; ABSOLUTE data isolation
(Tenant A can never read/write Tenant B); suspend/expire gating; extend re-enables.
Run: python /app/tests/poc_isolation.py
"""
import sys
import requests
from datetime import date, timedelta

BASE = "http://localhost:8001/api"
PLATFORM_EMAIL = "admin@ivory-digital.uk"
PLATFORM_PW = "IvoryAdmin2025!"

ok = 0
fail = 0


def check(cond, msg):
    global ok, fail
    if cond:
        ok += 1
        print(f"  PASS: {msg}")
    else:
        fail += 1
        print(f"  ****FAIL: {msg}")


def h(token=None, tenant=None):
    hd = {"Content-Type": "application/json"}
    if token:
        hd["Authorization"] = f"Bearer {token}"
    if tenant:
        hd["X-Tenant"] = tenant
    return hd


def next_open_date():
    # default seed hours: open Tue(1)-Sat(5) [weekday Mon=0]. Pick next Wednesday.
    d = date.today() + timedelta(days=1)
    while d.weekday() != 2:  # Wednesday
        d += timedelta(days=1)
    return d.isoformat()


def main():
    print("\n=== 1. Platform login ===")
    r = requests.post(f"{BASE}/platform/login", json={"email": PLATFORM_EMAIL, "password": PLATFORM_PW})
    check(r.status_code == 200, f"platform login -> {r.status_code}")
    ptok = r.json().get("access_token")
    check(bool(ptok), "platform token received")

    # cleanup previous test tenants
    tl = requests.get(f"{BASE}/platform/tenants", headers=h(ptok)).json()
    for t in tl:
        if t["slug"] in ("alpha", "beta"):
            requests.delete(f"{BASE}/platform/tenants/{t['id']}", headers=h(ptok))

    print("\n=== 2. Create tenants A(alpha) and B(beta) ===")
    ra = requests.post(f"{BASE}/platform/tenants", headers=h(ptok), json={
        "name": "Alpha Bridal", "slug": "alpha", "owner_email": "owner@alpha.com",
        "owner_password": "alphapass1", "owner_name": "Alpha Owner", "locations": 2})
    rb = requests.post(f"{BASE}/platform/tenants", headers=h(ptok), json={
        "name": "Beta Bridal", "slug": "beta", "owner_email": "owner@beta.com",
        "owner_password": "betapass1", "owner_name": "Beta Owner", "locations": 1})
    check(ra.status_code == 200, f"create A -> {ra.status_code} {ra.text[:120]}")
    check(rb.status_code == 200, f"create B -> {rb.status_code} {rb.text[:120]}")
    A, B = ra.json(), rb.json()
    check(A["locations_count"] == 2, f"A seeded 2 locations (got {A.get('locations_count')})")
    check(B["locations_count"] == 1, f"B seeded 1 location (got {B.get('locations_count')})")
    check(A["status"] == "trial" and A["trial_days_remaining"] in (7, 6), f"A on 7-day trial (days={A.get('trial_days_remaining')})")

    print("\n=== 3. Duplicate slug rejected ===")
    rdup = requests.post(f"{BASE}/platform/tenants", headers=h(ptok), json={
        "name": "Alpha2", "slug": "alpha", "owner_email": "x@x.com", "owner_password": "xxxxxx"})
    check(rdup.status_code == 400, f"duplicate slug rejected -> {rdup.status_code}")

    print("\n=== 4. Public shop lists are tenant-scoped ===")
    sa = requests.get(f"{BASE}/shops", headers=h(tenant="alpha")).json()
    sb = requests.get(f"{BASE}/shops", headers=h(tenant="beta")).json()
    check(len(sa) == 2, f"alpha public shops == 2 (got {len(sa)})")
    check(len(sb) == 1, f"beta public shops == 1 (got {len(sb)})")
    a_shop_ids = {s["id"] for s in sa}
    b_shop_ids = {s["id"] for s in sb}
    check(a_shop_ids.isdisjoint(b_shop_ids), "alpha & beta shop ids disjoint")

    # ?tenant= query fallback works
    sa_q = requests.get(f"{BASE}/shops?tenant=alpha").json()
    check(len(sa_q) == 2, f"?tenant= query fallback works (got {len(sa_q)})")

    print("\n=== 5. Cross-tenant public read blocked ===")
    a_shop = sa[0]["id"]
    b_shop = sb[0]["id"]
    cross = requests.get(f"{BASE}/shops/{b_shop}", headers=h(tenant="alpha"))
    check(cross.status_code == 404, f"alpha cannot read beta shop -> {cross.status_code}")

    print("\n=== 6. Tenant admin logins are tenant-scoped ===")
    la = requests.post(f"{BASE}/auth/login", headers=h(tenant="alpha"), json={"email": "owner@alpha.com", "password": "alphapass1"})
    lb = requests.post(f"{BASE}/auth/login", headers=h(tenant="beta"), json={"email": "owner@beta.com", "password": "betapass1"})
    check(la.status_code == 200, f"alpha owner login -> {la.status_code}")
    check(lb.status_code == 200, f"beta owner login -> {lb.status_code}")
    atok = la.json()["access_token"]
    btok = lb.json()["access_token"]
    # alpha owner cannot log in on beta tenant context
    wrong = requests.post(f"{BASE}/auth/login", headers=h(tenant="beta"), json={"email": "owner@alpha.com", "password": "alphapass1"})
    check(wrong.status_code == 401, f"alpha owner cannot login under beta context -> {wrong.status_code}")

    print("\n=== 7. Create public bookings in each tenant ===")
    d = next_open_date()
    types_a = requests.get(f"{BASE}/shops/{a_shop}/appointment-types", headers=h(tenant="alpha")).json()
    slots_a = requests.get(f"{BASE}/public/slots?shop_id={a_shop}&date={d}&duration={types_a[0]['duration']}", headers=h(tenant="alpha")).json()
    check(len(slots_a.get("slots", [])) > 0, f"alpha slots available on {d} (got {len(slots_a.get('slots', []))})")
    ba = requests.post(f"{BASE}/public/bookings", headers=h(tenant="alpha"), json={
        "shop_id": a_shop, "appointment_type_id": types_a[0]["id"], "date": d, "start_time": slots_a["slots"][0],
        "customer_name": "Alice A", "customer_email": "alice@a.com", "customer_phone": "0700"})
    check(ba.status_code == 200, f"alpha booking created -> {ba.status_code} {ba.text[:120]}")
    a_booking = ba.json()

    types_b = requests.get(f"{BASE}/shops/{b_shop}/appointment-types", headers=h(tenant="beta")).json()
    slots_b = requests.get(f"{BASE}/public/slots?shop_id={b_shop}&date={d}&duration={types_b[0]['duration']}", headers=h(tenant="beta")).json()
    bb = requests.post(f"{BASE}/public/bookings", headers=h(tenant="beta"), json={
        "shop_id": b_shop, "appointment_type_id": types_b[0]["id"], "date": d, "start_time": slots_b["slots"][0],
        "customer_name": "Bob B", "customer_email": "bob@b.com", "customer_phone": "0800"})
    check(bb.status_code == 200, f"beta booking created -> {bb.status_code}")
    b_booking = bb.json()

    print("\n=== 8. Admin booking lists isolated ===")
    a_bookings = requests.get(f"{BASE}/bookings", headers=h(atok, "alpha")).json()
    b_bookings = requests.get(f"{BASE}/bookings", headers=h(btok, "beta")).json()
    a_refs = {x["reference"] for x in a_bookings}
    b_refs = {x["reference"] for x in b_bookings}
    check(a_booking["reference"] in a_refs, "alpha sees its own booking")
    check(b_booking["reference"] not in a_refs, "alpha does NOT see beta booking")
    check(b_booking["reference"] in b_refs, "beta sees its own booking")
    check(a_booking["reference"] not in b_refs, "beta does NOT see alpha booking")

    print("\n=== 9. Cross-tenant write blocked ===")
    xw = requests.patch(f"{BASE}/bookings/{b_booking['id']}", headers=h(atok, "alpha"), json={"status": "confirmed"})
    check(xw.status_code == 404, f"alpha cannot modify beta booking -> {xw.status_code}")
    # alpha can modify its own
    ow = requests.patch(f"{BASE}/bookings/{a_booking['id']}", headers=h(atok, "alpha"), json={"status": "confirmed"})
    check(ow.status_code == 200, f"alpha can modify own booking -> {ow.status_code}")
    # cross-tenant public read by reference blocked
    xref = requests.get(f"{BASE}/public/bookings/{b_booking['reference']}", headers=h(tenant="alpha"))
    check(xref.status_code == 404, f"alpha cannot read beta booking by reference -> {xref.status_code}")

    print("\n=== 10. Suspend gating ===")
    requests.post(f"{BASE}/platform/tenants/{B['id']}/suspend", headers=h(ptok))
    sus_pub = requests.post(f"{BASE}/public/bookings", headers=h(tenant="beta"), json={
        "shop_id": b_shop, "appointment_type_id": types_b[0]["id"], "date": d, "start_time": slots_b["slots"][-1],
        "customer_name": "X", "customer_email": "x@x.com", "customer_phone": "0"})
    check(sus_pub.status_code == 403, f"suspended tenant public booking blocked -> {sus_pub.status_code}")
    sus_write = requests.patch(f"{BASE}/bookings/{b_booking['id']}", headers=h(btok, "beta"), json={"status": "confirmed"})
    check(sus_write.status_code == 403, f"suspended tenant admin write blocked -> {sus_write.status_code}")
    ctx = requests.get(f"{BASE}/tenant/context", headers=h(tenant="beta")).json()
    check(ctx["status"] == "suspended", f"context reports suspended -> {ctx.get('status')}")
    requests.post(f"{BASE}/platform/tenants/{B['id']}/unsuspend", headers=h(ptok))

    print("\n=== 11. Expiry gating + extend re-enables ===")
    requests.patch(f"{BASE}/platform/tenants/{B['id']}", headers=h(ptok), json={"status": "expired"})
    exp_write = requests.patch(f"{BASE}/bookings/{b_booking['id']}", headers=h(btok, "beta"), json={"status": "confirmed"})
    check(exp_write.status_code == 403, f"expired tenant write blocked -> {exp_write.status_code}")
    exp_read = requests.get(f"{BASE}/bookings", headers=h(btok, "beta"))
    check(exp_read.status_code == 200, f"expired tenant can still READ -> {exp_read.status_code}")
    requests.post(f"{BASE}/platform/tenants/{B['id']}/extend-trial", headers=h(ptok), json={"days": 7})
    re_write = requests.patch(f"{BASE}/bookings/{b_booking['id']}", headers=h(btok, "beta"), json={"status": "confirmed"})
    check(re_write.status_code == 200, f"after extend, write re-enabled -> {re_write.status_code}")

    print("\n=== 12. Convert to active + platform stats ===")
    requests.post(f"{BASE}/platform/tenants/{A['id']}/convert-active", headers=h(ptok))
    stats = requests.get(f"{BASE}/platform/stats", headers=h(ptok)).json()
    check(stats.get("active", 0) >= 1, f"platform stats shows active tenant (active={stats.get('active')})")
    check(stats.get("total", 0) >= 2, f"platform stats total >= 2 (total={stats.get('total')})")

    print("\n=== 13. Impersonation ===")
    imp = requests.post(f"{BASE}/platform/tenants/{A['id']}/impersonate", headers=h(ptok))
    check(imp.status_code == 200 and imp.json().get("access_token"), f"impersonate returns tenant token -> {imp.status_code}")

    print(f"\n=========== RESULT: {ok} passed, {fail} failed ===========")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    main()
