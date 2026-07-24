"""
Comprehensive backend API test for multi-tenant SaaS booking platform.
Tests: platform APIs, tenant isolation, trial gating, public booking flow, admin operations.
"""
import sys
import requests
from datetime import date, timedelta

BASE = "https://content-formatter-17.preview.emergentagent.com/api"
PLATFORM_EMAIL = "admin@ivory-digital.uk"
PLATFORM_PW = "IvoryAdmin2025!"

# Test counters
tests_run = 0
tests_passed = 0
tests_failed = 0
failed_tests = []


def test(name, condition, details=""):
    """Record test result"""
    global tests_run, tests_passed, tests_failed, failed_tests
    tests_run += 1
    if condition:
        tests_passed += 1
        print(f"  ✅ PASS: {name}")
        if details:
            print(f"      {details}")
    else:
        tests_failed += 1
        failed_tests.append({"name": name, "details": details})
        print(f"  ❌ FAIL: {name}")
        if details:
            print(f"      {details}")


def h(token=None, tenant=None):
    """Build headers"""
    hd = {"Content-Type": "application/json"}
    if token:
        hd["Authorization"] = f"Bearer {token}"
    if tenant:
        hd["X-Tenant"] = tenant
    return hd


def next_open_date():
    """Get next Wednesday (default seed hours: Tue-Sat open)"""
    d = date.today() + timedelta(days=1)
    while d.weekday() != 2:  # Wednesday
        d += timedelta(days=1)
    return d.isoformat()


