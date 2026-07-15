# plan.md — Multi-tenant SaaS Booking Platform (Ivory Digital → White-label)

## 1) Objectives
- Replicate **100%** of the reference app’s behavior/UI/API per tenant (public booking + tenant admin dashboard).
- Add **shared-schema multi-tenancy** in a single MongoDB with **absolute tenant isolation** (no cross-tenant reads/writes).
- Use **path-based routing**:
  - Public: `/{tenant}/`
  - Tenant admin: `/{tenant}/admin`
  - Platform owner panel: `/superadmin`
- Implement **7-day trials** with statuses: `trial | active | expired | suspended` and correct gating (expired/suspended lock screens).
- Add **white-label branding** per tenant (brand name, colors, logo stored as Mongo base64) applied to public/admin/emails.
- Ship **TrueNAS/Dockge-friendly Docker Compose** + Nginx path-routing docs + “add a new client” checklist.
- **P0 (Completed): Improve tenant onboarding & self-service**:
  - Add a **Tenant Admin Help/Guide** experience (sidebar page + quick access).
  - Add a **Common SMTP Settings** reference list near Email setup (modal with provider presets, app-password explainer, troubleshooting).
- **NEW (P0): Launch-ready commercial ops** (now that site is live):
  - Track **paid plan (monthly/annual/custom)** per tenant.
  - Track **next payment due date** per tenant.
  - Generate and send **HMRC-friendly invoices** (PDF + email body) **monthly/annually**.
  - Provide **manual invoice send + auto scheduler**.
  - Provide a **manual email composer** (with attachment support) sent from platform SMTP identity (admin@ivorydigital.uk).

---

## 2) Implementation Steps (Phased)

### Phase 1 — Core POC: Tenant Resolution + Isolation (DONE)
**Core workflow proved:** request → resolve tenant from path/header → enforce `tenant_id` scoping on every collection/route.

Delivered:
- Tenant resolver and strict tenant scoping across DB access.
- Automated isolation tests (A cannot read/write B).
- Manual smoke coverage for tenant-scoped endpoints.

Exit gate (met):
- Isolation test passes reliably.
- Manual smoke: `/{tenant}/api/...` returns only that tenant.

---

### Phase 2 — V1 App Development (DONE)
Delivered:
- Tenant-aware routing `/:tenant/*` and reserved `/superadmin`.
- Tenant Admin dashboard feature set: bookings, availability, appointment types, locations, branding, admins, account.
- Public booking flow + manage booking.
- Platform panel for tenant creation, trial gating controls, max location allowances.

---

### Phase 3 — Trials + Status Gating + UX locks (DONE)
Delivered:
- Trial countdown banner and accurate remaining days display.
- Expired/suspended lock experience for tenant admin (login allowed, app locked).
- Public booking lock messaging for expired/suspended tenants.

---

### Phase 4 — White-label Branding + Logo upload (Mongo base64) + Tenant email theming (DONE)
Delivered:
- Tenant branding (name/colors/logo) applied across public + admin.
- Logo stored as base64 in MongoDB, rendered with correct aspect ratio.
- Footer credit locked to Ivory Digital domain.

---

### Phase 5 — Deployment packaging + Docs + Full regression (DONE)
Delivered:
- Tailored `compose.yaml` for TrueNAS/Dockge.
- Nginx path-routing documentation.
- README + client onboarding checklist.
- Regression testing iterations completed; no known regressions.

---

### Phase 6 — Tenant Admin Help/Guide + Common SMTP Settings List (COMPLETED — P0)
**Result:** Shipped & verified by frontend testing agent (iteration_8.json — 100%, incl. scope check that SMTP guide is absent from Platform Superadmin portal).

Key deliverables:
- Help/Guide appears as **both**:
  1) a **dedicated sidebar page** (`/{tenant}/admin/help`) and
  2) quick access links/buttons in the admin layout.
- Common SMTP settings list appears **near the tenant Email settings form** as a button/link opening a modal.
- **Tenant Admin only** (not shown in platform superadmin portal).

Files added:
- `/app/frontend/src/constants/smtpProviders.js`
- `/app/frontend/src/components/admin/SmtpGuideModal.jsx`
- `/app/frontend/src/pages/admin/HelpGuide.jsx`

Files updated:
- `/app/frontend/src/components/admin/ui.jsx` (Modal size prop)
- `/app/frontend/src/components/admin/EmailSettingsForm.jsx` (showSmtpGuide prop)
- `/app/frontend/src/pages/admin/Account.jsx`
- `/app/frontend/src/pages/admin/AdminLayout.jsx`
- `/app/frontend/src/App.js`

