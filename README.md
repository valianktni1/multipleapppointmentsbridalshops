# Ivory Digital — Multi-Tenant SaaS Booking Platform

A white-label, multi-tenant version of the "Wife To Be" bridal appointment system.
The **platform owner** (you) onboards **companies (tenants)**. Each tenant is fully
isolated, gets the complete booking feature set, its own branding, its own URL, and a
**7-day free trial**.

Domain: **ivory-digital.uk** · **Path-based routing** (no subdomains / no wildcard DNS).

## URL Map
| What | URL |
|------|-----|
| Platform landing | `https://ivory-digital.uk/` |
| Platform owner login | `https://ivory-digital.uk/superadmin` |
| Platform control panel | `https://ivory-digital.uk/superadmin/app` |
| Tenant public booking site | `https://ivory-digital.uk/{tenant}/` |
| Tenant customer self-service | `https://ivory-digital.uk/{tenant}/booking/{reference}` |
| Tenant staff login | `https://ivory-digital.uk/{tenant}/admin/login` |
| Tenant admin dashboard | `https://ivory-digital.uk/{tenant}/admin` |

## Default Platform Login
- Email: `admin@ivory-digital.uk`
- Password: `IvoryAdmin2025!`  *(change it in production via env `PLATFORM_SUPERADMIN_PASSWORD`)*

---

## Architecture
- **Backend:** FastAPI + Motor (async MongoDB). All routes under `/api`.
- **Frontend:** React (CRA) + Tailwind + shadcn/ui + lucide-react + sonner.
- **Multi-tenancy:** single MongoDB, shared-schema. Every tenant-owned document carries a
  `tenant_id`. Every query/read/write/export is scoped by the tenant resolved **server-side**.
- **Tenant resolution order (server-side, never trusted from the body):**
  1. `X-Tenant: {slug}` request header (the SPA sets this automatically from the URL path),
  2. `?tenant={slug}` query param (dev/testing & for `<a>`/download links such as `.ics`),
  3. Host subdomain (kept as a future option).
- **Platform collections** (`tenants`, `platform_users`) sit outside tenant scope.
- **Isolation** is proven by `backend/../tests/poc_isolation.py` (35 assertions).

## Trials & Status
- New company defaults to `trial` for **7 days** (`trial_started_at` / `trial_ends_at`).
- Statuses: `trial | active | expired | suspended`.
- `expired` → tenant admin can still **log in and read**, but management actions are blocked
  and a "Your trial has ended" screen is shown; the public site shows "temporarily unavailable".
- `suspended` → public site + admin fully locked with a notice.
- The platform panel can **extend trial**, **convert to active**, **suspend/unsuspend**,
  **reset owner password**, **impersonate**, and **delete**.

## White-label Branding (per tenant)
- Brand name, tagline, footer credit, primary/accent colours, and **logo upload** (stored as
  base64 in Mongo — no external object storage needed).
- Applied to the public site, admin panel and (when SMTP configured) branded HTML emails.

---

## ➕ How to Add a New Client (Checklist)

Because we use **path-based** routing, most clients need **no DNS at all** — they simply live at
`ivory-digital.uk/{their-name}`. A separate real subdomain/custom-domain is optional.

### A. Standard (path-based) — the usual case
1. Log in to the platform panel: `https://ivory-digital.uk/superadmin`.
2. Click **New Company** and enter:
   - Company name, **URL name** (the `{tenant}` slug, e.g. `superbrides`),
   - Owner email + a temporary password,
   - Trial length (default 7 days) and initial number of locations.
3. Done. The tenant is auto-seeded with location(s), default opening hours, appointment types
   and the standard booking questions. Share these links with the client:
   - Public: `https://ivory-digital.uk/{tenant}/`
   - Admin: `https://ivory-digital.uk/{tenant}/admin/login`
4. The client logs in and sets their branding (Branding page), availability, deposits, etc.

### B. Optional — give a client a real subdomain or custom domain
1. **Hostinger DNS:** create an `A`/`CNAME` record (e.g. `superbrides.ivory-digital.uk`) → your
   TrueNAS/public IP.
2. **TrueNAS Nginx Proxy Manager:** add a Proxy Host for that hostname → this stack's frontend
   (`frontend:80`, published on host `:8080`). **Forward the original Host header** and the
   `X-Forwarded-*` headers:
   ```
   proxy_set_header Host $host;
   proxy_set_header X-Real-IP $remote_addr;
   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   proxy_set_header X-Forwarded-Proto $scheme;
   ```
3. **SSL:** request a Let's Encrypt certificate for that exact hostname in NPM.
4. In the platform panel, edit the company and set its **Custom Domain** to match.

---

## 🚀 Deployment (TrueNAS / Dockge)

1. Push this repo to GitHub and pull it into Dockge (or clone on the host).
2. Create a `.env` next to `docker-compose.yml`:
   ```
   REACT_APP_BACKEND_URL=https://ivory-digital.uk
   JWT_SECRET=<long-random-string>
   PLATFORM_SUPERADMIN_EMAIL=admin@ivory-digital.uk
   PLATFORM_SUPERADMIN_PASSWORD=<your-strong-password>
   CORS_ORIGINS=*
   # Optional PayPal card checkout (leave empty to keep the hook disabled):
   PAYPAL_CLIENT_ID=
   PAYPAL_SECRET=
   PAYPAL_MODE=sandbox
   ```
3. `docker compose up -d --build`. Services:
   - `frontend` (Nginx serving the SPA, proxies `/api` → backend) on host port **8080**,
   - `backend` (FastAPI) on the internal network,
   - `mongo` (persistent volume `mongo_data`),
   - `backup` (nightly `mongodump`, gzip, ~30-day retention into `./backups`).
4. In **Nginx Proxy Manager**, add a Proxy Host for `ivory-digital.uk` → `frontend:80` (or host
   `:8080`), forwarding the original Host header (see snippet above), and enable SSL.

> The frontend container already proxies `/api/*` to the backend, so NPM only needs to point at
> the frontend. If you prefer to route `/api` directly to the backend in NPM, forward `/api` →
> `backend:8001` and everything else → `frontend:80`.

## Dependencies note
Backend dependencies are pinned in **both** `backend/requirements.txt` and
`backend/requirements-docker.txt` (the Docker image installs from the latter).

## Local development / testing without DNS
Select a tenant with the `?tenant={slug}` query param or an `X-Tenant` header, e.g.
`GET /api/shops?tenant=superbrides`. The SPA does this automatically from the URL path.

## Tenant isolation test
```
python tests/poc_isolation.py
```
Creates two tenants and asserts (35 checks) that one can never read/write the other's data,
plus trial/suspend/expire gating and platform actions.

## Payments
Per tenant, up to 3 methods: **PayPal.me link**, **bank transfer**, **pay in person** (no keys
needed) and **PayPal card checkout** (REST v2 via httpx — set `PAYPAL_CLIENT_ID`/`PAYPAL_SECRET`
to enable; left as a clean hook otherwise). Currency defaults to GBP.
