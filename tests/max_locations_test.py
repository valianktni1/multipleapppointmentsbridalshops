"""
Backend API tests for max_locations (shop allowance cap) feature.
Tests tenant creation with location limits, enforcement, and allowance changes.
"""
import sys
import requests

BASE_URL = "https://content-formatter-17.preview.emergentagent.com/api"
PLATFORM_EMAIL = "admin@ivory-digital.uk"
PLATFORM_PW = "IvoryAdmin2025!"

passed = 0
failed = 0
created_tenants = []


def check(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✅ PASS: {msg}")
    else:
        failed += 1
        print(f"  ❌ FAIL: {msg}")
    return cond


def h(token=None, tenant=None):
    hd = {"Content-Type": "application/json"}
    if token:
        hd["Authorization"] = f"Bearer {token}"
    if tenant:
        hd["X-Tenant"] = tenant
    return hd


def cleanup(ptok):
    """Delete all test tenants created during this run"""
    print("\n=== Cleanup ===")
    for tid in created_tenants:
        try:
            r = requests.delete(f"{BASE_URL}/platform/tenants/{tid}", headers=h(ptok))
            if r.status_code == 200:
                print(f"  🗑️  Deleted test tenant {tid}")
        except Exception as e:
            print(f"  ⚠️  Could not delete {tid}: {e}")


def main():
    print("\n=== Backend API Tests - max_locations Feature ===\n")
    
    # Platform login
    print("1. Platform login")
    r = requests.post(f"{BASE_URL}/platform/login", json={"email": PLATFORM_EMAIL, "password": PLATFORM_PW})
    if not check(r.status_code == 200, f"platform login -> {r.status_code}"):
        print(f"❌ Cannot proceed without platform access. Response: {r.text}")
        sys.exit(1)
    ptok = r.json()["access_token"]
    
    # TEST 1: Create tenant with locations=1, verify max_locations=1 and 1 shop seeded
    print("\n2. TEST: Create tenant with locations=1")
    slug1 = "cap1test"
    r = requests.post(f"{BASE_URL}/platform/tenants", headers=h(ptok), json={
        "name": "Cap Test 1", "slug": slug1, "owner_email": f"owner@{slug1}.com",
        "owner_password": "test123456", "locations": 1, "trial_days": 7
    })
    if not check(r.status_code == 200, f"create tenant with locations=1 -> {r.status_code}"):
        print(f"   Response: {r.text}")
        cleanup(ptok)
        sys.exit(1)
    
    t1 = r.json()
    created_tenants.append(t1["id"])
    check(t1.get("max_locations") == 1, f"max_locations=1 (got {t1.get('max_locations')})")
    check(t1.get("locations_count") == 1, f"seeded 1 shop (got {t1.get('locations_count')})")
    
    # Login as owner
    print("\n3. Login as tenant owner (cap1test)")
    r = requests.post(f"{BASE_URL}/auth/login", headers=h(tenant=slug1),
                     json={"email": f"owner@{slug1}.com", "password": "test123456"})
    if not check(r.status_code == 200, f"owner login -> {r.status_code}"):
        print(f"   Response: {r.text}")
        cleanup(ptok)
        sys.exit(1)
    otok1 = r.json()["access_token"]
    
    # Verify 1 shop exists
    r = requests.get(f"{BASE_URL}/shops", headers=h(otok1, slug1))
    shops = r.json()
    check(len(shops) == 1, f"GET /shops returns 1 shop (got {len(shops)})")
    
    # TEST 2: Try to add 2nd shop -> must be 403
    print("\n4. TEST: Try to add 2nd shop (should be 403 - at cap)")
    r = requests.post(f"{BASE_URL}/shops", headers=h(otok1, slug1), json={
        "name": "Second Shop", "role_label": "Dresses", "address": "123 Test St"
    })
    check(r.status_code == 403, f"POST /shops at cap -> {r.status_code} (expected 403)")
    if r.status_code == 403:
        msg = r.json().get("detail", "")
        check("1 shop" in msg.lower() and "contact" in msg.lower(), 
              f"error message mentions limit: '{msg}'")
    
    # TEST 3: Raise allowance to 2
    print("\n5. TEST: Platform raises allowance to 2")
    r = requests.patch(f"{BASE_URL}/platform/tenants/{t1['id']}", headers=h(ptok),
                      json={"max_locations": 2})
    if not check(r.status_code == 200, f"PATCH max_locations=2 -> {r.status_code}"):
        print(f"   Response: {r.text}")
    else:
        updated = r.json()
        check(updated.get("max_locations") == 2, f"max_locations updated to 2 (got {updated.get('max_locations')})")
    
    # TEST 4: Now add 2nd shop -> should succeed
    print("\n6. TEST: Add 2nd shop (should succeed now)")
    r = requests.post(f"{BASE_URL}/shops", headers=h(otok1, slug1), json={
        "name": "Second Shop", "role_label": "Dresses", "address": "123 Test St"
    })
    if not check(r.status_code == 200, f"POST /shops after raising cap -> {r.status_code}"):
        print(f"   Response: {r.text}")
    
    r = requests.get(f"{BASE_URL}/shops", headers=h(otok1, slug1))
    shops = r.json()
    check(len(shops) == 2, f"now have 2 shops (got {len(shops)})")
    
    # TEST 5: Try to add 3rd shop -> 403 (over cap of 2)
    print("\n7. TEST: Try to add 3rd shop (should be 403 - at new cap of 2)")
    r = requests.post(f"{BASE_URL}/shops", headers=h(otok1, slug1), json={
        "name": "Third Shop", "role_label": "Dresses"
    })
    check(r.status_code == 403, f"POST /shops at cap of 2 -> {r.status_code} (expected 403)")
    if r.status_code == 403:
        msg = r.json().get("detail", "")
        check("2 shops" in msg.lower(), f"error message mentions 2 shops: '{msg}'")
    
    # TEST 6: Try to lower allowance below current count -> 400
    print("\n8. TEST: Try to set allowance to 1 when tenant has 2 shops (should be 400)")
    r = requests.patch(f"{BASE_URL}/platform/tenants/{t1['id']}", headers=h(ptok),
                      json={"max_locations": 1})
    check(r.status_code == 400, f"PATCH max_locations=1 with 2 shops -> {r.status_code} (expected 400)")
    if r.status_code == 400:
        msg = r.json().get("detail", "")
        check("already has 2 shops" in msg.lower() or "at least 2" in msg.lower(),
              f"error mentions current shop count: '{msg}'")
    
    # TEST 7: Validation - out of range (0 and 51)
    print("\n9. TEST: Allowance validation (0 and 51 should be 400)")
    r = requests.patch(f"{BASE_URL}/platform/tenants/{t1['id']}", headers=h(ptok),
                      json={"max_locations": 0})
    check(r.status_code == 400, f"max_locations=0 -> {r.status_code} (expected 400)")
    
    r = requests.patch(f"{BASE_URL}/platform/tenants/{t1['id']}", headers=h(ptok),
                      json={"max_locations": 51})
    check(r.status_code == 400, f"max_locations=51 -> {r.status_code} (expected 400)")
    
    # TEST 8: Create tenant with locations=2 -> seeds 2 shops
    print("\n10. TEST: Create tenant with locations=2 (should seed 2 shops)")
    slug2 = "cap2test"
    r = requests.post(f"{BASE_URL}/platform/tenants", headers=h(ptok), json={
        "name": "Cap Test 2", "slug": slug2, "owner_email": f"owner@{slug2}.com",
        "owner_password": "test123456", "locations": 2, "trial_days": 7
    })
    if not check(r.status_code == 200, f"create tenant with locations=2 -> {r.status_code}"):
        print(f"   Response: {r.text}")
    else:
        t2 = r.json()
        created_tenants.append(t2["id"])
        check(t2.get("max_locations") == 2, f"max_locations=2 (got {t2.get('max_locations')})")
        check(t2.get("locations_count") == 2, f"seeded 2 shops (got {t2.get('locations_count')})")
        
        # Login and verify 2 shops with availability + appointment types
        r = requests.post(f"{BASE_URL}/auth/login", headers=h(tenant=slug2),
                         json={"email": f"owner@{slug2}.com", "password": "test123456"})
        if r.status_code == 200:
            otok2 = r.json()["access_token"]
            r = requests.get(f"{BASE_URL}/shops", headers=h(otok2, slug2))
            shops = r.json()
            check(len(shops) == 2, f"GET /shops returns 2 shops (got {len(shops)})")
            
            # Check each shop has availability and appointment types
            for shop in shops:
                r = requests.get(f"{BASE_URL}/shops/{shop['id']}/availability", headers=h(tenant=slug2))
                check(r.status_code == 200, f"shop {shop['name']} has availability")
                
                r = requests.get(f"{BASE_URL}/shops/{shop['id']}/appointment-types", headers=h(tenant=slug2))
                types = r.json()
                check(len(types) > 0, f"shop {shop['name']} has appointment types ({len(types)})")
    
    # TEST 9: Verify superbrides is at cap (2/2)
    print("\n11. TEST: Verify superbrides tenant is at 2/2 cap")
    r = requests.get(f"{BASE_URL}/platform/tenants", headers=h(ptok))
    tenants = r.json()
    superbrides = next((t for t in tenants if t["slug"] == "superbrides"), None)
    if superbrides:
        check(superbrides.get("max_locations") == 2, f"superbrides max_locations=2 (got {superbrides.get('max_locations')})")
        check(superbrides.get("locations_count") == 2, f"superbrides has 2 shops (got {superbrides.get('locations_count')})")
    else:
        print("  ⚠️  superbrides tenant not found (may not exist yet)")
    
    # Cleanup
    cleanup(ptok)
    
    # Summary
    print(f"\n{'='*60}")
    print(f"BACKEND TESTS COMPLETE: {passed} passed, {failed} failed")
    print(f"{'='*60}\n")
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
