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
- **NEW (P0): Improve tenant onboarding & self-service**:
  - Add a **Tenant Admin Help/Guide** experience (sidebar page + quick access).
  - Add a **Common SMTP Settings** reference list near Email setup (modal with provider presets, app-password explainer, troubleshooting).

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
**Result:** All features shipped & verified by frontend testing agent (iteration_8.json — 100%, incl. scope check that SMTP guide is absent from Platform Superadmin portal). Files added: `constants/smtpProviders.js`, `components/admin/SmtpGuideModal.jsx`, `pages/admin/HelpGuide.jsx`. Files updated: `components/admin/ui.jsx` (Modal size prop), `components/admin/EmailSettingsForm.jsx` (showSmtpGuide prop), `pages/admin/Account.jsx`, `pages/admin/AdminLayout.jsx`, `App.js`.

**Goal:** Reduce tenant onboarding friction and reduce SMTP support tickets by embedding guidance in the tenant admin.

**Scope decisions (confirmed by user):**
- Help/Guide appears as **both**:
  1) a **dedicated sidebar page** (`/{tenant}/admin/help`) and
  2) a **quick Help button** in the Admin layout header/nav.
- Common SMTP settings list appears **near the tenant Email settings form** as a button opening a modal.
- **Tenant Admin only** (do not add to platform superadmin portal UI).
- **Frontend-only** changes.

#### User Stories
1. As a tenant admin, I can open a Help page from the sidebar to understand key features and setup steps.
2. As a tenant admin, I can open Help quickly (1-click) from anywhere in the admin.
3. As a tenant admin, while setting up email, I can view common SMTP settings for my provider.
4. As a tenant admin, I can search/filter the SMTP list and understand which port/encryption to use.
5. As a tenant admin, I can read a short “App Password” explainer and troubleshooting checklist.

#### Implementation (frontend)
1. **Add SMTP provider constants**
   - Create: `/app/frontend/src/constants/smtpProviders.js`
   - Contents:
     - Provider rows extracted from `Common SMTP Email Settings.pdf`: Gmail/Workspace, Outlook.com, Microsoft 365, Yahoo, iCloud, AOL, BT, Sky Yahoo, Virgin Media, TalkTalk, Plusnet, Zoho, Fastmail, Proton, Custom domain (generic).
     - Fields per row: `provider`, `host`, `ports` (array), `encryption` (SSL/TLS vs STARTTLS), `notes` (App Password requirements, admin enablement notes, etc.).
     - Shared sections: `APP_PASSWORD_EXPLAINER`, `TROUBLESHOOTING_TIPS`.

2. **Modal: support wider content (backward compatible)**
   - Update: `/app/frontend/src/components/admin/ui.jsx`
   - Add optional prop to `Modal`:
     - `size` (e.g., `"lg" | "xl"` or `maxWidthClass`) to allow a wider modal for the SMTP table.
   - Keep default behavior unchanged for all existing modal uses.

3. **SMTP Guide Modal component**
   - Create: `/app/frontend/src/components/admin/SmtpGuideModal.jsx`
   - Features:
     - Search input to filter by provider name/host.
     - Table/list: Provider | SMTP Host | Ports | Encryption | Notes.
     - Sections beneath/above table:
       - “App Passwords” explainer.
       - Troubleshooting checklist (wrong port, encryption mismatch, username mismatch, app passwords, M365 admin SMTP auth).
     - Styling: uses existing WTB tokens (`card-wtb`, `btn-wtb`, `input-wtb`, colors).

4. **EmailSettingsForm: add button that opens the SMTP list**
   - Update: `/app/frontend/src/components/admin/EmailSettingsForm.jsx`
   - Add prop:
     - `showSmtpGuide` (default `false`) to ensure platform superadmin UI doesn’t render this.
   - Place a **“View Common SMTP Settings”** button near SMTP host/port fields.
   - Clicking opens `SmtpGuideModal`.

5. **Help/Guide page**
   - Create: `/app/frontend/src/pages/admin/HelpGuide.jsx`
   - Content structure (lightweight + scannable):
     - Getting Started (what to do first)
     - Branding
     - Locations
     - Appointments
     - Availability
     - Bookings (statuses + how confirmations work)
     - Customers
     - Email Setup (SMTP + test email + reminders)
     - Support/contact link (`mailto:hello@ivory-digital.uk`)
   - Use simple accordions/cards (shadcn if already present, otherwise lightweight panels).

6. **Routing**
   - Update: `/app/frontend/src/App.js`
   - Add tenant admin route:
     - `Route path="help" element={<HelpGuide />}` under `/:tenant/admin` protected routes.

7. **Admin navigation + quick help access**
   - Update: `/app/frontend/src/pages/admin/AdminLayout.jsx`
   - Add sidebar nav item:
     - `{ seg: "help", icon: <...>, label: "Help & Guide" }` (non-superadmin restricted).
   - Add quick-help access:
     - A small header button on mobile and/or next to logout on desktop.
     - Behavior: navigates to `/{tenant}/admin/help`.

8. **Wire tenant-only SMTP guide**
   - Update: `/app/frontend/src/pages/admin/Account.jsx`
   - Pass `showSmtpGuide={true}` to `EmailSettingsForm` so tenant admins see it.
   - Confirm: platform portal usage (PlatformDashboard) does **not** pass this prop.

#### Testing / Verification
- Build/lint sanity:
  - Ensure React compile passes.
  - Ensure no breaking changes to `Modal` usage.
- Frontend testing agent (UI verification):
  - Confirm Help link appears in sidebar.
  - Confirm quick Help button navigates correctly.
  - Confirm “View Common SMTP Settings” button renders on Tenant Account page.
  - Confirm modal opens/closes (Esc, click backdrop, close button).
  - Confirm search filters provider rows.

#### Exit Criteria
- Help page is reachable from sidebar and quick-help access.
- SMTP modal opens from tenant Email settings, displays provider list + explainer + troubleshooting.
- No changes to platform superadmin email UI.
- No regressions in tenant admin layout/navigation.

---

## 3) Next Actions
1. Implement Phase 6 steps 1–3 (SMTP constants + Modal sizing + SmtpGuideModal).
2. Implement Phase 6 steps 4 & 8 (EmailSettingsForm prop + Account.jsx usage).
3. Implement Phase 6 steps 5–7 (Help page + routing + AdminLayout links/buttons).
4. Run frontend test agent UI checks and fix any layout regressions.

---

## 4) Success Criteria
- **No feature loss** vs reference app (public + tenant admin + exports + reminders + payments hooks intact).
- **Tenant isolation proven** by automated tests.
- Correct routing:
  - `/{tenant}/` serves tenant public booking
  - `/{tenant}/admin` serves tenant admin
  - `/superadmin` serves platform panel
- Trial lifecycle works end-to-end (banner, expiry locks, suspend locks).
- Branding + logo applied consistently to public/admin/emails.
- **NEW:** Tenant admins can self-onboard via Help/Guide and configure SMTP using an embedded provider reference list.

### Deployment reminder (TrueNAS)
After these **frontend-only** changes, rebuild on TrueNAS:
- `docker compose build --no-cache frontend`
- then `docker compose up -d`
