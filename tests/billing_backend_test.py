"""
Backend API tests for billing features.
Tests: plans, company settings, billing assignment, invoice generation, manual email.
"""
import sys
import requests
from datetime import datetime

BASE = "https://content-formatter-17.preview.emergentagent.com/api"
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


def h(token=None):
    hd = {"Content-Type": "application/json"}
    if token:
        hd["Authorization"] = f"Bearer {token}"
    return hd


def main():
    print("\n=== Backend Billing API Tests ===\n")
    
    # 1. Platform login
    print("1. Platform login")
    r = requests.post(f"{BASE}/platform/login", json={"email": PLATFORM_EMAIL, "password": PLATFORM_PW})
    check(r.status_code == 200, f"platform login -> {r.status_code}")
    if r.status_code != 200:
        print(f"Cannot proceed. Response: {r.text}")
        sys.exit(1)
    ptok = r.json()["access_token"]
    
    # 2. GET /api/platform/plans
    print("\n2. GET /api/platform/plans")
    rp = requests.get(f"{BASE}/platform/plans", headers=h(ptok))
    check(rp.status_code == 200, f"GET plans -> {rp.status_code}")
    if rp.status_code == 200:
        plans = rp.json()
        check("plans" in plans, "response has 'plans' key")
        check(plans.get("currency") == "GBP", f"currency is GBP: {plans.get('currency')}")
        check(plans.get("symbol") == "£", f"symbol is £: {plans.get('symbol')}")
        plan_list = plans.get("plans", [])
        check(len(plan_list) >= 2, f"at least 2 plans: {len(plan_list)}")
        
        # Check Essential plan
        essential = next((p for p in plan_list if p.get("tier") == "essential"), None)
        check(essential is not None, "Essential plan exists")
        if essential:
            check(essential.get("name") == "Essential", f"Essential name: {essential.get('name')}")
            check(essential.get("monthly") == 15.0, f"Essential monthly: £{essential.get('monthly')}")
            check(essential.get("annual") == 140.0, f"Essential annual: £{essential.get('annual')}")
        
        # Check Professional plan
        professional = next((p for p in plan_list if p.get("tier") == "professional"), None)
        check(professional is not None, "Professional plan exists")
        if professional:
            check(professional.get("name") == "Professional", f"Professional name: {professional.get('name')}")
            check(professional.get("monthly") == 26.0, f"Professional monthly: £{professional.get('monthly')}")
            check(professional.get("annual") == 285.0, f"Professional annual: £{professional.get('annual')}")
    
    # 3. GET /api/platform/company-settings
    print("\n3. GET /api/platform/company-settings")
    rc = requests.get(f"{BASE}/platform/company-settings", headers=h(ptok))
    check(rc.status_code == 200, f"GET company-settings -> {rc.status_code}")
    if rc.status_code == 200:
        company = rc.json()
        check("heading" in company, "has 'heading' field")
        check("address" in company, "has 'address' field")
        check("bank_account_name" in company, "has 'bank_account_name' field")
        check("bank_sort_code" in company, "has 'bank_sort_code' field")
        check("bank_account_no" in company, "has 'bank_account_no' field")
        
        # Check defaults
        check("Weddings By Mark" in company.get("heading", ""), f"default heading present: {company.get('heading')}")
        check("220 Ashurst Road" in company.get("address", ""), f"default address present")
        check(company.get("bank_sort_code") == "04-06-05", f"default sort code: {company.get('bank_sort_code')}")
        check(company.get("bank_account_no") == "20315075", f"default account no: {company.get('bank_account_no')}")
        check(company.get("bank_account_name") == "Mark Powell", f"default account name: {company.get('bank_account_name')}")
    
    # 4. PUT /api/platform/company-settings
    print("\n4. PUT /api/platform/company-settings")
    test_heading = "Test Company Heading"
    rpu = requests.put(f"{BASE}/platform/company-settings", headers=h(ptok), 
                       json={"heading": test_heading})
    check(rpu.status_code == 200, f"PUT company-settings -> {rpu.status_code}")
    
    # Verify change persisted
    rc2 = requests.get(f"{BASE}/platform/company-settings", headers=h(ptok))
    if rc2.status_code == 200:
        check(rc2.json().get("heading") == test_heading, f"heading updated: {rc2.json().get('heading')}")
    
    # Restore original
    requests.put(f"{BASE}/platform/company-settings", headers=h(ptok), 
                json={"heading": "Weddings By Mark / Ivory Digital"})
    
    # 5. GET /api/platform/tenants (check for existing test companies)
    print("\n5. GET /api/platform/tenants")
    rt = requests.get(f"{BASE}/platform/tenants", headers=h(ptok))
    check(rt.status_code == 200, f"GET tenants -> {rt.status_code}")
    tenants = rt.json() if rt.status_code == 200 else []
    
    # Find Acme Bridal (should be on Professional plan)
    acme = next((t for t in tenants if t.get("slug") == "acmebridal"), None)
    beta = next((t for t in tenants if t.get("slug") == "beta"), None)
    
    if acme:
        print("\n6. Check Acme Bridal billing")
        check(acme.get("billing") is not None, "Acme has billing info")
        if acme.get("billing"):
            b = acme["billing"]
            check(b.get("active") == True, f"Acme billing active: {b.get('active')}")
            check(b.get("plan_name") is not None, f"Acme plan_name: {b.get('plan_name')}")
            check(b.get("price") is not None, f"Acme price: £{b.get('price')}")
            check(b.get("cycle") in ["monthly", "annual"], f"Acme cycle: {b.get('cycle')}")
            check(b.get("next_due_date") is not None, f"Acme next_due_date: {b.get('next_due_date')}")
    else:
        print("\n6. Acme Bridal not found - will create test tenant")
    
    if beta:
        print("\n7. Check Beta Bridal (should have no plan)")
        check(beta.get("billing") is None or not beta.get("billing", {}).get("active"), 
              f"Beta has no active plan: {beta.get('billing')}")
    
    # 8. Create a test tenant for billing operations
    print("\n8. Create test tenant for billing")
    # Cleanup if exists
    test_slug = "billingtest"
    existing = next((t for t in tenants if t.get("slug") == test_slug), None)
    if existing:
        requests.delete(f"{BASE}/platform/tenants/{existing['id']}", headers=h(ptok))
    
    rct = requests.post(f"{BASE}/platform/tenants", headers=h(ptok), json={
        "name": "Billing Test Co", "slug": test_slug, 
        "owner_email": "billing@test.com", "owner_password": "test123456",
        "trial_days": 7, "locations": 1
    })
    check(rct.status_code == 200, f"create test tenant -> {rct.status_code}")
    if rct.status_code != 200:
        print(f"Cannot proceed. Response: {rct.text}")
        sys.exit(1)
    test_tenant = rct.json()
    tenant_id = test_tenant["id"]
    
    # 9. POST /api/platform/tenants/{id}/plan (monthly)
    print("\n9. POST /api/platform/tenants/{id}/plan (monthly)")
    rsp = requests.post(f"{BASE}/platform/tenants/{tenant_id}/plan", headers=h(ptok), json={
        "plan_tier": "essential",
        "plan_name": "Essential",
        "price": 15.0,
        "cycle": "monthly"
    })
    check(rsp.status_code == 200, f"set plan -> {rsp.status_code}")
    if rsp.status_code == 200:
        updated = rsp.json()
        check(updated.get("status") == "active", f"status changed to active: {updated.get('status')}")
        check(updated.get("billing") is not None, "billing info present")
        if updated.get("billing"):
            b = updated["billing"]
            check(b.get("plan_tier") == "essential", f"plan_tier: {b.get('plan_tier')}")
            check(b.get("plan_name") == "Essential", f"plan_name: {b.get('plan_name')}")
            check(b.get("price") == 15.0, f"price: {b.get('price')}")
            check(b.get("cycle") == "monthly", f"cycle: {b.get('cycle')}")
            check(b.get("active") == True, f"active: {b.get('active')}")
            check(b.get("next_due_date") is not None, f"next_due_date computed: {b.get('next_due_date')}")
            
            # Verify next_due_date is ~1 month from now
            if b.get("next_due_date"):
                try:
                    due = datetime.fromisoformat(b["next_due_date"].replace("Z", "+00:00"))
                    now = datetime.now(due.tzinfo)
                    days_diff = (due - now).days
                    check(25 <= days_diff <= 35, f"next_due_date is ~1 month away: {days_diff} days")
                except:
                    print("  ⚠️  Could not parse next_due_date")
    
    # 10. POST /api/platform/tenants/{id}/generate-invoice (send:false - draft)
    print("\n10. POST /api/platform/tenants/{id}/generate-invoice (draft)")
    rgi = requests.post(f"{BASE}/platform/tenants/{tenant_id}/generate-invoice", 
                        headers=h(ptok), json={"send": False})
    check(rgi.status_code == 200, f"generate draft invoice -> {rgi.status_code}")
    invoice_id = None
    invoice_number = None
    if rgi.status_code == 200:
        invoice = rgi.json()
        invoice_id = invoice.get("id")
        invoice_number = invoice.get("number")
        check(invoice_id is not None, f"invoice has id: {invoice_id}")
        check(invoice_number is not None, f"invoice has number: {invoice_number}")
        check(invoice.get("status") == "draft", f"invoice status is draft: {invoice.get('status')}")
        check(invoice.get("tenant_id") == tenant_id, "invoice tenant_id matches")
        check(invoice.get("plan_name") == "Essential", f"invoice plan_name: {invoice.get('plan_name')}")
        check(invoice.get("amount") == 15.0, f"invoice amount: {invoice.get('amount')}")
        check(invoice.get("period_key") is not None, f"invoice has period_key: {invoice.get('period_key')}")
    
    # 11. Test idempotency - generate again with same period
    print("\n11. Test invoice idempotency")
    rgi2 = requests.post(f"{BASE}/platform/tenants/{tenant_id}/generate-invoice", 
                         headers=h(ptok), json={"send": False})
    check(rgi2.status_code == 200, f"generate invoice again -> {rgi2.status_code}")
    if rgi2.status_code == 200:
        invoice2 = rgi2.json()
        check(invoice2.get("id") == invoice_id, f"same invoice id (idempotent): {invoice2.get('id')} == {invoice_id}")
        check(invoice2.get("number") == invoice_number, f"same invoice number: {invoice2.get('number')}")
    
    # 12. GET /api/platform/tenants/{id}/invoices
    print("\n12. GET /api/platform/tenants/{id}/invoices")
    rli = requests.get(f"{BASE}/platform/tenants/{tenant_id}/invoices", headers=h(ptok))
    check(rli.status_code == 200, f"list invoices -> {rli.status_code}")
    if rli.status_code == 200:
        invoices = rli.json()
        check(len(invoices) >= 1, f"at least 1 invoice: {len(invoices)}")
        check(any(i.get("id") == invoice_id for i in invoices), "created invoice in list")
    
    # 13. GET /api/platform/invoices/{invoice_id}/pdf
    print("\n13. GET /api/platform/invoices/{invoice_id}/pdf")
    if invoice_id:
        rpdf = requests.get(f"{BASE}/platform/invoices/{invoice_id}/pdf", headers=h(ptok))
        check(rpdf.status_code == 200, f"download PDF -> {rpdf.status_code}")
        check(rpdf.headers.get("content-type") == "application/pdf", 
              f"content-type is application/pdf: {rpdf.headers.get('content-type')}")
        check(len(rpdf.content) > 1000, f"PDF has content: {len(rpdf.content)} bytes")
        # Check PDF magic bytes
        check(rpdf.content[:4] == b'%PDF', "PDF starts with %PDF magic bytes")
    
    # 14. POST /api/platform/tenants/{id}/generate-invoice (send:true - should fail with 400)
    print("\n14. POST /api/platform/tenants/{id}/generate-invoice (send:true - EXPECTED 400)")
    rgs = requests.post(f"{BASE}/platform/tenants/{tenant_id}/generate-invoice", 
                        headers=h(ptok), json={"send": True})
    check(rgs.status_code == 400, f"send invoice without SMTP -> {rgs.status_code} (EXPECTED 400)")
    if rgs.status_code == 400:
        error_text = rgs.text.lower()
        check("email" in error_text or "smtp" in error_text or "configure" in error_text,
              f"error mentions email/SMTP/configure: {rgs.text[:100]}")
    else:
        print(f"  ⚠️  Expected 400, got {rgs.status_code}: {rgs.text[:200]}")
    
    # 15. POST /api/platform/send-email (should fail with 400)
    print("\n15. POST /api/platform/send-email (EXPECTED 400)")
    rse = requests.post(f"{BASE}/platform/send-email", headers=h(ptok), json={
        "to": "test@example.com",
        "subject": "Test Email",
        "message": "This is a test message.",
        "attachments": []
    })
    check(rse.status_code == 400, f"send email without SMTP -> {rse.status_code} (EXPECTED 400)")
    if rse.status_code == 400:
        error_text = rse.text.lower()
        check("email" in error_text or "smtp" in error_text or "configure" in error_text,
              f"error mentions email/SMTP/configure: {rse.text[:100]}")
    
    # 16. Test send-email with base64 attachment (should still fail gracefully)
    print("\n16. POST /api/platform/send-email with attachment (EXPECTED 400)")
    import base64
    test_content = base64.b64encode(b"Test file content").decode()
    rsea = requests.post(f"{BASE}/platform/send-email", headers=h(ptok), json={
        "to": "test@example.com",
        "subject": "Test with Attachment",
        "message": "Message with attachment",
        "attachments": [{
            "filename": "test.txt",
            "content_type": "text/plain",
            "data_base64": test_content
        }]
    })
    check(rsea.status_code == 400, f"send email with attachment -> {rsea.status_code} (EXPECTED 400)")
    check(rsea.status_code != 500, "does not crash with 500 on attachment")
    
    # 17. POST /api/platform/tenants/{id}/clear-plan
    print("\n17. POST /api/platform/tenants/{id}/clear-plan")
    rcp = requests.post(f"{BASE}/platform/tenants/{tenant_id}/clear-plan", headers=h(ptok))
    check(rcp.status_code == 200, f"clear plan -> {rcp.status_code}")
    if rcp.status_code == 200:
        cleared = rcp.json()
        check(cleared.get("billing", {}).get("active") == False, 
              f"billing deactivated: {cleared.get('billing', {}).get('active')}")
    
    # 18. Test annual plan
    print("\n18. POST /api/platform/tenants/{id}/plan (annual)")
    rspa = requests.post(f"{BASE}/platform/tenants/{tenant_id}/plan", headers=h(ptok), json={
        "plan_tier": "professional",
        "plan_name": "Professional",
        "price": 285.0,
        "cycle": "annual"
    })
    check(rspa.status_code == 200, f"set annual plan -> {rspa.status_code}")
    if rspa.status_code == 200:
        updated = rspa.json()
        if updated.get("billing"):
            b = updated["billing"]
            check(b.get("cycle") == "annual", f"cycle is annual: {b.get('cycle')}")
            check(b.get("price") == 285.0, f"annual price: {b.get('price')}")
            
            # Verify next_due_date is ~1 year from now
            if b.get("next_due_date"):
                try:
                    due = datetime.fromisoformat(b["next_due_date"].replace("Z", "+00:00"))
                    now = datetime.now(due.tzinfo)
                    days_diff = (due - now).days
                    check(350 <= days_diff <= 380, f"next_due_date is ~1 year away: {days_diff} days")
                except:
                    print("  ⚠️  Could not parse next_due_date")
    
    # Cleanup
    print("\n19. Cleanup")
    requests.delete(f"{BASE}/platform/tenants/{tenant_id}", headers=h(ptok))
    check(True, "test tenant deleted")
    
    print(f"\n{'='*60}")
    print(f"RESULT: {passed} passed, {failed} failed")
    print(f"{'='*60}\n")
    
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