---

### Phase 7 — Billing: Paid Plans, Due Dates & Invoicing (COMPLETED — P0)
**Result:** Shipped & verified by testing agent (iteration_9.json — backend 77/77, frontend 100%). Superadmin can assign preset/custom plans, see next due dates, generate & (auto/manual) send PDF invoices, edit company/HMRC details, and send manual emails with attachments. New deps: fpdf2 (added to requirements.txt + requirements-docker.txt).

#### Confirmed Requirements (from user)
1. **Plans (GBP)**
   - Preset plan A: **£15/month** or **£140/year**
   - Preset plan B: **£26/month** or **£285/year**
   - Plus **Custom plan** (any name + price)
   - Superadmin selects preset/custom + **billing cycle** (monthly/annual)
   - Default labels: **“Essential”** and **“Professional”** (editable in UI before saving)

2. **Due date logic**
   - Option (a): set from activation day and repeats per cycle
   - Monthly: activated 5th → due 5th each month
   - Annual: activated 5th → due 5th next year

3. **Invoicing**
   - Both:
     - Manual “Generate & Send” per tenant
     - Automatic scheduler (daily billing loop) that sends when due

4. **Invoice format**
   - Both: **PDF attachment + formatted email body**

5. **Invoice/Company details (defaults; editable in platform settings UI)**
   - Heading / issuer: **“Weddings By Mark / Ivory Digital”**
   - Address: **220 Ashurst Road, Manchester M22 5AX**
   - Bank details:
     - Sort Code: **04-06-05**
     - Account No: **20315075**
     - Name: **Mark Powell**
     - Bank: **Tide/ClearBank Sole Trader business account**
   - VAT: **none**

6. **Manual email tool**
   - Full email composer
   - “To” defaults to tenant owner email but editable
   - Subject + message body
   - **Attachment support** (upload one or more files)
   - Sent via platform SMTP identity (configured in `/platform/email-settings`, e.g. admin@ivorydigital.uk)

#### Existing infrastructure to reuse
- Platform SMTP settings already exist:
  - `GET/PUT/POST /platform/email-settings` and tested send logic.
- Email rendering and SMTP sending:
  - `render_email`, `_smtp_send`, `dispatch_email`.
- Background scheduler pattern:
  - `reminder_loop()` started at FastAPI startup.
- Tenants table already exists in platform dashboard.
- `tenant.plan` exists today (currently mostly `trial` vs `active`); will be extended with structured billing fields.

---

## Phase 7 Implementation (Backend)

### 7.1 Data model updates (MongoDB)
1. **Tenant billing subdocument** stored inside `tenants` collection:
   ```js
   billing: {
     plan_tier: "essential" | "professional" | "custom",
     plan_name: string,
     price: number,
     cycle: "monthly" | "annual",
     currency: "GBP",
     start_date: ISOString,
     next_due_date: ISOString,
     active: boolean
   }
   ```

2. **Platform company/invoice settings** in `platform_settings`:
   - Key: `company`
   - Defaults from user
   ```js
   { key: "company", heading, address, bank_sort_code, bank_account_no, bank_account_name, bank_name, payment_terms }
   ```

3. **Invoices collection** `invoices`:
   ```js
   {
     number: string,
     tenant_id: string,
     tenant_name: string,
     issued_date: ISOString,
     due_date: ISOString,
     period_key: string, // idempotency key e.g. tenant_id + YYYY-MM
     plan_name: string,
     amount: number,
     currency: "GBP",
     cycle: "monthly" | "annual",
     status: "draft" | "sent" | "paid" | "void",
     sent_to: string,
     created_at: ISOString
   }
   ```

### 7.2 Dependencies
- Add **fpdf2** for PDF invoice generation.
- Update:
  - `/app/backend/requirements.txt`
  - `/app/backend/requirements-docker.txt`

### 7.3 Core helpers
- `add_cycle(dt, cycle)`:
  - Monthly/yearly date increment with day clamping (e.g., 31st → 30th in shorter months).
- `build_invoice_pdf(invoice, company_settings)` using fpdf2.
- Extend `_smtp_send()` to accept **attachments** (backward compatible):
  - `attachments: List[{filename, content_type, data_bytes}]`

### 7.4 New/extended platform endpoints
1. **Plans**
   - `GET /api/platform/plans`
     - Returns presets and allowed cycles.

