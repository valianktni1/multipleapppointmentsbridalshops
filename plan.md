# plan.md — Multi-tenant SaaS Booking Platform (WifeToBe → White-label)

## 1) Objectives
- Replicate **100%** of the reference app’s behavior/UI/API per tenant (public booking + tenant admin dashboard).
- Add **shared-schema multi-tenancy** in a single MongoDB with **absolute tenant isolation** (no cross-tenant reads/writes).
- Use **path-based routing**:
  - Public: `/{tenant}/`
  - Tenant admin: `/{tenant}/admin`
  - Platform owner panel: `/superadmin`
- Implement **7-day trials** with statuses: `trial | active | expired | suspended` and correct gating (expired/suspended lock screens).
- Add **white-label branding** per tenant (brand name, colors, logo stored as Mongo base64) applied to public/admin/emails.
- Ship **Dockge-friendly Docker Compose** + TrueNAS/Nginx path-routing docs + “add a new client” checklist.

---

## 2) Implementation Steps (Phased)

### Phase 1 — Core POC: Tenant Resolution + Isolation (do not proceed until green)
**Core workflow to prove:** request → resolve tenant from path/header → enforce `tenant_id` scoping on every collection/route.

User stories:
1. As the platform owner, I can create two tenants (A, B) and each gets seeded data.
2. As a tenant admin in A, I can list my locations and never see B’s locations.
3. As a public customer on `/{tenant}/`, I can only book into that tenant’s inventory.
4. As the platform owner, I can suspend a tenant and its public/admin routes lock immediately.
5. As the platform owner, I can run an automated isolation test that proves A cannot access B.

Implementation:
- Repo bootstrap: new monorepo structure mirroring reference (`/backend`, `/frontend`), copy reference code to preserve behavior.
- Backend (FastAPI):
  - Add collections: `tenants`, `platform_users`.
  - Add `tenant_id` to all tenant-owned docs: users/admins, shops, appointment_types, availability, bookings, waitlist, settings, blocked_dates.
  - Add tenant resolver middleware/dependency:
    - Primary: **path tenant slug** (from router prefix or request scope)
    - Secondary: `X-Tenant` header (frontend sets)
    - Dev/testing: `?tenant=` override
    - Optional fallback: Host-subdomain
    - Never accept `tenant_id` from request body.
  - Add query scoping helper: `tenant_filter(user_ctx)`; wrap all DB calls.
  - Create indexes: unique `tenants.slug`; compound indexes `(tenant_id, shop_id, date, status)` etc.
- Platform auth:
  - Seed platform superadmin `admin@ivory-digital.uk / IvoryAdmin2025!`.
  - Separate JWT audience/claims or separate auth dependency to prevent mixing tenant/admin.
- POC test harness:
  - Write a **Python script** (or pytest) that:
    - Creates tenant A + B
    - Seeds each
    - Creates data in A
    - Attempts to read/mutate it via B context
    - Asserts **403/404** and zero leakage.
- Web search task (best practice): verify FastAPI multi-tenant patterns (dependency-based scoping + middleware) and Mongo compound indexing.

Exit gate:
- Isolation test passes reliably.
- Manual smoke: `/{tenant}/api/shops` returns only that tenant.

---

### Phase 2 — V1 App Development (port full reference app into tenant scope)
User stories:
1. As a bride on `/{tenant}/`, I can complete the full 5-step booking flow and receive a reference.
2. As a bride, I can view/reschedule/cancel using `/booking/{reference}` within that tenant.
3. As a tenant admin, I can login and manage bookings (confirm/complete/cancel/no-show, notes, reschedule).
4. As a tenant admin, I can manage availability, blocked dates, appointment types, waitlist.
5. As a tenant superadmin, I can manage up to 4 admins and export CSV + iCal feed.

Implementation:
- Frontend routing changes:
  - Add tenant-aware router base: `/:tenant/*` (public + tenant admin).
  - Reserve `/superadmin/*` for platform panel.
  - Add a small tenant context helper that derives `tenant` from URL and injects `X-Tenant` header in `axios` interceptor.
