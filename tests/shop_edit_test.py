"""
Backend API tests for shop CRUD operations - focus on EDIT (PATCH) functionality.
Tests: PATCH /api/shops/{id}, POST /api/shops, DELETE /api/shops/{id}, tenant isolation.
"""
import sys
import requests

BASE = "https://content-formatter-17.preview.emergentagent.com/api"
TENANT = "superbrides"
OWNER_EMAIL = "owner@superbrides.co.uk"
OWNER_PW = "super123"

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


def main():
    print("\n=== Backend API Tests - Shop EDIT (PATCH) Functionality ===\n")
    
    # 1. Login as superbrides owner
    print("1. Login as superbrides owner")
    r = requests.post(f"{BASE}/auth/login", headers=h(tenant=TENANT),
                     json={"email": OWNER_EMAIL, "password": OWNER_PW})
    check(r.status_code == 200, f"owner login -> {r.status_code}")
    if r.status_code != 200:
        print(f"  Response: {r.text}")
        sys.exit(1)
    token = r.json()["access_token"]
    
    # 2. GET /api/shops - list existing shops
    print("\n2. GET /api/shops - list existing shops")
    r = requests.get(f"{BASE}/shops", headers=h(token, TENANT))
    check(r.status_code == 200, f"GET /api/shops -> {r.status_code}")
    shops = r.json()
    check(len(shops) > 0, f"at least 1 shop exists ({len(shops)} shops)")
    if len(shops) == 0:
        print("  No shops found, cannot proceed")
        sys.exit(1)
    
    shop = shops[0]
    shop_id = shop["id"]
    original_name = shop.get("name", "")
    print(f"  Original shop: {original_name} (ID: {shop_id})")
    
    # 3. PATCH /api/shops/{shop_id} - update shop details
    print("\n3. PATCH /api/shops/{shop_id} - update shop details")
    updated_data = {
        "name": "Superbrides Manchester Updated",
        "role_label": "Luxury Bridal Boutique",
        "address": "123 Test Street, Manchester, M1 1AA",
        "phone": "0161 123 4567",
        "email": "manchester@superbrides.co.uk",
        "blurb": "Experience luxury bridal shopping in the heart of Manchester.",
        "hours_text": "Mon-Sat 10am-6pm, Sun by appointment"
    }
    r = requests.patch(f"{BASE}/shops/{shop_id}", headers=h(token, TENANT), json=updated_data)
    check(r.status_code == 200, f"PATCH /api/shops/{shop_id} -> {r.status_code}")
    if r.status_code != 200:
        print(f"  Response: {r.text}")
    else:
        updated_shop = r.json()
        check(updated_shop["name"] == updated_data["name"], f"name updated: {updated_shop.get('name')}")
        check(updated_shop["role_label"] == updated_data["role_label"], f"role_label updated: {updated_shop.get('role_label')}")
        check(updated_shop["address"] == updated_data["address"], f"address updated: {updated_shop.get('address')}")
        check(updated_shop["phone"] == updated_data["phone"], f"phone updated: {updated_shop.get('phone')}")
        check(updated_shop["email"] == updated_data["email"], f"email updated: {updated_shop.get('email')}")
        check(updated_shop["blurb"] == updated_data["blurb"], f"blurb updated")
        check(updated_shop["hours_text"] == updated_data["hours_text"], f"hours_text updated")
    
    # 4. GET /api/shops again - verify changes persisted
    print("\n4. GET /api/shops - verify changes persisted")
    r = requests.get(f"{BASE}/shops", headers=h(token, TENANT))
    check(r.status_code == 200, f"GET /api/shops -> {r.status_code}")
    shops = r.json()
    shop = next((s for s in shops if s["id"] == shop_id), None)
    if shop:
        check(shop["name"] == updated_data["name"], f"persisted name: {shop.get('name')}")
        check(shop["address"] == updated_data["address"], f"persisted address: {shop.get('address')}")
    else:
        check(False, "shop not found after update")
    
    # 5. GET /api/shops (public, no auth) - verify public endpoint works
    print("\n5. GET /api/shops (public endpoint, no auth)")
    r = requests.get(f"{BASE}/shops", headers=h(tenant=TENANT))
    check(r.status_code == 200, f"public GET /api/shops -> {r.status_code}")
    public_shops = r.json()
    check(len(public_shops) > 0, f"public endpoint returns shops ({len(public_shops)} shops)")
    public_shop = next((s for s in public_shops if s["id"] == shop_id), None)
    if public_shop:
        check(public_shop["name"] == updated_data["name"], f"public endpoint shows updated name")
        check(public_shop["address"] == updated_data["address"], f"public endpoint shows updated address")
    
    # 6. POST /api/shops - create a new location
    print("\n6. POST /api/shops - create a new location")
    new_shop_data = {
        "name": "Superbrides Liverpool",
        "role_label": "Wedding Dresses",
        "address": "456 Bold Street, Liverpool, L1 4HY",
        "phone": "0151 234 5678",
        "email": "liverpool@superbrides.co.uk",
        "blurb": "Our newest boutique in Liverpool city centre.",
        "hours_text": "Tue-Sat by appointment"
    }
    r = requests.post(f"{BASE}/shops", headers=h(token, TENANT), json=new_shop_data)
    check(r.status_code == 200, f"POST /api/shops -> {r.status_code}")
    if r.status_code != 200:
        print(f"  Response: {r.text}")
    else:
        new_shop = r.json()
        new_shop_id = new_shop["id"]
        check(new_shop["name"] == new_shop_data["name"], f"new shop created: {new_shop.get('name')}")
        print(f"  New shop ID: {new_shop_id}")
    
    # 7. GET /api/shops - verify 2+ locations exist
    print("\n7. GET /api/shops - verify 2+ locations exist")
    r = requests.get(f"{BASE}/shops", headers=h(token, TENANT))
    shops = r.json()
    check(len(shops) >= 2, f"2+ locations exist ({len(shops)} shops)")
    
    # 8. DELETE /api/shops/{id} - delete the new location
    print("\n8. DELETE /api/shops/{id} - delete new location")
    if len(shops) >= 2:
        r = requests.delete(f"{BASE}/shops/{new_shop_id}", headers=h(token, TENANT))
        check(r.status_code == 200, f"DELETE /api/shops/{new_shop_id} -> {r.status_code}")
    
    # 9. DELETE last location - should fail with 400
    print("\n9. DELETE last location - should fail with 400")
    r = requests.get(f"{BASE}/shops", headers=h(token, TENANT))
    shops = r.json()
    if len(shops) == 1:
        r = requests.delete(f"{BASE}/shops/{shops[0]['id']}", headers=h(token, TENANT))
        check(r.status_code == 400, f"DELETE last location blocked -> {r.status_code}")
        check("at least one" in r.text.lower() or "must keep" in r.text.lower(), 
              "error message mentions keeping at least one location")
    else:
        print("  ⚠️  SKIP: more than 1 location exists, cannot test last-location protection")
    
    # 10. Tenant isolation - create another tenant and try to modify superbrides shop
    print("\n10. Tenant isolation - different tenant cannot modify superbrides shops")
    # Login as platform admin
    r = requests.post(f"{BASE}/platform/login", 
                     json={"email": "admin@ivory-digital.uk", "password": "IvoryAdmin2025!"})
    if r.status_code == 200:
        platform_token = r.json()["access_token"]
        
        # Create test tenant
        r = requests.post(f"{BASE}/platform/tenants", headers=h(platform_token), json={
            "name": "Test Tenant", "slug": "testshop", "owner_email": "owner@testshop.com",
            "owner_password": "test123", "locations": 1})
        
        if r.status_code == 200:
            # Login as test tenant owner
            r = requests.post(f"{BASE}/auth/login", headers=h(tenant="testshop"),
                            json={"email": "owner@testshop.com", "password": "test123"})
            if r.status_code == 200:
                test_token = r.json()["access_token"]
                
                # Try to PATCH superbrides shop with testshop token
                r = requests.patch(f"{BASE}/shops/{shop_id}", headers=h(test_token, "testshop"),
                                 json={"name": "Hacked Shop"})
                check(r.status_code == 404, f"different tenant cannot modify superbrides shop -> {r.status_code}")
                
                # Cleanup test tenant
                requests.delete(f"{BASE}/platform/tenants/{r.json().get('id', 'unknown')}", 
                              headers=h(platform_token))
            else:
                print("  ⚠️  SKIP: could not login as test tenant")
        else:
            print("  ⚠️  SKIP: could not create test tenant")
    else:
        print("  ⚠️  SKIP: could not login as platform admin")
    
    print(f"\n{'='*60}")
    print(f"RESULT: {passed} passed, {failed} failed")
    print(f"{'='*60}\n")
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