2. **Company/invoice settings**
   - `GET /api/platform/company-settings`
   - `PUT /api/platform/company-settings`

3. **Assign tenant plan (activation sets due date)**
   - `POST /api/platform/tenants/{tenant_id}/plan`
     - Body: `{ plan_tier, plan_name, price, cycle }`
     - Sets `tenants.billing`, sets `status: active`, sets `plan: active`
     - Sets `start_date = now`, `next_due_date = add_cycle(now, cycle)`

4. **Invoices (history + generate)**
   - `GET /api/platform/tenants/{tenant_id}/invoices`
   - `POST /api/platform/tenants/{tenant_id}/generate-invoice`
     - Body: `{ send: bool }`
     - Creates invoice record (idempotent by `period_key`)
     - Generates PDF bytes
     - If `send`, emails to tenant owner, from platform SMTP

5. **Invoice PDF download**
   - `GET /api/platform/invoices/{invoice_id}/pdf`
     - Returns `application/pdf`

6. **Manual email composer**
   - `POST /api/platform/send-email`
     - Accepts: `to`, `subject`, `message`, `attachments[]`
     - Attachments support via base64 or multipart (choose approach during implementation)

7. **Tenant overview enrichment**
   - Extend `_tenant_overview()` to include:
     - `billing.plan_name`, `billing.price`, `billing.cycle`, `billing.next_due_date`

### 7.5 Automated monthly/annual invoicing loop
- Add `billing_loop()` background task started on startup:
  - Runs daily (or every few hours).
  - For each active tenant with `billing.active == true`:
    - If `now >= next_due_date`:
      - Generate invoice (idempotent)
      - Send email + PDF
      - Advance `next_due_date = add_cycle(next_due_date, cycle)`

---

## Phase 7 Implementation (Frontend)

### 7.6 Platform dashboard table upgrades
- Update `/app/frontend/src/pages/platform/PlatformDashboard.jsx`:
  - Add columns:
    - **Plan** (plan_name + £price + cycle)
    - **Next Due** (formatted date)
  - Row actions:
    - **Plan** → opens `PlanModal`
    - **Invoices** → opens `InvoicesModal`

### 7.7 New platform modals/components
Create `/app/frontend/src/components/platform/BillingModals.jsx` (or separate files):
1. `PlanModal`
   - Preset buttons for Essential/Professional with monthly/annual toggle
   - Custom fields (name + price + cycle)
   - Shows computed next due date
   - Save → calls `/platform/tenants/{id}/plan`

2. `InvoicesModal`
   - Shows invoice history table
   - Buttons:
     - Generate (draft)
     - Generate & Send
     - Download PDF

3. `CompanySettingsModal`
   - Edit heading, address, bank details, payment terms

4. `ManualEmailModal`
   - To (default tenant owner), subject, message
   - Attachment picker (file upload)
   - Send via `/platform/send-email`

### 7.8 Platform header controls
- Add header buttons:
  - “Company Details”
  - “Send Email”
  - Keep existing “Email Settings” (platform SMTP)

---

## 3) Next Actions
### Immediate (Phase 7)
1. Backend: add fpdf2 to requirements and implement invoice PDF builder.
2. Backend: extend SMTP send to support attachments.
3. Backend: add billing fields to tenants + new platform endpoints.
4. Backend: implement `billing_loop()` for automatic invoice generation/sending.
5. Frontend: extend platform tenants table with Plan + Next Due and implement modals (Plan/Invoices/Company/Manual Email).
6. Add tests:
   - Backend tests for plan assignment, next_due_date computation, invoice generation idempotency, pdf download, manual email + attachments.
   - Frontend tests for modals render/open/submit.

---

## 4) Success Criteria
- **No feature loss** vs current live platform (public booking + tenant admin + reminders, etc.).
- Platform dashboard shows per-tenant:
  - Status, plan name, price, cycle, **next due date**.
- Superadmin can:
  - Assign preset plans or custom plans.
  - Generate & send invoices manually.
  - Have invoices sent automatically on due dates.
  - Edit company/invoice details.
  - Send manual emails with attachments.
- Invoices are:
  - Properly numbered, stored, downloadable as PDF.
  - Emailed with a formatted body + PDF attachment.

### Deployment reminder (TrueNAS)
Phase 7 includes **backend + frontend** changes and new backend dependencies.
Rebuild both:
- `docker compose build --no-cache backend frontend`
- `docker compose up -d`