- Backend route refactor:
  - Keep the same route shapes under `/api`, but enforce tenant scoping on every handler.
  - Convert the old single global settings doc into **per-tenant settings**.
  - Ensure bookings reference uniqueness: either global unique with tenant prefixing, or compound unique `(tenant_id, reference)`.
- Seeding per tenant:
  - On tenant creation, seed 1 location + default hours + default appointment types + standard questions (source question) similar to reference seed.
- Platform panel (minimal but complete):
  - Create/list tenants, show counts (#locations, #bookings), created date.
  - Actions: extend trial, convert active, suspend/unsuspend, reset owner password, delete.
- End-of-phase: run one full E2E testing round (public booking + admin management).

---

### Phase 3 — Trials + Status Gating + UX locks
User stories:
1. As a tenant admin, I see a banner with “X days left in trial”.
2. As a tenant admin, after expiry I can still login but see a clear lock screen.
3. As a public customer, expired tenant shows “bookings temporarily unavailable”.
4. As the platform owner, I can extend a trial and tenant unlocks instantly.
5. As the platform owner, I can suspend a tenant and both public/admin lock instantly.

Implementation:
- Tenant status computation on each request:
  - `trial` + now>=trial_ends_at ⇒ treat as `expired`.
- Gating rules:
  - Public routes blocked for `expired|suspended` (message page).
  - Tenant admin routes: allow auth but block mutations; show lock UI.
- Platform overview: days remaining, one-click actions.
- End-of-phase: expand isolation tests to include gating conditions.

---

### Phase 4 — White-label Branding + Logo upload (Mongo base64) + Tenant email theming
User stories:
1. As a tenant admin, I can set brand name/colors and see the UI update.
2. As a tenant admin, I can upload a logo and it displays on public/admin pages.
3. As a tenant admin, emails (when enabled) include the correct logo and brand text.
4. As the platform owner, I can set a default footer credit (IvoryDigital) configurable per tenant.
5. As a tenant admin, I can preview branding before enabling emails.

Implementation:
- Branding model: stored on tenant doc + exposed via `GET /api/tenant/branding`.
- Logo upload:
  - Store base64 + mime + updated_at; serve via `/api/tenant/logo`.
- Frontend:
  - Apply CSS variables from branding (primary/accent) while keeping default luxury theme.
  - Replace Wordmark text with tenant brand_name.
- Emails:
  - Keep “off until configured”; when on, render HTML with tenant logo CID.

---

### Phase 5 — Deployment packaging + Docs + Full regression
User stories:
1. As the platform owner, I can deploy via Dockge using one docker-compose.
2. As the platform owner, Nginx path routing forwards `/superadmin` and `/{tenant}` correctly.
3. As the platform owner, nightly backups run and retain ~30 days.
4. As the platform owner, onboarding a new tenant requires no code changes.
5. As a tenant admin, the system remains stable after restart (seed + indexes + reminder loop).

Implementation:
- Docker Compose:
  - frontend + backend + mongo + backup container (one-line command; retention ~30 days).
- Nginx docs (path-based):
  - Proxy rules for `/superadmin`, `/{tenant}`, and `/api` (ensure correct headers).
- README:
  - “Add a new client” checklist (platform panel entry + optional DNS + Nginx + SSL).
- Final testing:
  - Full E2E regression + isolation suite.

---

## 3) Next Actions
1. Create new repo and copy reference app into it (frontend/backend) as baseline.
2. Implement tenant model + resolver + tenant-scoped DB helpers.
3. Build and run Phase 1 isolation POC script until fully green.
4. Add platform `/superadmin` minimal UI + tenant creation + seed.

---

## 4) Success Criteria
- **No feature loss** vs reference app (public + admin + exports + reminders + payments hooks intact).
- **Tenant isolation proven** by automated tests (A cannot read/write B, including aggregations/exports).
- Correct routing:
  - `/{tenant}/` serves tenant public booking
  - `/{tenant}/admin` serves tenant admin
  - `/superadmin` serves platform panel
- Trial lifecycle works end-to-end (trial banner, expiry locks, suspend locks, extend/unlock).
- Branding + logo applied consistently to public/admin/emails.
- Deployable on TrueNAS via Dockge with documented Nginx path proxying + backups.