def main():
    print("\n" + "="*70)
    print("MULTI-TENANT SAAS BOOKING PLATFORM - BACKEND API TEST")
    print("="*70)

    # ========== 1. PLATFORM LOGIN ==========
    print("\n[1] PLATFORM LOGIN & ME")
    try:
        r = requests.post(f"{BASE}/platform/login", json={"email": PLATFORM_EMAIL, "password": PLATFORM_PW}, timeout=10)
        test("Platform login status", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            ptok = r.json().get("access_token")
            test("Platform token received", bool(ptok), f"Token: {ptok[:20] if ptok else 'None'}...")
        else:
            print(f"      Response: {r.text[:200]}")
            print("\n❌ CRITICAL: Platform login failed. Cannot proceed.")
            return
    except Exception as e:
        test("Platform login", False, f"Exception: {e}")
        print("\n❌ CRITICAL: Platform login failed. Cannot proceed.")
        return

    # Test /platform/me
    try:
        r = requests.get(f"{BASE}/platform/me", headers=h(ptok), timeout=10)
        test("GET /platform/me", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            user = r.json()
            test("Platform user email", user.get("email") == PLATFORM_EMAIL, f"Email: {user.get('email')}")
    except Exception as e:
        test("GET /platform/me", False, f"Exception: {e}")

    # ========== 2. PLATFORM STATS & TENANTS ==========
    print("\n[2] PLATFORM STATS & TENANT LIST")
    try:
        r = requests.get(f"{BASE}/platform/stats", headers=h(ptok), timeout=10)
        test("GET /platform/stats", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            stats = r.json()
            test("Stats has total", "total" in stats, f"Stats: {stats}")
    except Exception as e:
        test("GET /platform/stats", False, f"Exception: {e}")

    try:
        r = requests.get(f"{BASE}/platform/tenants", headers=h(ptok), timeout=10)
        test("GET /platform/tenants", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            tenants = r.json()
            test("Tenants list is array", isinstance(tenants, list), f"Count: {len(tenants)}")
    except Exception as e:
        test("GET /platform/tenants", False, f"Exception: {e}")

    # ========== 3. CREATE TEST TENANTS ==========
    print("\n[3] CREATE TEST TENANTS (alpha, beta)")
    # Cleanup previous test tenants
    try:
        tl = requests.get(f"{BASE}/platform/tenants", headers=h(ptok), timeout=10).json()
        for t in tl:
            if t["slug"] in ("testalpha", "testbeta"):
                requests.delete(f"{BASE}/platform/tenants/{t['id']}", headers=h(ptok), timeout=10)
    except:
        pass

    # Create tenant A
    try:
        ra = requests.post(f"{BASE}/platform/tenants", headers=h(ptok), json={
            "name": "Test Alpha Bridal", "slug": "testalpha", "owner_email": "owner@testalpha.com",
            "owner_password": "alphapass123", "owner_name": "Alpha Owner", "locations": 2
        }, timeout=10)
        test("Create tenant A (testalpha)", ra.status_code == 200, f"Status: {ra.status_code}, Response: {ra.text[:150]}")
        if ra.status_code == 200:
            tenant_a = ra.json()
            test("Tenant A has 2 locations", tenant_a.get("locations_count") == 2, f"Locations: {tenant_a.get('locations_count')}")
            test("Tenant A status is trial", tenant_a.get("status") == "trial", f"Status: {tenant_a.get('status')}")
        else:
            print("\n❌ CRITICAL: Cannot create tenant A. Stopping.")
            return
    except Exception as e:
        test("Create tenant A", False, f"Exception: {e}")
        print("\n❌ CRITICAL: Cannot create tenant A. Stopping.")
        return

    # Create tenant B
    try:
        rb = requests.post(f"{BASE}/platform/tenants", headers=h(ptok), json={
            "name": "Test Beta Bridal", "slug": "testbeta", "owner_email": "owner@testbeta.com",
            "owner_password": "betapass123", "owner_name": "Beta Owner", "locations": 1
        }, timeout=10)
        test("Create tenant B (testbeta)", rb.status_code == 200, f"Status: {rb.status_code}")
        if rb.status_code == 200:
            tenant_b = rb.json()
            test("Tenant B has 1 location", tenant_b.get("locations_count") == 1, f"Locations: {tenant_b.get('locations_count')}")
        else:
            print("\n❌ CRITICAL: Cannot create tenant B. Stopping.")
            return
    except Exception as e:
        test("Create tenant B", False, f"Exception: {e}")
        print("\n❌ CRITICAL: Cannot create tenant B. Stopping.")
        return

    # Test duplicate slug rejection
    try:
        rdup = requests.post(f"{BASE}/platform/tenants", headers=h(ptok), json={
            "name": "Duplicate", "slug": "testalpha", "owner_email": "dup@test.com", "owner_password": "pass123"
        }, timeout=10)
        test("Duplicate slug rejected", rdup.status_code == 400, f"Status: {rdup.status_code}")
    except Exception as e:
        test("Duplicate slug rejected", False, f"Exception: {e}")

    # ========== 4. TENANT RESOLUTION ==========
    print("\n[4] TENANT RESOLUTION (X-Tenant header)")
    try:
        r = requests.get(f"{BASE}/tenant/context", headers={"X-Tenant": "testalpha"}, timeout=10)
        test("GET /tenant/context with X-Tenant", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            ctx = r.json()
            test("Context slug matches", ctx.get("slug") == "testalpha", f"Slug: {ctx.get('slug')}")
    except Exception as e:
        test("GET /tenant/context", False, f"Exception: {e}")

    # Test missing tenant
    try:
        r = requests.get(f"{BASE}/tenant/context", timeout=10)
        test("Missing tenant returns 400", r.status_code == 400, f"Status: {r.status_code}")
    except Exception as e:
        test("Missing tenant returns 400", False, f"Exception: {e}")

    # Test unknown tenant
    try:
        r = requests.get(f"{BASE}/tenant/context", headers={"X-Tenant": "nonexistent"}, timeout=10)
        test("Unknown tenant returns 404", r.status_code == 404, f"Status: {r.status_code}")
    except Exception as e:
        test("Unknown tenant returns 404", False, f"Exception: {e}")

    # ========== 5. TENANT AUTH ==========
    print("\n[5] TENANT AUTH (login with X-Tenant)")
    try:
        la = requests.post(f"{BASE}/auth/login", headers={"X-Tenant": "testalpha"}, json={
            "email": "owner@testalpha.com", "password": "alphapass123"
        }, timeout=10)
        test("Tenant A login", la.status_code == 200, f"Status: {la.status_code}")
        if la.status_code == 200:
            atok = la.json().get("access_token")
            test("Tenant A token received", bool(atok), f"Token: {atok[:20] if atok else 'None'}...")
        else:
            print("\n❌ CRITICAL: Tenant A login failed. Stopping.")
            return
    except Exception as e:
        test("Tenant A login", False, f"Exception: {e}")
        print("\n❌ CRITICAL: Tenant A login failed. Stopping.")
        return

    try:
        lb = requests.post(f"{BASE}/auth/login", headers={"X-Tenant": "testbeta"}, json={
            "email": "owner@testbeta.com", "password": "betapass123"
        }, timeout=10)
        test("Tenant B login", lb.status_code == 200, f"Status: {lb.status_code}")
        if lb.status_code == 200:
            btok = lb.json().get("access_token")
            test("Tenant B token received", bool(btok))
        else:
            print("\n❌ CRITICAL: Tenant B login failed. Stopping.")
            return
    except Exception as e:
        test("Tenant B login", False, f"Exception: {e}")
        print("\n❌ CRITICAL: Tenant B login failed. Stopping.")
        return

    # Test wrong tenant context login
    try:
        wrong = requests.post(f"{BASE}/auth/login", headers={"X-Tenant": "testbeta"}, json={
            "email": "owner@testalpha.com", "password": "alphapass123"
        }, timeout=10)
        test("Wrong tenant context login fails", wrong.status_code == 401, f"Status: {wrong.status_code}")
    except Exception as e:
        test("Wrong tenant context login fails", False, f"Exception: {e}")

    # Test /auth/me
    try:
        r = requests.get(f"{BASE}/auth/me", headers=h(atok, "testalpha"), timeout=10)
        test("GET /auth/me", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            me = r.json()
            test("Me has tenant object", "tenant" in me, f"Keys: {me.keys()}")
            test("Tenant status in me", me.get("tenant", {}).get("status") == "trial", f"Status: {me.get('tenant', {}).get('status')}")
    except Exception as e:
        test("GET /auth/me", False, f"Exception: {e}")

    # ========== 6. TENANT ISOLATION - SHOPS ==========
    print("\n[6] TENANT ISOLATION - SHOPS")
    try:
        sa = requests.get(f"{BASE}/shops", headers={"X-Tenant": "testalpha"}, timeout=10).json()
        sb = requests.get(f"{BASE}/shops", headers={"X-Tenant": "testbeta"}, timeout=10).json()
        test("Tenant A has 2 shops", len(sa) == 2, f"Count: {len(sa)}")
        test("Tenant B has 1 shop", len(sb) == 1, f"Count: {len(sb)}")
        
        a_shop_ids = {s["id"] for s in sa}
        b_shop_ids = {s["id"] for s in sb}
        test("Shop IDs are disjoint", a_shop_ids.isdisjoint(b_shop_ids), f"A: {a_shop_ids}, B: {b_shop_ids}")
        
        # Cross-tenant shop read
        if sa and sb:
            a_shop = sa[0]["id"]
            b_shop = sb[0]["id"]
            cross = requests.get(f"{BASE}/shops/{b_shop}", headers={"X-Tenant": "testalpha"}, timeout=10)
            test("Cross-tenant shop read blocked", cross.status_code == 404, f"Status: {cross.status_code}")
    except Exception as e:
        test("Tenant isolation - shops", False, f"Exception: {e}")

    # ========== 7. PUBLIC BOOKING FLOW ==========
    print("\n[7] PUBLIC BOOKING FLOW")
    d = next_open_date()
    try:
        # Get appointment types
        types_a = requests.get(f"{BASE}/shops/{sa[0]['id']}/appointment-types", headers={"X-Tenant": "testalpha"}, timeout=10).json()
        test("Get appointment types", len(types_a) > 0, f"Count: {len(types_a)}")
        
        # Get slots
        if types_a:
            slots_a = requests.get(f"{BASE}/public/slots?shop_id={sa[0]['id']}&date={d}&duration={types_a[0]['duration']}", 
                                  headers={"X-Tenant": "testalpha"}, timeout=10).json()
            test("Get public slots", len(slots_a.get("slots", [])) > 0, f"Date: {d}, Slots: {len(slots_a.get('slots', []))}")
            
            # Create booking
            if slots_a.get("slots"):
                ba = requests.post(f"{BASE}/public/bookings", headers={"X-Tenant": "testalpha"}, json={
                    "shop_id": sa[0]["id"],
                    "appointment_type_id": types_a[0]["id"],
                    "date": d,
                    "start_time": slots_a["slots"][0],
                    "customer_name": "Alice Test",
                    "customer_email": "alice@test.com",
                    "customer_phone": "07001234567",
                    "notes": "Test booking"
                }, timeout=10)
                test("Create public booking", ba.status_code == 200, f"Status: {ba.status_code}")
                if ba.status_code == 200:
                    booking_a = ba.json()
                    test("Booking has reference", bool(booking_a.get("reference")), f"Ref: {booking_a.get('reference')}")
                    
                    # Get booking by reference
                    ref_a = booking_a.get("reference")
                    if ref_a:
                        r = requests.get(f"{BASE}/public/bookings/{ref_a}", headers={"X-Tenant": "testalpha"}, timeout=10)
                        test("Get booking by reference", r.status_code == 200, f"Status: {r.status_code}")
    except Exception as e:
        test("Public booking flow", False, f"Exception: {e}")

    # Create booking for tenant B
    try:
        types_b = requests.get(f"{BASE}/shops/{sb[0]['id']}/appointment-types", headers={"X-Tenant": "testbeta"}, timeout=10).json()
        if types_b:
            slots_b = requests.get(f"{BASE}/public/slots?shop_id={sb[0]['id']}&date={d}&duration={types_b[0]['duration']}", 
                                  headers={"X-Tenant": "testbeta"}, timeout=10).json()
            if slots_b.get("slots"):
                bb = requests.post(f"{BASE}/public/bookings", headers={"X-Tenant": "testbeta"}, json={
                    "shop_id": sb[0]["id"],
                    "appointment_type_id": types_b[0]["id"],
                    "date": d,
                    "start_time": slots_b["slots"][0],
                    "customer_name": "Bob Test",
                    "customer_email": "bob@test.com",
                    "customer_phone": "07009876543"
                }, timeout=10)
                test("Create booking for tenant B", bb.status_code == 200, f"Status: {bb.status_code}")
                if bb.status_code == 200:
                    booking_b = bb.json()
    except Exception as e:
        test("Create booking for tenant B", False, f"Exception: {e}")

    # ========== 8. TENANT ISOLATION - BOOKINGS ==========
    print("\n[8] TENANT ISOLATION - BOOKINGS (CRITICAL)")
    try:
        # Get bookings for each tenant
        bookings_a = requests.get(f"{BASE}/bookings", headers=h(atok, "testalpha"), timeout=10).json()
        bookings_b = requests.get(f"{BASE}/bookings", headers=h(btok, "testbeta"), timeout=10).json()
        
        a_refs = {x["reference"] for x in bookings_a}
        b_refs = {x["reference"] for x in bookings_b}
        
        test("Tenant A sees own booking", booking_a["reference"] in a_refs, f"A refs: {a_refs}")
        test("Tenant A does NOT see B booking", booking_b["reference"] not in a_refs, f"B ref: {booking_b['reference']}")
        test("Tenant B sees own booking", booking_b["reference"] in b_refs, f"B refs: {b_refs}")
        test("Tenant B does NOT see A booking", booking_a["reference"] not in b_refs, f"A ref: {booking_a['reference']}")
        
        # Cross-tenant write
        xw = requests.patch(f"{BASE}/bookings/{booking_b['id']}", headers=h(atok, "testalpha"), 
                           json={"status": "confirmed"}, timeout=10)
        test("Cross-tenant write blocked", xw.status_code == 404, f"Status: {xw.status_code}")
        
        # Own tenant write
        ow = requests.patch(f"{BASE}/bookings/{booking_a['id']}", headers=h(atok, "testalpha"), 
                           json={"status": "confirmed"}, timeout=10)
        test("Own tenant write allowed", ow.status_code == 200, f"Status: {ow.status_code}")
        
        # Cross-tenant public read by reference
        xref = requests.get(f"{BASE}/public/bookings/{booking_b['reference']}", headers={"X-Tenant": "testalpha"}, timeout=10)
        test("Cross-tenant ref read blocked", xref.status_code == 404, f"Status: {xref.status_code}")
    except Exception as e:
        test("Tenant isolation - bookings", False, f"Exception: {e}")

    # ========== 9. TENANT ADMIN OPERATIONS ==========
    print("\n[9] TENANT ADMIN OPERATIONS")
    try:
        # Dashboard stats
        r = requests.get(f"{BASE}/dashboard/stats", headers=h(atok, "testalpha"), timeout=10)
        test("GET /dashboard/stats", r.status_code == 200, f"Status: {r.status_code}")
        
        # Customers
        r = requests.get(f"{BASE}/customers", headers=h(atok, "testalpha"), timeout=10)
        test("GET /customers", r.status_code == 200, f"Status: {r.status_code}")
        
        # Analytics
        r = requests.get(f"{BASE}/analytics", headers=h(atok, "testalpha"), timeout=10)
        test("GET /analytics", r.status_code == 200, f"Status: {r.status_code}")
        
        # Settings
        r = requests.get(f"{BASE}/settings", headers=h(atok, "testalpha"), timeout=10)
        test("GET /settings", r.status_code == 200, f"Status: {r.status_code}")
        
        # Branding
        r = requests.get(f"{BASE}/branding", headers=h(atok, "testalpha"), timeout=10)
        test("GET /branding", r.status_code == 200, f"Status: {r.status_code}")
    except Exception as e:
        test("Tenant admin operations", False, f"Exception: {e}")

    # ========== 10. TRIAL GATING ==========
    print("\n[10] TRIAL GATING (suspend/expire)")
    try:
        # Suspend tenant B
        requests.post(f"{BASE}/platform/tenants/{tenant_b['id']}/suspend", headers=h(ptok), timeout=10)
        
        # Public booking should fail
        sus_pub = requests.post(f"{BASE}/public/bookings", headers={"X-Tenant": "testbeta"}, json={
            "shop_id": sb[0]["id"],
            "appointment_type_id": types_b[0]["id"],
            "date": d,
            "start_time": slots_b["slots"][-1] if slots_b.get("slots") else "10:00",
            "customer_name": "X",
            "customer_email": "x@x.com",
            "customer_phone": "0"
        }, timeout=10)
        test("Suspended: public booking blocked", sus_pub.status_code == 403, f"Status: {sus_pub.status_code}")
        
        # Admin write should fail
        sus_write = requests.patch(f"{BASE}/bookings/{booking_b['id']}", headers=h(btok, "testbeta"), 
                                   json={"status": "confirmed"}, timeout=10)
        test("Suspended: admin write blocked", sus_write.status_code == 403, f"Status: {sus_write.status_code}")
        
        # Context should show suspended
        ctx = requests.get(f"{BASE}/tenant/context", headers={"X-Tenant": "testbeta"}, timeout=10).json()
        test("Context shows suspended", ctx.get("status") == "suspended", f"Status: {ctx.get('status')}")
        
        # Unsuspend
        requests.post(f"{BASE}/platform/tenants/{tenant_b['id']}/unsuspend", headers=h(ptok), timeout=10)
        
        # Expire tenant B
        requests.patch(f"{BASE}/platform/tenants/{tenant_b['id']}", headers=h(ptok), 
                      json={"status": "expired"}, timeout=10)
        
        # Admin write should fail
        exp_write = requests.patch(f"{BASE}/bookings/{booking_b['id']}", headers=h(btok, "testbeta"), 
                                   json={"status": "confirmed"}, timeout=10)
        test("Expired: admin write blocked", exp_write.status_code == 403, f"Status: {exp_write.status_code}")
        
        # Admin read should work
        exp_read = requests.get(f"{BASE}/bookings", headers=h(btok, "testbeta"), timeout=10)
        test("Expired: admin read allowed", exp_read.status_code == 200, f"Status: {exp_read.status_code}")
        
        # Extend trial
        requests.post(f"{BASE}/platform/tenants/{tenant_b['id']}/extend-trial", headers=h(ptok), 
                     json={"days": 7}, timeout=10)
        
        # Write should work again
        re_write = requests.patch(f"{BASE}/bookings/{booking_b['id']}", headers=h(btok, "testbeta"), 
                                 json={"status": "confirmed"}, timeout=10)
        test("After extend: write re-enabled", re_write.status_code == 200, f"Status: {re_write.status_code}")
    except Exception as e:
        test("Trial gating", False, f"Exception: {e}")

    # ========== 11. PLATFORM TENANT ACTIONS ==========
    print("\n[11] PLATFORM TENANT ACTIONS")
    try:
        # Convert to active
        r = requests.post(f"{BASE}/platform/tenants/{tenant_a['id']}/convert-active", headers=h(ptok), timeout=10)
        test("Convert to active", r.status_code == 200, f"Status: {r.status_code}")
        
        # Impersonate
        r = requests.post(f"{BASE}/platform/tenants/{tenant_a['id']}/impersonate", headers=h(ptok), timeout=10)
        test("Impersonate tenant", r.status_code == 200 and r.json().get("access_token"), f"Status: {r.status_code}")
        
        # Reset owner password
        r = requests.post(f"{BASE}/platform/tenants/{tenant_a['id']}/reset-owner-password", headers=h(ptok), 
                         json={"password": "newpass123"}, timeout=10)
        test("Reset owner password", r.status_code == 200, f"Status: {r.status_code}")
    except Exception as e:
        test("Platform tenant actions", False, f"Exception: {e}")

    # ========== 12. FORCE PASSWORD CHANGE ON FIRST LOGIN ==========
    print("\n[12] FORCE PASSWORD CHANGE ON FIRST LOGIN")
    try:
        # Login with flowtest account (must_change_password should be true)
        r = requests.post(f"{BASE}/auth/login", headers={"X-Tenant": "flowtest"}, json={
            "email": "owner@flowtest.com", "password": "TempPass123"
        }, timeout=10)
        test("Flowtest login", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            flowtest_tok = r.json().get("access_token")
            test("Flowtest token received", bool(flowtest_tok))
            
            # Check /auth/me returns must_change_password flag
            r = requests.get(f"{BASE}/auth/me", headers=h(flowtest_tok, "flowtest"), timeout=10)
            test("GET /auth/me for flowtest", r.status_code == 200, f"Status: {r.status_code}")
            if r.status_code == 200:
                me = r.json()
                test("must_change_password is true", me.get("must_change_password") == True, 
                     f"must_change_password: {me.get('must_change_password')}")
            
            # Test write endpoint blocked with 403
            r = requests.post(f"{BASE}/shops", headers=h(flowtest_tok, "flowtest"), json={
                "name": "Test Shop", "address": "123 Test St"
            }, timeout=10)
            test("Write blocked while must_change_password", r.status_code == 403, 
                 f"Status: {r.status_code}, Response: {r.text[:100]}")
            
            # Test set-initial-password: mismatched passwords
            r = requests.post(f"{BASE}/auth/set-initial-password", headers=h(flowtest_tok, "flowtest"), json={
                "new_password": "NewPass123", "confirm_password": "DifferentPass"
            }, timeout=10)
            test("Mismatched passwords rejected", r.status_code == 400, f"Status: {r.status_code}")
            
            # Test set-initial-password: same as temp password
            r = requests.post(f"{BASE}/auth/set-initial-password", headers=h(flowtest_tok, "flowtest"), json={
                "new_password": "TempPass123", "confirm_password": "TempPass123"
            }, timeout=10)
            test("Same as temp password rejected", r.status_code == 400, f"Status: {r.status_code}")
            
            # Test set-initial-password: valid new password
            r = requests.post(f"{BASE}/auth/set-initial-password", headers=h(flowtest_tok, "flowtest"), json={
                "new_password": "MyBrandNew1", "confirm_password": "MyBrandNew1"
            }, timeout=10)
            test("Valid new password accepted", r.status_code == 200, f"Status: {r.status_code}")
            
            # Re-check /auth/me - must_change_password should now be false
            r = requests.get(f"{BASE}/auth/me", headers=h(flowtest_tok, "flowtest"), timeout=10)
            if r.status_code == 200:
                me = r.json()
                test("must_change_password cleared after change", me.get("must_change_password") == False, 
                     f"must_change_password: {me.get('must_change_password')}")
            
            # Test write endpoint now works
            r = requests.post(f"{BASE}/shops", headers=h(flowtest_tok, "flowtest"), json={
                "name": "Test Shop After PW Change", "address": "123 Test St"
            }, timeout=10)
            test("Write allowed after password change", r.status_code == 200, 
                 f"Status: {r.status_code}")
            
            # Re-login with new password
            r = requests.post(f"{BASE}/auth/login", headers={"X-Tenant": "flowtest"}, json={
                "email": "owner@flowtest.com", "password": "MyBrandNew1"
            }, timeout=10)
            test("Re-login with new password", r.status_code == 200, f"Status: {r.status_code}")
            if r.status_code == 200:
                new_tok = r.json().get("access_token")
                r = requests.get(f"{BASE}/auth/me", headers=h(new_tok, "flowtest"), timeout=10)
                if r.status_code == 200:
                    me = r.json()
                    test("No force flag on re-login", me.get("must_change_password") == False, 
                         f"must_change_password: {me.get('must_change_password')}")
        else:
            print("      ⚠️  Flowtest account not available or credentials incorrect")
    except Exception as e:
        test("Force password change flow", False, f"Exception: {e}")

    # ========== SUMMARY ==========
    print("\n" + "="*70)
    print(f"TEST SUMMARY: {tests_passed}/{tests_run} passed, {tests_failed} failed")
    print("="*70)
    
    if tests_failed > 0:
        print("\n❌ FAILED TESTS:")
        for ft in failed_tests:
            print(f"  - {ft['name']}")
            if ft['details']:
                print(f"    {ft['details']}")
    
    success_rate = (tests_passed / tests_run * 100) if tests_run > 0 else 0
    print(f"\nSuccess Rate: {success_rate:.1f}%")
    
    if tests_failed == 0:
        print("\n✅ ALL TESTS PASSED!")
        return 0
    elif tests_failed > tests_run * 0.5:
        print("\n❌ CRITICAL: More than 50% of tests failed!")
        return 2
    else:
        print("\n⚠️  Some tests failed but core functionality works.")
        return 1


if __name__ == "__main__":
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\nTest interrupted by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(2)
