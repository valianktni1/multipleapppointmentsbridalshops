"""
Test script for footer credit and logo aspect ratio fixes.
Tests the two user-reported issues that were fixed:
1. Footer credit must be a clickable link to https://ivorydigital.uk and NOT editable by tenant
2. Logo must preserve aspect ratio (not warped/stretched)
"""
import sys
import requests
import base64

BASE = "https://content-formatter-17.preview.emergentagent.com/api"
TENANT_SLUG = "superbrides"
TENANT_EMAIL = "owner@superbrides.co.uk"
TENANT_PW = "super123"

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


def main():
    print("\n" + "="*70)
    print("FOOTER CREDIT & LOGO ASPECT RATIO FIX VERIFICATION")
    print("="*70)

    # ========== 1. TENANT LOGIN ==========
    print("\n[1] TENANT LOGIN (superbrides)")
    try:
        r = requests.post(f"{BASE}/auth/login", headers={"X-Tenant": TENANT_SLUG}, json={
            "email": TENANT_EMAIL, "password": TENANT_PW
        }, timeout=10)
        test("Tenant login", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code != 200:
            print(f"      Response: {r.text[:200]}")
            print("\n❌ CRITICAL: Tenant login failed. Cannot proceed.")
            return 2
        token = r.json().get("access_token")
        test("Token received", bool(token))
    except Exception as e:
        test("Tenant login", False, f"Exception: {e}")
        print("\n❌ CRITICAL: Tenant login failed. Cannot proceed.")
        return 2

    # ========== 2. GET CURRENT BRANDING ==========
    print("\n[2] GET CURRENT BRANDING")
    try:
        r = requests.get(f"{BASE}/branding", headers=h(token, TENANT_SLUG), timeout=10)
        test("GET /branding", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            branding = r.json()
            current_footer = branding.get("footer_credit")
            test("Footer credit exists", current_footer is not None, f"Footer: {current_footer}")
            test("Footer credit is default", current_footer == "Designed & Hosted by IvoryDigital", 
                 f"Footer: {current_footer}")
            print(f"      Current branding: {branding}")
    except Exception as e:
        test("GET /branding", False, f"Exception: {e}")

    # ========== 3. ATTEMPT TO HACK FOOTER CREDIT ==========
    print("\n[3] ATTEMPT TO HACK FOOTER CREDIT (CRITICAL TEST)")
    try:
        # Try to set footer_credit to "HACKED"
        r = requests.put(f"{BASE}/branding", headers=h(token, TENANT_SLUG), json={
            "footer_credit": "HACKED"
        }, timeout=10)
        test("PUT /branding with footer_credit", r.status_code == 200, f"Status: {r.status_code}")
        
        if r.status_code == 200:
            result = r.json()
            returned_footer = result.get("footer_credit")
            test("Backend IGNORES footer_credit hack", 
                 returned_footer == "Designed & Hosted by IvoryDigital",
                 f"Returned footer: {returned_footer}")
            test("Footer NOT set to HACKED", 
                 returned_footer != "HACKED",
                 f"Footer: {returned_footer}")
    except Exception as e:
        test("Footer credit hack prevention", False, f"Exception: {e}")

    # ========== 4. VERIFY FOOTER CREDIT PERSISTS ==========
    print("\n[4] VERIFY FOOTER CREDIT PERSISTS")
    try:
        r = requests.get(f"{BASE}/branding", headers=h(token, TENANT_SLUG), timeout=10)
        if r.status_code == 200:
            branding = r.json()
            footer = branding.get("footer_credit")
            test("Footer still default after hack attempt", 
                 footer == "Designed & Hosted by IvoryDigital",
                 f"Footer: {footer}")
    except Exception as e:
        test("Footer persistence check", False, f"Exception: {e}")

    # ========== 5. VERIFY TENANT CONTEXT FOOTER ==========
    print("\n[5] VERIFY TENANT CONTEXT (public API)")
    try:
        r = requests.get(f"{BASE}/tenant/context", headers={"X-Tenant": TENANT_SLUG}, timeout=10)
        test("GET /tenant/context", r.status_code == 200, f"Status: {r.status_code}")
        if r.status_code == 200:
            ctx = r.json()
            footer = ctx.get("branding", {}).get("footer_credit")
            test("Public context has correct footer", 
                 footer == "Designed & Hosted by IvoryDigital",
                 f"Footer: {footer}")
    except Exception as e:
        test("Tenant context check", False, f"Exception: {e}")

    # ========== 6. TEST LOGO UPLOAD (WIDE LOGO) ==========
    print("\n[6] TEST LOGO UPLOAD (wide logo for aspect ratio test)")
    try:
        # Create a simple wide PNG data URL (300x80 pixels - clearly non-square)
        # This is a minimal PNG data URL for testing
        wide_logo_data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAABQCAYAAACRHJGbAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEgAACxIB0t1+/AAAABx0RVh0U29mdHdhcmUAQWRvYmUgRmlyZXdvcmtzIENTNui8sowAAAAWdEVYdENyZWF0aW9uIFRpbWUAMDEvMTAvMTNJ0+T6AAAA/0lEQVR4nO3BMQEAAADCoPVPbQwfoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOA1Ax+AAXicH9kAAAAASUVORK5CYII="
        
        r = requests.put(f"{BASE}/branding", headers=h(token, TENANT_SLUG), json={
            "logo_data": wide_logo_data,
            "brand_name": "Superbrides"
        }, timeout=10)
        test("Upload wide logo", r.status_code == 200, f"Status: {r.status_code}")
        
        if r.status_code == 200:
            result = r.json()
            test("Logo data returned", bool(result.get("logo")), f"Logo present: {bool(result.get('logo'))}")
            # Verify footer_credit is still default even when updating logo
            test("Footer credit unchanged after logo update", 
                 result.get("footer_credit") == "Designed & Hosted by IvoryDigital",
                 f"Footer: {result.get('footer_credit')}")
    except Exception as e:
        test("Logo upload", False, f"Exception: {e}")

    # ========== 7. VERIFY LOGO IN CONTEXT ==========
    print("\n[7] VERIFY LOGO IN TENANT CONTEXT")
    try:
        r = requests.get(f"{BASE}/tenant/context", headers={"X-Tenant": TENANT_SLUG}, timeout=10)
        if r.status_code == 200:
            ctx = r.json()
            logo = ctx.get("branding", {}).get("logo")
            test("Logo present in context", bool(logo), f"Logo length: {len(logo) if logo else 0}")
    except Exception as e:
        test("Logo in context", False, f"Exception: {e}")

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
        print("\n✅ ALL BACKEND TESTS PASSED!")
        print("\nNext: Frontend testing with Playwright to verify:")
        print("  - Footer credit is a clickable link with correct href")
        print("  - No footer-credit input field on Branding page")
        print("  - Logo aspect ratio preserved (not warped)")
        return 0
    else:
        print("\n⚠️  Some backend tests failed.")
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
