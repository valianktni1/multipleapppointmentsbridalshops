import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import asyncio
import smtplib
import secrets
import csv
import uuid
import re
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
from typing import List, Optional, Annotated

import bcrypt
import jwt
import pyotp
import qrcode
import io
import base64
import httpx
from bson import ObjectId
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field, BeforeValidator, EmailStr
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient

# ------------------------------------------------------------------ config
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
JWT_ALG = "HS256"
MAX_ADMINS = 4  # non-superadmin admins per tenant
TRIAL_DAYS = 7
DEFAULT_FOOTER_CREDIT = os.environ.get("PLATFORM_FOOTER_CREDIT", "Designed & Hosted by IvoryDigital")
RESERVED_SLUGS = {"superadmin", "admin", "api", "platform", "static", "assets", "www", "app", "booking"}

# ------------------------------------------------------------------ billing config
CURRENCY = "GBP"
CURRENCY_SYMBOL = "£"
PRESET_PLANS = [
    {"tier": "essential", "name": "Essential", "monthly": 15.0, "annual": 140.0,
     "description": "Booking system — Essential plan"},
    {"tier": "professional", "name": "Professional", "monthly": 26.0, "annual": 285.0,
     "description": "Booking system — Professional plan"},
]
COMPANY_DEFAULTS = {
    "key": "company",
    "heading": "Weddings By Mark / Ivory Digital",
    "address": "220 Ashurst Road\nManchester\nM22 5AX",
    "email": "admin@ivory-digital.uk",
    "bank_account_name": "Mark Powell",
    "bank_name": "Tide / ClearBank Sole Trader business account",
    "bank_sort_code": "04-06-05",
    "bank_account_no": "20315075",
    "vat_number": "",
    "payment_terms": "Payment due by the invoice due date. Please use the invoice number as your payment reference.",
    "invoice_prefix": "INV-",
    "next_seq": 1000,
}

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI()
api = APIRouter(prefix="/api")

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# ------------------------------------------------------------------ helpers
PyObjectId = Annotated[str, BeforeValidator(str)]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(v) -> Optional[datetime]:
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    if isinstance(v, str):
        try:
            d = datetime.fromisoformat(v.replace("Z", "+00:00"))
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except Exception:
            return None
    return None


def add_cycle(dt: datetime, cycle: str, count: int = 1) -> datetime:
    """Advance a date by whole months (monthly) or years (annual), clamping the
    day to the last valid day of the target month (e.g. 31 Jan + 1 month -> 28/29 Feb)."""
    if dt is None:
        dt = now_utc()
    if cycle == "annual":
        months = 12 * count
    else:
        months = 1 * count
    y = dt.year + (dt.month - 1 + months) // 12
    m = (dt.month - 1 + months) % 12 + 1
    # last day of target month
    if m == 12:
        last_day = 31
    else:
        last_day = (datetime(y, m + 1, 1, tzinfo=timezone.utc) - timedelta(days=1)).day
    d = min(dt.day, last_day)
    return dt.replace(year=y, month=m, day=d)


def fmt_date(dt) -> str:
    d = parse_dt(dt) if not isinstance(dt, datetime) else dt
    return d.strftime("%d %b %Y") if d else "\u2014"


def money(amount) -> str:
    try:
        return f"{CURRENCY_SYMBOL}{float(amount):,.2f}"
    except Exception:
        return f"{CURRENCY_SYMBOL}0.00"




def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_token(user_id: str, ttype: str = "access", scope: str = "tenant", minutes: int = 60 * 12) -> str:
    payload = {"sub": user_id, "type": ttype, "scope": scope, "exp": now_utc() + timedelta(minutes=minutes)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])


def oid(v: str) -> ObjectId:
    try:
        return ObjectId(v)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid id")


def clean(doc: dict) -> dict:
    if not doc:
        return doc
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    doc.pop("password_hash", None)
    doc.pop("totp_secret", None)
    doc.pop("smtp_password", None)
    return doc


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return s[:40] or "tenant"


# ------------------------------------------------------------------ tenant resolution
def _slug_from_host(host: str) -> Optional[str]:
    if not host:
        return None
    host = host.split(":")[0].lower()
    parts = host.split(".")
    # e.g. superbrides.ivory-digital.uk -> superbrides (3+ labels, first not reserved)
    if len(parts) >= 3 and parts[0] not in RESERVED_SLUGS:
        return parts[0]
    return None


def _slug_from_request(request: Request) -> Optional[str]:
    # priority: X-Tenant header -> ?tenant= query -> Host subdomain
    slug = request.headers.get("X-Tenant") or request.query_params.get("tenant")
    if slug:
        return slug.strip().lower()
    return _slug_from_host(request.headers.get("host", ""))


async def resolve_tenant(request: Request) -> dict:
    """Resolve the current tenant document from the request. Raises 404 if unknown."""
    slug = _slug_from_request(request)
    if not slug:
        raise HTTPException(status_code=400, detail="No tenant specified")
    tenant = await db.tenants.find_one({"slug": slug})
    if not tenant:
        raise HTTPException(status_code=404, detail="Company not found")
    return tenant


def effective_status(tenant: dict) -> str:
    """Compute the live status, converting trial->expired when the trial window has passed."""
    st = tenant.get("status", "trial")
    if st == "trial":
        ends = parse_dt(tenant.get("trial_ends_at"))
        if ends and now_utc() >= ends:
            return "expired"
        return "trial"
    return st


def trial_days_remaining(tenant: dict) -> Optional[int]:
    if tenant.get("status") != "trial":
        return None
    ends = parse_dt(tenant.get("trial_ends_at"))
    if not ends:
        return None
    delta = ends - now_utc()
    return max(0, delta.days + (1 if delta.seconds > 0 else 0)) if delta.total_seconds() > 0 else 0


def tenant_public(tenant: dict) -> dict:
    b = tenant.get("branding", {}) or {}
    return {
        "id": str(tenant["_id"]),
        "slug": tenant["slug"],
        "name": tenant.get("name", ""),
        "status": effective_status(tenant),
        "plan": tenant.get("plan", "trial"),
        "trial_days_remaining": trial_days_remaining(tenant),
        "trial_ends_at": tenant.get("trial_ends_at"),
        "max_locations": int(tenant.get("max_locations") or 1),
        "branding": {
            "brand_name": b.get("brand_name") or tenant.get("name", ""),
            "logo_url": b.get("logo_url", ""),
            "logo": b.get("logo_data") or b.get("logo_url", ""),
            "primary_color": b.get("primary_color", "#B0904F"),
            "accent_color": b.get("accent_color", "#977937"),
            "font": b.get("font", ""),
            "tagline": b.get("tagline", ""),
            "footer_credit": b.get("footer_credit") or DEFAULT_FOOTER_CREDIT,
        },
    }


# ------------------------------------------------------------------ auth dependencies
async def get_current_user(request: Request) -> dict:
    """Authenticated TENANT admin/superadmin."""
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or payload.get("scope") != "tenant":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": oid(payload["sub"])})
        if not user or not user.get("active", True):
            raise HTTPException(status_code=401, detail="User not found or disabled")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_company_superadmin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "superadmin":
        raise HTTPException(status_code=403, detail="Company owner access required")
    return user


async def get_user_tenant(user: dict = Depends(get_current_user)) -> dict:
    tenant = await db.tenants.find_one({"_id": oid(user["tenant_id"])})
    if not tenant:
        raise HTTPException(status_code=404, detail="Company not found")
    return tenant


async def require_tenant_write(user: dict = Depends(get_current_user)) -> dict:
    """Guard for management mutations: block when trial expired or suspended."""
    tenant = await db.tenants.find_one({"_id": oid(user["tenant_id"])})
    if not tenant:
        raise HTTPException(status_code=404, detail="Company not found")
    st = effective_status(tenant)
    if st == "suspended":
        raise HTTPException(status_code=403, detail="This account has been suspended. Please contact support.")
    if st == "expired":
        raise HTTPException(status_code=403, detail="Your trial has ended. Contact us to continue.")
    return user


async def get_current_platform(request: Request) -> dict:
    """Authenticated PLATFORM superadmin (SaaS owner)."""
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else None
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access" or payload.get("scope") != "platform":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.platform_users.find_one({"_id": oid(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# tenant_id scope helpers
def tid(user_or_tenant: dict) -> str:
    return str(user_or_tenant.get("tenant_id") or user_or_tenant["_id"])


# ------------------------------------------------------------------ settings (per-tenant)
SETTINGS_DEFAULTS = {
    "business_email": "",
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_password": "",
    "from_name": "",
    "public_url": "",
    "feed_token": "",
    "notify_customer_on_booking": False,
    "notify_shop_on_booking": False,
    "notify_on_confirm": False,
    "notify_reminder": False,
    "payment_method": "off",
    "payment_methods": [],
    "paypal_me_url": "",
    "bank_account_name": "",
    "bank_sort_code": "",
    "bank_account_number": "",
    "payment_currency": "GBP",
}


async def get_settings(tenant_id: str) -> dict:
    s = await db.settings.find_one({"tenant_id": tenant_id})
    if not s:
        s = {"tenant_id": tenant_id, **SETTINGS_DEFAULTS}
        await db.settings.insert_one(s)
        return s
    missing = {k: v for k, v in SETTINGS_DEFAULTS.items() if k not in s}
    if missing:
        await db.settings.update_one({"tenant_id": tenant_id}, {"$set": missing})
        s.update(missing)
    return s


def brand_name_of(tenant: dict) -> str:
    b = tenant.get("branding", {}) or {}
    return b.get("brand_name") or tenant.get("name", "Appointments")


def manage_link(settings: dict, ref: str) -> str:
    base = (settings.get("public_url") or "").rstrip("/")
    return f"\n\nView or reschedule your appointment: {base}/booking/{ref}" if base else ""


def manage_url(settings: dict, ref: str) -> Optional[str]:
    base = (settings.get("public_url") or "").rstrip("/")
    return f"{base}/booking/{ref}" if base else None


# ------------------------------------------------------------------ email
def _logo_bytes(tenant: dict) -> Optional[bytes]:
    b = tenant.get("branding", {}) or {}
    data = b.get("logo_data")
    if data and "," in data:
        try:
            return base64.b64decode(data.split(",", 1)[1])
        except Exception:
            return None
    return None


def render_email(tenant: dict, heading: str, paragraphs: List[str], cta: Optional[dict] = None) -> str:
    b = tenant.get("branding", {}) or {}
    brand = brand_name_of(tenant)
    gold = b.get("primary_color", "#B0904F")
    have_logo = bool(_logo_bytes(tenant))
    logo = ('<img src="cid:brandlogo" alt="%s" style="max-width:230px;height:auto;margin:0 auto;display:block;">' % brand) if have_logo else \
           ('<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:34px;color:%s;font-style:italic;">%s</div>' % (gold, brand))
    body_html = "".join(
        f'<p style="margin:0 0 16px;font-family:Georgia,serif;font-size:16px;line-height:1.7;color:#3d3833;">{p}</p>'
        for p in paragraphs
    )
    cta_html = ""
    if cta and cta.get("url"):
        cta_html = (
            f'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 24px;">'
            f'<tr><td style="background:{gold};">'
            f'<a href="{cta["url"]}" style="display:inline-block;padding:14px 34px;font-family:Arial,sans-serif;'
            f'font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#fff;text-decoration:none;">'
            f'{cta.get("label","View")}</a></td></tr></table>'
        )
    tagline = b.get("tagline", "Bridal Appointments")
    return f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f3ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ee;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #ece4d8;">
<tr><td style="padding:38px 40px 10px;text-align:center;border-bottom:1px solid #ece4d8;">{logo}
<div style="font-family:Arial,sans-serif;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:{gold};margin-top:14px;">{tagline}</div>
</td></tr>
<tr><td style="padding:36px 40px 8px;">
<h1 style="margin:0 0 22px;font-family:Georgia,serif;font-weight:normal;font-size:26px;color:#2a2521;">{heading}</h1>
{body_html}{cta_html}
</td></tr>
<tr><td style="padding:22px 40px 34px;border-top:1px solid #ece4d8;text-align:center;">
<p style="margin:0;font-family:Georgia,serif;font-size:15px;color:{gold};">With love, {brand}</p>
</td></tr>
</table></td></tr></table></body></html>"""


def _smtp_send(cfg: dict, to: str, subject: str, body: str, html: Optional[str] = None,
               logo: Optional[bytes] = None, raise_on_error: bool = False,
               attachments: Optional[List[dict]] = None) -> bool:
    if not cfg or not cfg.get("smtp_host") or not cfg.get("from_addr"):
        logger.info("Email skipped (SMTP not configured): %s -> %s", subject, to)
        if raise_on_error:
            raise RuntimeError("SMTP is not configured — please enter your host, sender email, username and password.")
        return False
    host = (cfg["smtp_host"] or "").strip()
    port = int(cfg.get("smtp_port", 587) or 587)
    user = (cfg.get("smtp_user") or "").strip()
    # App passwords (Gmail/Outlook) are often pasted with spaces; those spaces are not part of the key.
    pwd = (cfg.get("smtp_password") or "").replace(" ", "")
    try:
        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = f"{cfg.get('from_name') or 'Appointments'} <{cfg['from_addr']}>"
        msg["To"] = to
        msg.set_content(body)
        if html:
            msg.add_alternative(html, subtype="html")
            if logo:
                msg.get_payload()[1].add_related(logo, "image", "png", cid="brandlogo")
        # File attachments (e.g. invoice PDF, manual email uploads)
        for att in (attachments or []):
            data = att.get("data")
            if not data:
                continue
            maintype, _, subtype = (att.get("content_type") or "application/octet-stream").partition("/")
            msg.add_attachment(data, maintype=maintype or "application",
                               subtype=subtype or "octet-stream",
                               filename=att.get("filename") or "attachment")
        if port == 465:
            # Implicit TLS (SSL) — used by many providers on 465.
            with smtplib.SMTP_SSL(host, port, timeout=12) as server:
                if user:
                    server.login(user, pwd)
                server.send_message(msg)
        else:
            # STARTTLS (587) or plain (25). Only upgrade if the server advertises it.
            with smtplib.SMTP(host, port, timeout=12) as server:
                server.ehlo()
                if server.has_extn("starttls"):
                    server.starttls()
                    server.ehlo()
                if user:
                    server.login(user, pwd)
                server.send_message(msg)
        logger.info("Email sent: '%s' -> %s via %s:%s", subject, to, host, port)
        return True
    except smtplib.SMTPAuthenticationError as e:
        detail = e.smtp_error.decode() if isinstance(getattr(e, "smtp_error", None), bytes) else str(e)
        logger.error("Email AUTH failed (%s@%s:%s): %s", user or "<no user>", host, port, detail)
        if raise_on_error:
            raise RuntimeError(f"The mail server rejected the username/password (code {getattr(e, 'smtp_code', '')}). "
                               f"Check the SMTP username is your full email and use an app password if 2FA is on. Server said: {detail}")
        return False
    except Exception as e:
        logger.error("Email send FAILED ('%s' -> %s via %s:%s): %s", subject, to, host, port, e)
        if raise_on_error:
            raise RuntimeError(str(e) or "Could not connect to the mail server — check the host and port.")
        return False




def dispatch_email(cfg: Optional[dict], to: str, subject: str, body: str, html: Optional[str] = None, logo: Optional[bytes] = None):
    """Fire-and-forget email so request handlers never block on SMTP.

    Runs the blocking smtplib call in a worker thread. If there is no running
    event loop (e.g. called from a script), sends synchronously.
    """
    if not cfg or not to:
        _smtp_send(cfg, to, subject, body, html, logo)
        return

    async def _runner():
        try:
            await asyncio.to_thread(_smtp_send, cfg, to, subject, body, html, logo)
        except Exception as e:
            logger.error("Background email error: %s", e)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_runner())
    except RuntimeError:
        _smtp_send(cfg, to, subject, body, html, logo)



def cfg_from_user(u: dict, brand: str) -> Optional[dict]:
    if u and u.get("smtp_host"):
        from_addr = u.get("sender_email") or u.get("email")
        return {
            "smtp_host": (u.get("smtp_host") or "").strip(),
            "smtp_port": u.get("smtp_port", 587),
            # Fall back to the from-address if no explicit SMTP username was given
            # (most providers use the full email address as the login username).
            "smtp_user": (u.get("smtp_user") or from_addr or "").strip(),
            "smtp_password": u.get("smtp_password"),
            "from_addr": from_addr,
            "from_name": u.get("sender_name") or brand,
        }
    return None


def cfg_from_settings(s: dict, brand: str) -> Optional[dict]:
    if s and s.get("smtp_host") and s.get("business_email"):
        return {
            "smtp_host": (s.get("smtp_host") or "").strip(),
            "smtp_port": s.get("smtp_port", 587),
            "smtp_user": (s.get("smtp_user") or s.get("business_email") or "").strip(),
            "smtp_password": s.get("smtp_password"),
            "from_addr": s.get("business_email"),
            "from_name": s.get("from_name") or brand,
        }
    return None


async def resolve_cfg(tenant: dict, preferred_user: Optional[dict] = None) -> Optional[dict]:
    brand = brand_name_of(tenant)
    tenant_id = str(tenant["_id"])
    if preferred_user:
        c = cfg_from_user(preferred_user, brand)
        if c:
            return c
    c = cfg_from_settings(await get_settings(tenant_id), brand)
    if c:
        return c
    u = await db.users.find_one({"tenant_id": tenant_id, "smtp_host": {"$nin": [None, ""]}})
    return cfg_from_user(u, brand) if u else None


# ------------------------------------------------------------------ ICS calendar helpers
def _to_min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _to_hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _ics_dt(date_str: str, time_str: str) -> str:
    return date_str.replace("-", "") + "T" + time_str.replace(":", "") + "00"


def _ics_escape(s: str) -> str:
    return (s or "").replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def booking_to_vevent(b: dict) -> str:
    start = _ics_dt(b["date"], b["start_time"])
    end = _ics_dt(b["date"], _to_hhmm(_to_min(b["start_time"]) + int(b.get("duration", 60))))
    loc = _ics_escape(b.get("shop_address") or b.get("shop_name", ""))
    summ = _ics_escape(f"{b.get('appointment_type_name', 'Appointment')} — {b.get('shop_name', '')}")
    desc = _ics_escape(f"Reference {b.get('reference', '')}. {b.get('customer_name', '')}.")
    return "\r\n".join([
        "BEGIN:VEVENT", f"UID:{b.get('reference', uuid.uuid4().hex)}@ivory",
        f"DTSTAMP:{start}", f"DTSTART:{start}", f"DTEND:{end}",
        f"SUMMARY:{summ}", f"LOCATION:{loc}", f"DESCRIPTION:{desc}", "END:VEVENT",
    ])


def wrap_ics(events: List[str]) -> str:
    head = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Ivory Digital//Appointments//EN\r\nCALSCALE:GREGORIAN\r\n"
    return head + ("\r\n".join(events) + "\r\n" if events else "") + "END:VCALENDAR\r\n"


# ------------------------------------------------------------------ pydantic models
class LoginIn(BaseModel):
    email: EmailStr
    password: str


class Verify2FAIn(BaseModel):
    mfa_token: str
    code: str


class ChangePwIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class Enable2FAIn(BaseModel):
    code: str


class AdminCreateIn(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class AdminUpdateIn(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None
    password: Optional[str] = None


class AppointmentTypeIn(BaseModel):
    name: str
    duration: int
    description: Optional[str] = ""
    active: bool = True


class AvailabilityIn(BaseModel):
    hours: dict
    slot_step: int = 30
    capacity: int = 1
    buffer: int = 0


class BlockedDateIn(BaseModel):
    date: str
    reason: Optional[str] = ""
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class BookingIn(BaseModel):
    shop_id: str
    appointment_type_id: str
    date: str
    start_time: str
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    notes: Optional[str] = ""
    answers: Optional[List[dict]] = None


class BookingUpdateIn(BaseModel):
    status: Optional[str] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    admin_notes: Optional[str] = None
    payment_status: Optional[str] = None


class ShopCreateIn(BaseModel):
    name: str
    role_label: Optional[str] = "Appointments"
    address: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    blurb: Optional[str] = ""
    hours_text: Optional[str] = ""


class ShopUpdateIn(BaseModel):
    name: Optional[str] = None
    role_label: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    blurb: Optional[str] = None
    photo_url: Optional[str] = None
    what_to_expect: Optional[str] = None
    hours_text: Optional[str] = None
    deposit_amount: Optional[float] = None
    deposit_required: Optional[bool] = None


class QuestionsIn(BaseModel):
    questions: List[dict]


class WaitlistIn(BaseModel):
    shop_id: str
    appointment_type_id: Optional[str] = None
    date: Optional[str] = None
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    notes: Optional[str] = ""


class WaitlistUpdateIn(BaseModel):
    status: str


class SettingsIn(BaseModel):
    business_email: Optional[str] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    from_name: Optional[str] = None
    public_url: Optional[str] = None
    notify_customer_on_booking: Optional[bool] = None
    notify_shop_on_booking: Optional[bool] = None
    notify_on_confirm: Optional[bool] = None
    notify_reminder: Optional[bool] = None
    payment_method: Optional[str] = None
    payment_methods: Optional[List[str]] = None
    paypal_me_url: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_sort_code: Optional[str] = None
    bank_account_number: Optional[str] = None
    payment_currency: Optional[str] = None


class ProfileIn(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None


class MyEmailSettingsIn(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    sender_email: Optional[EmailStr] = None
    sender_name: Optional[str] = None


class TestEmailIn(BaseModel):
    to: EmailStr


class BrandingIn(BaseModel):
    brand_name: Optional[str] = None
    logo_data: Optional[str] = None  # base64 data URL
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None
    font: Optional[str] = None
    tagline: Optional[str] = None
    footer_credit: Optional[str] = None


# ---- platform models
class TenantCreateIn(BaseModel):
    name: str
    slug: Optional[str] = None
    custom_domain: Optional[str] = None
    owner_email: EmailStr
    owner_password: str = Field(min_length=6)
    owner_name: Optional[str] = None
    plan: str = "trial"
    trial_days: int = TRIAL_DAYS
    locations: int = 1


class TenantUpdateIn(BaseModel):
    name: Optional[str] = None
    custom_domain: Optional[str] = None
    status: Optional[str] = None
    max_locations: Optional[int] = None


class ExtendTrialIn(BaseModel):
    days: int = 7


class ResetOwnerPwIn(BaseModel):
    password: str = Field(min_length=6)


# =================================================================== PLATFORM ROUTES
@api.post("/platform/login")
async def platform_login(body: LoginIn):
    email = body.email.lower().strip()
    user = await db.platform_users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("totp_enabled"):
        mfa_token = create_token(str(user["_id"]), ttype="mfa", scope="platform", minutes=5)
        return {"mfa_required": True, "mfa_token": mfa_token}
    token = create_token(str(user["_id"]), scope="platform")
    return {"access_token": token, "user": clean(user)}


@api.post("/platform/2fa/verify")
async def platform_verify_2fa(body: Verify2FAIn):
    try:
        payload = decode_token(body.mfa_token)
        if payload.get("type") != "mfa" or payload.get("scope") != "platform":
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="2FA session expired, please log in again")
    user = await db.platform_users.find_one({"_id": oid(payload["sub"])})
    if not user or not user.get("totp_secret"):
        raise HTTPException(status_code=400, detail="2FA not configured")
    if not pyotp.TOTP(user["totp_secret"]).verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    token = create_token(str(user["_id"]), scope="platform")
    return {"access_token": token, "user": clean(user)}


@api.get("/platform/me")
async def platform_me(user: dict = Depends(get_current_platform)):
    return clean(user)


async def _tenant_overview(t: dict) -> dict:
    tenant_id = str(t["_id"])
    loc = await db.shops.count_documents({"tenant_id": tenant_id})
    bk = await db.bookings.count_documents({"tenant_id": tenant_id})
    owner = await db.users.find_one({"tenant_id": tenant_id, "role": "superadmin"})
    d = tenant_public(t)
    b = t.get("billing") or {}
    d.update({
        "custom_domain": t.get("custom_domain", ""),
        "locations_count": loc,
        "bookings_count": bk,
        "created_at": t.get("created_at"),
        "owner_email": owner.get("email") if owner else "",
        "raw_status": t.get("status"),
        "billing": {
            "plan_tier": b.get("plan_tier"),
            "plan_name": b.get("plan_name"),
            "price": b.get("price"),
            "cycle": b.get("cycle"),
            "currency": b.get("currency", CURRENCY),
            "start_date": b.get("start_date"),
            "next_due_date": b.get("next_due_date"),
            "active": bool(b.get("active")),
        } if b else None,
    })
    return d


@api.get("/platform/tenants")
async def platform_list_tenants(user: dict = Depends(get_current_platform)):
    docs = await db.tenants.find().sort("created_at", -1).to_list(500)
    return [await _tenant_overview(t) for t in docs]


@api.get("/platform/stats")
async def platform_stats(user: dict = Depends(get_current_platform)):
    docs = await db.tenants.find().to_list(500)
    counts = {"total": len(docs), "trial": 0, "active": 0, "expired": 0, "suspended": 0}
    for t in docs:
        counts[effective_status(t)] = counts.get(effective_status(t), 0) + 1
    total_bookings = await db.bookings.count_documents({})
    counts["total_bookings"] = total_bookings
    return counts


@api.post("/platform/tenants")
async def platform_create_tenant(body: TenantCreateIn, user: dict = Depends(get_current_platform)):
    slug = slugify(body.slug or body.name)
    if slug in RESERVED_SLUGS:
        raise HTTPException(status_code=400, detail="That URL name is reserved, please choose another")
    if await db.tenants.find_one({"slug": slug}):
        raise HTTPException(status_code=400, detail="A company with that URL name already exists")
    owner_email = body.owner_email.lower().strip()
    started = now_utc()
    ends = started + timedelta(days=max(1, body.trial_days))
    tenant_doc = {
        "name": body.name.strip(),
        "slug": slug,
        "custom_domain": (body.custom_domain or "").strip().lower(),
        "status": body.plan if body.plan in ("trial", "active") else "trial",
        "plan": body.plan if body.plan in ("trial", "active") else "trial",
        "trial_started_at": started.isoformat(),
        "trial_ends_at": ends.isoformat(),
        "branding": {
            "brand_name": body.name.strip(),
            "logo_url": "",
            "logo_data": "",
            "primary_color": "#B0904F",
            "accent_color": "#977937",
            "font": "",
            "tagline": "Bridal Appointments",
            "footer_credit": DEFAULT_FOOTER_CREDIT,
        },
        "created_at": started.isoformat(),
        "max_locations": max(1, min(50, int(body.locations or 1))),
    }
    res = await db.tenants.insert_one(tenant_doc)
    tenant_id = str(res.inserted_id)
    tenant_doc["_id"] = res.inserted_id

    # owner (company superadmin)
    if await db.users.find_one({"tenant_id": tenant_id, "email": owner_email}):
        pass
    else:
        await db.users.insert_one({
            "tenant_id": tenant_id,
            "name": (body.owner_name or "Owner").strip(),
            "email": owner_email,
            "password_hash": hash_password(body.owner_password),
            "role": "superadmin",
            "active": True,
            "totp_enabled": False,
            "totp_secret": None,
            "created_at": started.isoformat(),
        })

    await _seed_tenant(tenant_id, max(1, min(50, body.locations)))
    fresh = await db.tenants.find_one({"_id": res.inserted_id})
    return await _tenant_overview(fresh)


@api.patch("/platform/tenants/{tenant_id}")
async def platform_update_tenant(tenant_id: str, body: TenantUpdateIn, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    update = {}
    if body.name is not None:
        update["name"] = body.name.strip()
    if body.custom_domain is not None:
        update["custom_domain"] = body.custom_domain.strip().lower()
    if body.status is not None:
        if body.status not in ("trial", "active", "expired", "suspended"):
            raise HTTPException(status_code=400, detail="Invalid status")
        update["status"] = body.status
        if body.status == "active":
            update["plan"] = "active"
    if body.max_locations is not None:
        if not (1 <= body.max_locations <= 50):
            raise HTTPException(status_code=400, detail="Shop allowance must be between 1 and 50")
        current = await db.shops.count_documents({"tenant_id": str(t["_id"])})
        if body.max_locations < current:
            raise HTTPException(status_code=400, detail=f"This company already has {current} shops. Delete some first or set the allowance to at least {current}.")
        update["max_locations"] = body.max_locations
    if update:
        await db.tenants.update_one({"_id": t["_id"]}, {"$set": update})
    fresh = await db.tenants.find_one({"_id": t["_id"]})
    return await _tenant_overview(fresh)


@api.post("/platform/tenants/{tenant_id}/extend-trial")
async def platform_extend_trial(tenant_id: str, body: ExtendTrialIn, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    base = parse_dt(t.get("trial_ends_at")) or now_utc()
    if base < now_utc():
        base = now_utc()
    new_ends = base + timedelta(days=max(1, body.days))
    await db.tenants.update_one({"_id": t["_id"]}, {"$set": {"trial_ends_at": new_ends.isoformat(), "status": "trial", "plan": "trial"}})
    fresh = await db.tenants.find_one({"_id": t["_id"]})
    return await _tenant_overview(fresh)


@api.post("/platform/tenants/{tenant_id}/convert-active")
async def platform_convert_active(tenant_id: str, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.tenants.update_one({"_id": t["_id"]}, {"$set": {"status": "active", "plan": "active"}})
    fresh = await db.tenants.find_one({"_id": t["_id"]})
    return await _tenant_overview(fresh)


@api.post("/platform/tenants/{tenant_id}/suspend")
async def platform_suspend(tenant_id: str, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.tenants.update_one({"_id": t["_id"]}, {"$set": {"status": "suspended"}})
    fresh = await db.tenants.find_one({"_id": t["_id"]})
    return await _tenant_overview(fresh)


@api.post("/platform/tenants/{tenant_id}/unsuspend")
async def platform_unsuspend(tenant_id: str, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    # restore: if trial window still valid -> trial, else active if converted, else expired
    ends = parse_dt(t.get("trial_ends_at"))
    if t.get("plan") == "active":
        st = "active"
    elif ends and now_utc() < ends:
        st = "trial"
    else:
        st = "expired"
    await db.tenants.update_one({"_id": t["_id"]}, {"$set": {"status": st}})
    fresh = await db.tenants.find_one({"_id": t["_id"]})
    return await _tenant_overview(fresh)


@api.post("/platform/tenants/{tenant_id}/reset-owner-password")
async def platform_reset_owner_pw(tenant_id: str, body: ResetOwnerPwIn, user: dict = Depends(get_current_platform)):
    owner = await db.users.find_one({"tenant_id": tenant_id, "role": "superadmin"})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner account not found")
    await db.users.update_one({"_id": owner["_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    return {"ok": True}


@api.post("/platform/tenants/{tenant_id}/impersonate")
async def platform_impersonate(tenant_id: str, user: dict = Depends(get_current_platform)):
    owner = await db.users.find_one({"tenant_id": tenant_id, "role": "superadmin"})
    if not owner:
        raise HTTPException(status_code=404, detail="Owner account not found")
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    token = create_token(str(owner["_id"]), scope="tenant")
    return {"access_token": token, "user": clean(owner), "tenant_slug": t["slug"]}


@api.delete("/platform/tenants/{tenant_id}")
async def platform_delete_tenant(tenant_id: str, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    for coll in ("users", "shops", "availability", "appointment_types", "bookings", "blocked_dates", "waitlist", "settings"):
        await db[coll].delete_many({"tenant_id": tenant_id})
    await db.tenants.delete_one({"_id": t["_id"]})
    return {"ok": True}


# ---- platform email (SMTP) settings ----
PLATFORM_EMAIL_DEFAULTS = {
    "smtp_host": "", "smtp_port": 465, "sender_email": "", "smtp_password": "", "sender_name": "",
}


async def get_platform_email() -> dict:
    s = await db.platform_settings.find_one({"key": "email"})
    if not s:
        s = {"key": "email", **PLATFORM_EMAIL_DEFAULTS}
        await db.platform_settings.insert_one(s)
    for k, v in PLATFORM_EMAIL_DEFAULTS.items():
        s.setdefault(k, v)
    return s


class EmailSettingsIn(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    sender_email: Optional[EmailStr] = None
    smtp_password: Optional[str] = None
    sender_name: Optional[str] = None


def _cfg_from_email_doc(s: dict, brand: str) -> Optional[dict]:
    if s and s.get("smtp_host") and s.get("sender_email"):
        return {
            "smtp_host": (s.get("smtp_host") or "").strip(),
            "smtp_port": s.get("smtp_port", 465),
            "smtp_user": (s.get("sender_email") or "").strip(),  # Hostinger-style: email = username
            "smtp_password": s.get("smtp_password"),
            "from_addr": s.get("sender_email"),
            "from_name": s.get("sender_name") or brand,
        }
    return None


@api.get("/platform/email-settings")
async def platform_get_email(user: dict = Depends(get_current_platform)):
    s = await get_platform_email()
    return {
        "smtp_host": s.get("smtp_host", ""),
        "smtp_port": s.get("smtp_port", 465),
        "sender_email": s.get("sender_email", ""),
        "sender_name": s.get("sender_name", ""),
        "smtp_password": "********" if s.get("smtp_password") else "",
    }


@api.put("/platform/email-settings")
async def platform_put_email(body: EmailSettingsIn, user: dict = Depends(get_current_platform)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update.get("smtp_password") == "********":
        update.pop("smtp_password")
    if "sender_email" in update:
        update["sender_email"] = update["sender_email"].lower().strip()
    await db.platform_settings.update_one({"key": "email"}, {"$set": {**update, "key": "email"}}, upsert=True)
    return {"ok": True}


@api.post("/platform/email-settings/test")
async def platform_test_email(body: TestEmailIn, user: dict = Depends(get_current_platform)):
    s = await get_platform_email()
    brand = os.environ.get("PLATFORM_SUPERADMIN_NAME", "Ivory Digital")
    cfg = _cfg_from_email_doc(s, brand)
    if not cfg:
        raise HTTPException(status_code=400, detail="Please enter your SMTP server and email address first")
    fake_tenant = {"_id": "platform", "name": brand, "branding": {"brand_name": brand, "tagline": "Platform", "primary_color": "#B0904F"}}
    html = render_email(fake_tenant, "Your email is working",
                        [f"This is a test email from your {brand} platform account (<strong>{cfg['from_addr']}</strong>).",
                         "If you can see this, your outgoing email is configured correctly."])
    try:
        await asyncio.to_thread(_smtp_send, cfg, body.to, f"{brand} — test email",
                                f"Test email from your {brand} platform account ({cfg['from_addr']}).",
                                html, None, True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not send: {e}")
    return {"ok": True}


# =================================================================== BILLING & INVOICING
async def get_company_settings() -> dict:
    s = await db.platform_settings.find_one({"key": "company"})
    if not s:
        s = dict(COMPANY_DEFAULTS)
        await db.platform_settings.insert_one(s)
    for k, v in COMPANY_DEFAULTS.items():
        s.setdefault(k, v)
    return s


async def platform_cfg() -> Optional[dict]:
    s = await get_platform_email()
    brand = os.environ.get("PLATFORM_SUPERADMIN_NAME", "Ivory Digital")
    return _cfg_from_email_doc(s, brand)


class PlanIn(BaseModel):
    plan_tier: str  # essential | professional | custom
    plan_name: str
    price: float
    cycle: str  # monthly | annual


class CompanySettingsIn(BaseModel):
    heading: Optional[str] = None
    address: Optional[str] = None
    email: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_sort_code: Optional[str] = None
    bank_account_no: Optional[str] = None
    vat_number: Optional[str] = None
    payment_terms: Optional[str] = None
    invoice_prefix: Optional[str] = None


class GenerateInvoiceIn(BaseModel):
    send: bool = True


class AttachmentIn(BaseModel):
    filename: str
    content_type: Optional[str] = "application/octet-stream"
    data_base64: str


class ManualEmailIn(BaseModel):
    to: EmailStr
    subject: str
    message: str
    attachments: Optional[List[AttachmentIn]] = None


@api.get("/platform/plans")
async def platform_plans(user: dict = Depends(get_current_platform)):
    return {"currency": CURRENCY, "symbol": CURRENCY_SYMBOL, "plans": PRESET_PLANS}


@api.get("/platform/company-settings")
async def platform_get_company(user: dict = Depends(get_current_platform)):
    s = await get_company_settings()
    s.pop("_id", None)
    s.pop("next_seq", None)
    return s


@api.put("/platform/company-settings")
async def platform_put_company(body: CompanySettingsIn, user: dict = Depends(get_current_platform)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    await db.platform_settings.update_one({"key": "company"}, {"$set": {**update, "key": "company"}}, upsert=True)
    return {"ok": True}


@api.post("/platform/tenants/{tenant_id}/plan")
async def platform_set_plan(tenant_id: str, body: PlanIn, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    if body.cycle not in ("monthly", "annual"):
        raise HTTPException(status_code=400, detail="Cycle must be monthly or annual")
    if body.price < 0:
        raise HTTPException(status_code=400, detail="Price must be a positive number")
    existing = t.get("billing") or {}
    # Keep the original start date if a plan is already active (only the plan details change);
    # otherwise start the billing clock now (option a).
    start = parse_dt(existing.get("start_date")) if existing.get("active") else None
    start = start or now_utc()
    next_due = parse_dt(existing.get("next_due_date")) if existing.get("active") else None
    if not next_due or next_due < now_utc():
        next_due = add_cycle(start, body.cycle)
    billing = {
        "plan_tier": body.plan_tier,
        "plan_name": body.plan_name.strip(),
        "price": round(float(body.price), 2),
        "cycle": body.cycle,
        "currency": CURRENCY,
        "start_date": start.isoformat(),
        "next_due_date": next_due.isoformat(),
        "active": True,
    }
    await db.tenants.update_one({"_id": t["_id"]}, {"$set": {"billing": billing, "status": "active", "plan": "active"}})
    fresh = await db.tenants.find_one({"_id": t["_id"]})
    return await _tenant_overview(fresh)


@api.post("/platform/tenants/{tenant_id}/clear-plan")
async def platform_clear_plan(tenant_id: str, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.tenants.update_one({"_id": t["_id"]}, {"$set": {"billing.active": False}})
    fresh = await db.tenants.find_one({"_id": t["_id"]})
    return await _tenant_overview(fresh)


async def _next_invoice_number(company: dict) -> str:
    doc = await db.platform_settings.find_one_and_update(
        {"key": "company"},
        {"$inc": {"next_seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = (doc or {}).get("next_seq") or COMPANY_DEFAULTS["next_seq"]
    prefix = company.get("invoice_prefix") or "INV-"
    return f"{prefix}{seq}"


def build_invoice_pdf(invoice: dict, company: dict) -> bytes:
    """Render a clean A4 invoice PDF (fpdf2). Uses latin-1 core fonts (£ supported)."""
    from fpdf import FPDF

    def s(txt):  # latin-1 safe
        return str(txt or "").encode("latin-1", "replace").decode("latin-1")

    pdf = FPDF(format="A4", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    gold = (176, 144, 79)
    ink = (42, 37, 33)
    grey = (120, 110, 98)

    # Header — issuer
    pdf.set_xy(15, 16)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*gold)
    pdf.cell(0, 9, s(company.get("heading", "")), ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*grey)
    for line in str(company.get("address", "")).split("\n"):
        if line.strip():
            pdf.cell(0, 5, s(line.strip()), ln=1)
    if company.get("email"):
        pdf.cell(0, 5, s(company["email"]), ln=1)
    if company.get("vat_number"):
        pdf.cell(0, 5, s(f"VAT No: {company['vat_number']}"), ln=1)
    else:
        pdf.cell(0, 5, "Not VAT registered", ln=1)

    # INVOICE title block (right)
    pdf.set_xy(120, 16)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(*ink)
    pdf.cell(75, 12, "INVOICE", align="R", ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*grey)
    pdf.set_x(120)
    pdf.cell(75, 6, s(f"Invoice No:  {invoice.get('number','')}"), align="R", ln=1)
    pdf.set_x(120)
    pdf.cell(75, 6, s(f"Issued:  {fmt_date(invoice.get('issued_date'))}"), align="R", ln=1)
    pdf.set_x(120)
    pdf.cell(75, 6, s(f"Due:  {fmt_date(invoice.get('due_date'))}"), align="R", ln=1)

    # Divider
    pdf.set_draw_color(*gold)
    pdf.set_line_width(0.6)
    pdf.line(15, 58, 195, 58)

    # Bill to
    pdf.set_xy(15, 64)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*gold)
    pdf.cell(0, 5, "BILL TO", ln=1)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*ink)
    pdf.set_x(15)
    pdf.cell(0, 6, s(invoice.get("tenant_name", "")), ln=1)
    if invoice.get("sent_to"):
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*grey)
        pdf.set_x(15)
        pdf.cell(0, 5, s(invoice["sent_to"]), ln=1)

    # Line item table
    y = 92
    pdf.set_xy(15, y)
    pdf.set_fill_color(247, 243, 238)
    pdf.set_text_color(*ink)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(120, 9, "  Description", border=0, fill=True)
    pdf.cell(30, 9, "Billing", border=0, fill=True, align="C")
    pdf.cell(30, 9, "Amount", border=0, fill=True, align="R", ln=1)

    cycle_label = "Annual" if invoice.get("cycle") == "annual" else "Monthly"
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*ink)
    pdf.set_x(15)
    desc = f"  {invoice.get('plan_name','Subscription')}  ({cycle_label} subscription)"
    pdf.cell(120, 11, s(desc))
    pdf.cell(30, 11, cycle_label, align="C")
    pdf.cell(30, 11, s(money(invoice.get("amount", 0))), align="R", ln=1)

    pdf.set_draw_color(230, 224, 214)
    pdf.set_line_width(0.3)
    pdf.line(15, pdf.get_y() + 1, 195, pdf.get_y() + 1)

    # Total
    pdf.set_xy(120, pdf.get_y() + 5)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*ink)
    pdf.cell(45, 9, "Total Due")
    pdf.set_text_color(*gold)
    pdf.cell(30, 9, s(money(invoice.get("amount", 0))), align="R", ln=1)

    # Payment details
    pdf.set_xy(15, pdf.get_y() + 14)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*gold)
    pdf.cell(0, 5, "PAYMENT DETAILS", ln=1)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*ink)
    rows = [
        ("Account Name", company.get("bank_account_name", "")),
        ("Bank", company.get("bank_name", "")),
        ("Sort Code", company.get("bank_sort_code", "")),
        ("Account No", company.get("bank_account_no", "")),
        ("Reference", invoice.get("number", "")),
    ]
    for label, val in rows:
        if not val:
            continue
        pdf.set_x(15)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*grey)
        pdf.cell(35, 6, s(label))
        pdf.set_text_color(*ink)
        pdf.cell(0, 6, s(val), ln=1)

    if company.get("payment_terms"):
        pdf.set_xy(15, pdf.get_y() + 6)
        pdf.set_font("Helvetica", "I", 9)
        pdf.set_text_color(*grey)
        pdf.multi_cell(180, 5, s(company["payment_terms"]))

    # Footer thank-you
    pdf.set_xy(15, 272)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*gold)
    pdf.cell(0, 5, s(f"Thank you for your business  |  {company.get('heading','')}"), align="C")

    out = pdf.output()
    return bytes(out)


def invoice_public(inv: dict) -> dict:
    return {
        "id": str(inv["_id"]),
        "number": inv.get("number"),
        "tenant_id": inv.get("tenant_id"),
        "tenant_name": inv.get("tenant_name"),
        "issued_date": inv.get("issued_date"),
        "due_date": inv.get("due_date"),
        "period_key": inv.get("period_key"),
        "plan_name": inv.get("plan_name"),
        "amount": inv.get("amount"),
        "currency": inv.get("currency", CURRENCY),
        "cycle": inv.get("cycle"),
        "status": inv.get("status"),
        "sent_to": inv.get("sent_to"),
        "created_at": inv.get("created_at"),
    }


async def create_and_maybe_send_invoice(tenant: dict, send: bool, period_dt: Optional[datetime] = None) -> dict:
    """Create an invoice record for a tenant's current billing period (idempotent by period_key).
    Optionally email it (PDF + body) via the platform SMTP identity. Returns the invoice doc."""
    billing = tenant.get("billing") or {}
    if not billing.get("active"):
        raise HTTPException(status_code=400, detail="This company has no active paid plan. Set a plan first.")
    tenant_id = str(tenant["_id"])
    company = await get_company_settings()
    cycle = billing.get("cycle", "monthly")
    due = period_dt or parse_dt(billing.get("next_due_date")) or now_utc()
    period_key = f"{tenant_id}:{due.strftime('%Y-%m') if cycle == 'monthly' else due.strftime('%Y')}"

    existing = await db.invoices.find_one({"period_key": period_key})
    if existing:
        inv = existing
    else:
        number = await _next_invoice_number(company)
        owner = await db.users.find_one({"tenant_id": tenant_id, "role": "superadmin"})
        inv = {
            "number": number,
            "tenant_id": tenant_id,
            "tenant_name": tenant.get("name", ""),
            "issued_date": now_utc().isoformat(),
            "due_date": due.isoformat(),
            "period_key": period_key,
            "plan_name": billing.get("plan_name", "Subscription"),
            "amount": billing.get("price", 0),
            "currency": billing.get("currency", CURRENCY),
            "cycle": cycle,
            "status": "draft",
            "sent_to": owner.get("email") if owner else "",
            "created_at": now_utc().isoformat(),
        }
        res = await db.invoices.insert_one(inv)
        inv["_id"] = res.inserted_id

    if send:
        cfg = await platform_cfg()
        if not cfg:
            raise HTTPException(status_code=400, detail="Configure your platform Email Settings first so invoices can be sent.")
        to = inv.get("sent_to")
        if not to:
            raise HTTPException(status_code=400, detail="No owner email found for this company to send the invoice to.")
        pdf_bytes = build_invoice_pdf(inv, company)
        brand = company.get("heading", "Ivory Digital")
        fake_tenant = {"_id": "platform", "name": brand,
                       "branding": {"brand_name": brand, "tagline": "Invoice", "primary_color": "#B0904F"}}
        html = render_email(fake_tenant, f"Invoice {inv['number']}",
                            [f"Please find attached your invoice <strong>{inv['number']}</strong> for your {inv['plan_name']} subscription.",
                             f"Amount due: <strong>{money(inv['amount'])}</strong> &nbsp;·&nbsp; Due date: <strong>{fmt_date(inv['due_date'])}</strong>",
                             "Payment details are included on the attached PDF. Thank you for your business."])
        att = [{"filename": f"{inv['number']}.pdf", "content_type": "application/pdf", "data": pdf_bytes}]
        try:
            await asyncio.to_thread(_smtp_send, cfg, to, f"{brand} — Invoice {inv['number']}",
                                    f"Please find attached invoice {inv['number']} for {money(inv['amount'])}, due {fmt_date(inv['due_date'])}.",
                                    html, None, True, att)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invoice created but could not be emailed: {e}")
        await db.invoices.update_one({"_id": inv["_id"]}, {"$set": {"status": "sent", "sent_to": to}})
        inv["status"] = "sent"
    return inv


@api.get("/platform/tenants/{tenant_id}/invoices")
async def platform_list_invoices(tenant_id: str, user: dict = Depends(get_current_platform)):
    docs = await db.invoices.find({"tenant_id": tenant_id}).sort("created_at", -1).to_list(200)
    return [invoice_public(d) for d in docs]


@api.post("/platform/tenants/{tenant_id}/generate-invoice")
async def platform_generate_invoice(tenant_id: str, body: GenerateInvoiceIn, user: dict = Depends(get_current_platform)):
    t = await db.tenants.find_one({"_id": oid(tenant_id)})
    if not t:
        raise HTTPException(status_code=404, detail="Company not found")
    inv = await create_and_maybe_send_invoice(t, send=body.send)
    return invoice_public(inv)


@api.get("/platform/invoices/{invoice_id}/pdf")
async def platform_invoice_pdf(invoice_id: str, user: dict = Depends(get_current_platform)):
    inv = await db.invoices.find_one({"_id": oid(invoice_id)})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    company = await get_company_settings()
    pdf_bytes = build_invoice_pdf(inv, company)
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename={inv.get('number','invoice')}.pdf"})


@api.post("/platform/send-email")
async def platform_send_manual_email(body: ManualEmailIn, user: dict = Depends(get_current_platform)):
    cfg = await platform_cfg()
    if not cfg:
        raise HTTPException(status_code=400, detail="Configure your platform Email Settings first.")
    attachments = []
    for a in (body.attachments or []):
        try:
            raw = a.data_base64
            if "," in raw and raw.strip().startswith("data:"):
                raw = raw.split(",", 1)[1]
            attachments.append({"filename": a.filename, "content_type": a.content_type,
                                "data": base64.b64decode(raw)})
        except Exception:
            raise HTTPException(status_code=400, detail=f"Could not read attachment '{a.filename}'")
    brand = os.environ.get("PLATFORM_SUPERADMIN_NAME", "Ivory Digital")
    # Preserve line breaks in the plain message as simple HTML paragraphs
    paragraphs = [p.strip() for p in body.message.split("\n\n") if p.strip()] or [body.message]
    paragraphs = [p.replace("\n", "<br>") for p in paragraphs]
    fake_tenant = {"_id": "platform", "name": brand,
                   "branding": {"brand_name": brand, "tagline": "", "primary_color": "#B0904F"}}
    html = render_email(fake_tenant, body.subject, paragraphs)
    try:
        await asyncio.to_thread(_smtp_send, cfg, body.to, body.subject, body.message, html, None, True, attachments)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not send: {e}")
    return {"ok": True}




# =================================================================== TENANT CONTEXT (public)
@api.get("/tenant/context")
async def tenant_context(request: Request):
    """Public: returns the resolved tenant's public info + branding + status for the current path."""
    tenant = await resolve_tenant(request)
    return tenant_public(tenant)


# =================================================================== TENANT AUTH
@api.post("/auth/login")
async def login(body: LoginIn, request: Request):
    tenant = await resolve_tenant(request)
    tenant_id = str(tenant["_id"])
    email = body.email.lower().strip()
    user = await db.users.find_one({"tenant_id": tenant_id, "email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.get("active", True):
        raise HTTPException(status_code=403, detail="This account has been disabled")
    if user.get("totp_enabled"):
        mfa_token = create_token(str(user["_id"]), ttype="mfa", scope="tenant", minutes=5)
        return {"mfa_required": True, "mfa_token": mfa_token}
    token = create_token(str(user["_id"]), scope="tenant")
    return {"access_token": token, "user": clean(user)}


@api.post("/auth/2fa/verify")
async def verify_2fa(body: Verify2FAIn):
    try:
        payload = decode_token(body.mfa_token)
        if payload.get("type") != "mfa" or payload.get("scope") != "tenant":
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="2FA session expired, please log in again")
    user = await db.users.find_one({"_id": oid(payload["sub"])})
    if not user or not user.get("totp_secret"):
        raise HTTPException(status_code=400, detail="2FA not configured")
    if not pyotp.TOTP(user["totp_secret"]).verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    token = create_token(str(user["_id"]), scope="tenant")
    return {"access_token": token, "user": clean(user)}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user), tenant: dict = Depends(get_user_tenant)):
    d = clean(user)
    d["tenant"] = tenant_public(tenant)
    return d


@api.post("/auth/update-profile")
async def update_profile(body: ProfileIn, user: dict = Depends(get_current_user)):
    update = {}
    if body.name:
        update["name"] = body.name.strip()
    if body.email:
        email = body.email.lower().strip()
        if email != user["email"]:
            existing = await db.users.find_one({"tenant_id": user["tenant_id"], "email": email})
            if existing:
                raise HTTPException(status_code=400, detail="That email is already in use")
            update["email"] = email
    if update:
        await db.users.update_one({"_id": user["_id"]}, {"$set": update})
    doc = await db.users.find_one({"_id": user["_id"]})
    return clean(doc)


@api.get("/auth/my-email-settings")
async def get_my_email_settings(user: dict = Depends(get_current_user)):
    return {
        "smtp_host": user.get("smtp_host", ""),
        "smtp_port": user.get("smtp_port", 587),
        "smtp_user": user.get("smtp_user", ""),
        "smtp_password": "********" if user.get("smtp_password") else "",
        "sender_email": user.get("sender_email", "") or user.get("email", ""),
        "sender_name": user.get("sender_name", ""),
    }


@api.put("/auth/my-email-settings")
async def put_my_email_settings(body: MyEmailSettingsIn, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update.get("smtp_password") == "********":
        update.pop("smtp_password")
    if "sender_email" in update and update["sender_email"]:
        update["sender_email"] = update["sender_email"].lower().strip()
    if update:
        await db.users.update_one({"_id": user["_id"]}, {"$set": update})
    return {"ok": True}


@api.post("/auth/my-email-settings/test")
async def test_my_email_settings(body: TestEmailIn, user: dict = Depends(get_current_user), tenant: dict = Depends(get_user_tenant)):
    u = await db.users.find_one({"_id": user["_id"]})
    brand = brand_name_of(tenant)
    cfg = cfg_from_user(u, brand)
    if not cfg:
        raise HTTPException(status_code=400, detail="Please save your SMTP host and details first")
    html = render_email(tenant, "Your email is working",
                        [f"This is a test email sent from your {brand} account (<strong>{cfg['from_addr']}</strong>).",
                         "If you can see this beautifully formatted message, your outgoing email is configured correctly."])
    logo = _logo_bytes(tenant)
    try:
        await asyncio.to_thread(
            _smtp_send, cfg, body.to, f"{brand} — test email",
            f"This is a test email sent from your {brand} account ({cfg['from_addr']}).",
            html, logo, True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not send: {e}")
    return {"ok": True}


@api.post("/auth/change-password")
async def change_password(body: ChangePwIn, user: dict = Depends(get_current_user)):
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}


@api.post("/auth/2fa/setup")
async def setup_2fa(user: dict = Depends(get_current_user), tenant: dict = Depends(get_user_tenant)):
    secret = pyotp.random_base32()
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"totp_secret": secret}})
    uri = pyotp.TOTP(secret).provisioning_uri(name=user["email"], issuer_name=f"{brand_name_of(tenant)} Appointments")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_data = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    return {"secret": secret, "qr": qr_data, "otpauth_uri": uri}


@api.post("/auth/2fa/enable")
async def enable_2fa(body: Enable2FAIn, user: dict = Depends(get_current_user)):
    if not user.get("totp_secret"):
        raise HTTPException(status_code=400, detail="Run 2FA setup first")
    if not pyotp.TOTP(user["totp_secret"]).verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code, try again")
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"totp_enabled": True}})
    return {"ok": True}


@api.post("/auth/2fa/disable")
async def disable_2fa(user: dict = Depends(get_current_user)):
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"totp_enabled": False, "totp_secret": None}})
    return {"ok": True}


# =================================================================== ADMIN MANAGEMENT (company superadmin)
@api.get("/admins")
async def list_admins(user: dict = Depends(require_company_superadmin)):
    docs = await db.users.find({"tenant_id": user["tenant_id"]}).sort("created_at", 1).to_list(50)
    return [clean(d) for d in docs]


@api.post("/admins")
async def create_admin(body: AdminCreateIn, user: dict = Depends(require_company_superadmin)):
    _ = await require_tenant_write(user)
    tenant_id = user["tenant_id"]
    email = body.email.lower().strip()
    count = await db.users.count_documents({"tenant_id": tenant_id, "role": "admin"})
    if count >= MAX_ADMINS:
        raise HTTPException(status_code=400, detail=f"Maximum of {MAX_ADMINS} admins reached")
    if await db.users.find_one({"tenant_id": tenant_id, "email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    doc = {
        "tenant_id": tenant_id,
        "name": body.name.strip(),
        "email": email,
        "password_hash": hash_password(body.password),
        "role": "admin",
        "active": True,
        "totp_enabled": False,
        "totp_secret": None,
        "created_at": now_utc().isoformat(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)


@api.patch("/admins/{admin_id}")
async def update_admin(admin_id: str, body: AdminUpdateIn, user: dict = Depends(require_company_superadmin)):
    target = await db.users.find_one({"_id": oid(admin_id), "tenant_id": user["tenant_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    if target.get("role") == "superadmin":
        raise HTTPException(status_code=400, detail="Cannot modify the owner here")
    update = {}
    if body.name is not None:
        update["name"] = body.name.strip()
    if body.active is not None:
        update["active"] = body.active
    if body.password:
        update["password_hash"] = hash_password(body.password)
    if update:
        await db.users.update_one({"_id": target["_id"]}, {"$set": update})
    doc = await db.users.find_one({"_id": target["_id"]})
    return clean(doc)


@api.delete("/admins/{admin_id}")
async def delete_admin(admin_id: str, user: dict = Depends(require_company_superadmin)):
    target = await db.users.find_one({"_id": oid(admin_id), "tenant_id": user["tenant_id"]})
    if not target:
        raise HTTPException(status_code=404, detail="Admin not found")
    if target.get("role") == "superadmin":
        raise HTTPException(status_code=400, detail="Cannot remove the owner")
    await db.users.delete_one({"_id": target["_id"]})
    return {"ok": True}


# =================================================================== SHOPS (public + admin)
@api.get("/shops")
async def list_shops(request: Request):
    tenant = await resolve_tenant(request)
    docs = await db.shops.find({"tenant_id": str(tenant["_id"])}).sort("order", 1).to_list(20)
    return [clean(d) for d in docs]


@api.get("/shops/{shop_id}")
async def get_shop(shop_id: str, request: Request):
    tenant = await resolve_tenant(request)
    doc = await db.shops.find_one({"_id": oid(shop_id), "tenant_id": str(tenant["_id"])})
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    return clean(doc)


@api.post("/shops")
async def create_shop(body: ShopCreateIn, user: dict = Depends(require_tenant_write)):
    tenant_id = user["tenant_id"]
    count = await db.shops.count_documents({"tenant_id": tenant_id})
    tenant = await db.tenants.find_one({"_id": oid(tenant_id)})
    max_locations = int((tenant or {}).get("max_locations") or 1)
    if count >= max_locations:
        raise HTTPException(status_code=403,
                            detail=f"Your plan includes {max_locations} shop{'s' if max_locations != 1 else ''}. Contact us to add more.")
    doc = {
        "tenant_id": tenant_id,
        "name": body.name.strip(),
        "slug": slugify(body.name),
        "role_label": body.role_label or "Appointments",
        "address": body.address or "",
        "phone": body.phone or "",
        "email": body.email or "",
        "order": count,
        "blurb": body.blurb or "",
        "hours_text": body.hours_text or "",
        "what_to_expect": "",
        "photo_url": "",
        "questions": [dict(SOURCE_Q)],
        "deposit_amount": 0,
        "deposit_required": False,
    }
    res = await db.shops.insert_one(doc)
    await db.availability.insert_one({"tenant_id": tenant_id, "shop_id": str(res.inserted_id),
                                      "hours": DEFAULT_HOURS, "slot_step": 30, "capacity": 1, "buffer": 0})
    doc["_id"] = res.inserted_id
    return clean(doc)


@api.patch("/shops/{shop_id}")
async def update_shop(shop_id: str, body: ShopUpdateIn, user: dict = Depends(require_tenant_write)):
    q = {"_id": oid(shop_id), "tenant_id": user["tenant_id"]}
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update:
        await db.shops.update_one(q, {"$set": update})
    doc = await db.shops.find_one(q)
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    return clean(doc)


@api.delete("/shops/{shop_id}")
async def delete_shop(shop_id: str, user: dict = Depends(require_tenant_write)):
    tenant_id = user["tenant_id"]
    if await db.shops.count_documents({"tenant_id": tenant_id}) <= 1:
        raise HTTPException(status_code=400, detail="You must keep at least one location")
    q = {"_id": oid(shop_id), "tenant_id": tenant_id}
    doc = await db.shops.find_one(q)
    if not doc:
        raise HTTPException(status_code=404, detail="Location not found")
    await db.shops.delete_one(q)
    await db.availability.delete_many({"tenant_id": tenant_id, "shop_id": shop_id})
    await db.appointment_types.delete_many({"tenant_id": tenant_id, "shop_id": shop_id})
    await db.blocked_dates.delete_many({"tenant_id": tenant_id, "shop_id": shop_id})
    return {"ok": True}


@api.put("/shops/{shop_id}/questions")
async def set_questions(shop_id: str, body: QuestionsIn, user: dict = Depends(require_tenant_write)):
    questions = []
    for qq in body.questions:
        questions.append({
            "id": qq.get("id") or uuid.uuid4().hex[:8],
            "label": (qq.get("label") or "").strip(),
            "type": qq.get("type") or "text",
            "options": qq.get("options") or [],
            "required": bool(qq.get("required")),
        })
    await db.shops.update_one({"_id": oid(shop_id), "tenant_id": user["tenant_id"]}, {"$set": {"questions": questions}})
    return {"questions": questions}


# =================================================================== APPOINTMENT TYPES
@api.get("/shops/{shop_id}/appointment-types")
async def list_types(shop_id: str, request: Request, all: bool = False):
    tenant = await resolve_tenant(request)
    query = {"tenant_id": str(tenant["_id"]), "shop_id": shop_id}
    if not all:
        query["active"] = True
    docs = await db.appointment_types.find(query).sort("duration", 1).to_list(50)
    return [clean(d) for d in docs]


@api.post("/shops/{shop_id}/appointment-types")
async def create_type(shop_id: str, body: AppointmentTypeIn, user: dict = Depends(require_tenant_write)):
    if not (5 <= body.duration <= 600):
        raise HTTPException(status_code=400, detail="Duration must be between 5 and 600 minutes")
    doc = body.model_dump()
    doc["shop_id"] = shop_id
    doc["tenant_id"] = user["tenant_id"]
    res = await db.appointment_types.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)


@api.patch("/appointment-types/{type_id}")
async def update_type(type_id: str, body: AppointmentTypeIn, user: dict = Depends(require_tenant_write)):
    if not (5 <= body.duration <= 600):
        raise HTTPException(status_code=400, detail="Duration must be between 5 and 600 minutes")
    q = {"_id": oid(type_id), "tenant_id": user["tenant_id"]}
    await db.appointment_types.update_one(q, {"$set": {**body.model_dump(), "tenant_id": user["tenant_id"]}})
    doc = await db.appointment_types.find_one(q)
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return clean(doc)


@api.delete("/appointment-types/{type_id}")
async def delete_type(type_id: str, user: dict = Depends(require_tenant_write)):
    await db.appointment_types.delete_one({"_id": oid(type_id), "tenant_id": user["tenant_id"]})
    return {"ok": True}


# =================================================================== AVAILABILITY
@api.get("/shops/{shop_id}/availability")
async def get_availability(shop_id: str, request: Request):
    tenant = await resolve_tenant(request)
    doc = await db.availability.find_one({"tenant_id": str(tenant["_id"]), "shop_id": shop_id})
    if not doc:
        return {"shop_id": shop_id, "hours": {}, "slot_step": 30, "capacity": 1, "buffer": 0}
    doc.pop("_id", None)
    doc.pop("tenant_id", None)
    doc.setdefault("capacity", 1)
    doc.setdefault("buffer", 0)
    return doc


@api.put("/shops/{shop_id}/availability")
async def set_availability(shop_id: str, body: AvailabilityIn, user: dict = Depends(require_tenant_write)):
    await db.availability.update_one(
        {"tenant_id": user["tenant_id"], "shop_id": shop_id},
        {"$set": {"tenant_id": user["tenant_id"], "shop_id": shop_id, "hours": body.hours,
                  "slot_step": body.slot_step, "capacity": max(1, body.capacity), "buffer": max(0, body.buffer)}},
        upsert=True,
    )
    return {"ok": True}


@api.get("/shops/{shop_id}/blocked-dates")
async def get_blocked(shop_id: str, request: Request):
    tenant = await resolve_tenant(request)
    docs = await db.blocked_dates.find({"tenant_id": str(tenant["_id"]), "shop_id": shop_id}).sort("date", 1).to_list(365)
    return [clean(d) for d in docs]


@api.post("/shops/{shop_id}/blocked-dates")
async def add_blocked(shop_id: str, body: BlockedDateIn, user: dict = Depends(require_tenant_write)):
    doc = {"tenant_id": user["tenant_id"], "shop_id": shop_id, "date": body.date, "reason": body.reason,
           "start_time": body.start_time or None, "end_time": body.end_time or None}
    res = await db.blocked_dates.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)


@api.delete("/blocked-dates/{block_id}")
async def del_blocked(block_id: str, user: dict = Depends(require_tenant_write)):
    await db.blocked_dates.delete_one({"_id": oid(block_id), "tenant_id": user["tenant_id"]})
    return {"ok": True}


# =================================================================== SLOT COMPUTATION
async def _compute_slots(tenant_id: str, shop_id: str, date: str, duration: int, exclude_ref: Optional[str] = None):
    if not (5 <= duration <= 600):
        raise HTTPException(status_code=400, detail="Invalid duration")
    try:
        d = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")
    if d < datetime.now().date():
        return {"slots": []}
    blocks = await db.blocked_dates.find({"tenant_id": tenant_id, "shop_id": shop_id, "date": date}).to_list(50)
    if any(not b.get("start_time") or not b.get("end_time") for b in blocks):
        return {"slots": [], "reason": "closed"}
    timed = [(_to_min(b["start_time"]), _to_min(b["end_time"])) for b in blocks]
    avail = await db.availability.find_one({"tenant_id": tenant_id, "shop_id": shop_id})
    if not avail:
        return {"slots": []}
    day = avail.get("hours", {}).get(str(d.weekday()))
    if not day or day.get("closed"):
        return {"slots": [], "reason": "closed"}
    step = avail.get("slot_step", 30)
    capacity = max(1, avail.get("capacity", 1))
    buffer = max(0, avail.get("buffer", 0))
    open_m, close_m = _to_min(day["open"]), _to_min(day["close"])
    q = {"tenant_id": tenant_id, "shop_id": shop_id, "date": date, "status": {"$ne": "cancelled"}}
    if exclude_ref:
        q["reference"] = {"$ne": exclude_ref}
    existing = await db.bookings.find(q).to_list(300)
    busy = [(_to_min(b["start_time"]) - buffer, _to_min(b["start_time"]) + b["duration"] + buffer) for b in existing]
    slots = []
    t = open_m
    while t + duration <= close_m:
        s_start, s_end = t, t + duration
        blocked = any(s_start < be and s_end > bs for bs, be in timed)
        overlaps = sum(1 for bs, be in busy if s_start < be and s_end > bs)
        if not blocked and overlaps < capacity:
            slots.append(_to_hhmm(t))
        t += step
    return {"slots": slots}


@api.get("/public/slots")
async def public_slots(shop_id: str, date: str, duration: int, request: Request):
    tenant = await resolve_tenant(request)
    if effective_status(tenant) in ("suspended", "expired"):
        return {"slots": [], "reason": "unavailable"}
    return await _compute_slots(str(tenant["_id"]), shop_id, date, duration)


# =================================================================== PAYMENTS helpers
VALID_PAYMENT_METHODS = ["in_person", "paypal_me", "paypal", "bank_transfer"]


def _active_methods(settings: dict) -> list:
    methods = settings.get("payment_methods")
    if methods is None:
        legacy = settings.get("payment_method", "off")
        methods = [] if legacy in (None, "", "off") else [legacy]
    return [m for m in methods if m in VALID_PAYMENT_METHODS][:3]


def _paypal_env():
    return {
        "client_id": os.environ.get("PAYPAL_CLIENT_ID", ""),
        "secret": os.environ.get("PAYPAL_SECRET", ""),
        "mode": os.environ.get("PAYPAL_MODE", "sandbox"),
    }


def _paypal_base(mode: str) -> str:
    return "https://api-m.paypal.com" if mode == "live" else "https://api-m.sandbox.paypal.com"


@api.get("/payments/config")
async def payments_config(request: Request):
    tenant = await resolve_tenant(request)
    s = await get_settings(str(tenant["_id"]))
    env = _paypal_env()
    methods = _active_methods(s)
    return {
        "methods": methods,
        "method": methods[0] if methods else "off",
        "paypal_me_url": (s.get("paypal_me_url") or "").rstrip("/"),
        "bank": {
            "account_name": s.get("bank_account_name", ""),
            "sort_code": s.get("bank_sort_code", ""),
            "account_number": s.get("bank_account_number", ""),
        },
        "currency": s.get("payment_currency", "GBP"),
        "paypal_client_id": env["client_id"],
        "paypal_configured": bool(env["client_id"] and env["secret"]),
    }


# =================================================================== BOOKINGS (public)
@api.post("/public/bookings")
async def create_booking(body: BookingIn, request: Request):
    tenant = await resolve_tenant(request)
    if effective_status(tenant) in ("suspended", "expired"):
        raise HTTPException(status_code=403, detail="Online bookings are temporarily unavailable.")
    tenant_id = str(tenant["_id"])
    shop = await db.shops.find_one({"_id": oid(body.shop_id), "tenant_id": tenant_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Location not found")
    atype = await db.appointment_types.find_one({"_id": oid(body.appointment_type_id), "tenant_id": tenant_id})
    if not atype:
        raise HTTPException(status_code=404, detail="Appointment type not found")
    duration = atype["duration"]
    avail = await _compute_slots(tenant_id, body.shop_id, body.date, duration)
    if body.start_time not in avail.get("slots", []):
        raise HTTPException(status_code=409, detail="That time slot is no longer available")
    ref = "REF-" + base64.b32encode(os.urandom(5)).decode().rstrip("=")[:8]
    settings = await get_settings(tenant_id)
    methods = _active_methods(settings)
    deposit = float(shop.get("deposit_amount") or 0)
    if not methods or deposit <= 0:
        pay_status = "not_required"
    elif methods == ["in_person"]:
        pay_status = "pay_in_person"
    else:
        pay_status = "pending"
    doc = {
        "tenant_id": tenant_id,
        "reference": ref,
        "shop_id": body.shop_id,
        "shop_name": shop["name"],
        "shop_address": shop.get("address", ""),
        "appointment_type_id": body.appointment_type_id,
        "appointment_type_name": atype["name"],
        "duration": duration,
        "date": body.date,
        "start_time": body.start_time,
        "customer_name": body.customer_name.strip(),
        "customer_email": body.customer_email.lower().strip(),
        "customer_phone": body.customer_phone.strip(),
        "notes": body.notes,
        "answers": body.answers or [],
        "admin_notes": "",
        "status": "pending",
        "reminder_sent": False,
        "deposit_amount": deposit if pay_status != "not_required" else 0,
        "deposit_required": bool(shop.get("deposit_required")),
        "payment_status": pay_status,
        "payment_method_used": "in_person" if pay_status == "pay_in_person" else "",
        "payment_ref": "",
        "created_at": now_utc().isoformat(),
    }
    res = await db.bookings.insert_one(doc)
    doc["_id"] = res.inserted_id
    cfg = await resolve_cfg(tenant)
    when = f"{body.date} at {body.start_time}"
    murl = manage_url(settings, ref)
    brand = brand_name_of(tenant)
    logo = _logo_bytes(tenant)
    if settings.get("notify_customer_on_booking"):
        dispatch_email(cfg, doc["customer_email"], f"Your {brand} appointment request",
                   f"Dear {doc['customer_name']},\n\nWe have received your request for a {atype['name']} at {shop['name']} on {when}. "
                   f"Your reference is {ref}.{manage_link(settings, ref)}",
                   html=render_email(tenant, f"Thank you, {doc['customer_name'].split(' ')[0]}",
                                     [f"We've received your request for a <strong>{atype['name']}</strong> at <strong>{shop['name']}</strong> on <strong>{when}</strong>.",
                                      f"Your booking reference is <strong>{ref}</strong>. We'll be in touch shortly to confirm.",
                                      "We can't wait to welcome you."],
                                     cta={"url": murl, "label": "View My Appointment"} if murl else None),
                   logo=logo)
    shop_to = settings.get("business_email") or (cfg or {}).get("from_addr")
    if settings.get("notify_shop_on_booking") and shop_to:
        dispatch_email(cfg, shop_to, f"New booking request — {shop['name']}",
                   f"{doc['customer_name']} ({doc['customer_email']}, {doc['customer_phone']}) requested a {atype['name']} on {when}. Ref {ref}.",
                   html=render_email(tenant, "New Booking Request",
                                     [f"<strong>{doc['customer_name']}</strong> requested a <strong>{atype['name']}</strong> at <strong>{shop['name']}</strong> on <strong>{when}</strong>.",
                                      f"Email: {doc['customer_email']}<br>Phone: {doc['customer_phone']}<br>Reference: {ref}"]),
                   logo=logo)
    return clean(doc)


class PublicReschedIn(BaseModel):
    date: str
    start_time: str


async def _get_public_booking(tenant_id: str, reference: str) -> dict:
    b = await db.bookings.find_one({"tenant_id": tenant_id, "reference": reference})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    return b


@api.post("/public/bookings/{reference}/reschedule")
async def public_reschedule(reference: str, body: PublicReschedIn, request: Request):
    tenant = await resolve_tenant(request)
    if effective_status(tenant) in ("suspended", "expired"):
        raise HTTPException(status_code=403, detail="Changes are temporarily unavailable.")
    tenant_id = str(tenant["_id"])
    b = await _get_public_booking(tenant_id, reference)
    if b["status"] in ("cancelled", "completed"):
        raise HTTPException(status_code=400, detail="This booking can no longer be changed")
    avail = await _compute_slots(tenant_id, b["shop_id"], body.date, b["duration"], exclude_ref=reference)
    if body.start_time not in avail.get("slots", []):
        raise HTTPException(status_code=409, detail="That time slot is no longer available")
    await db.bookings.update_one({"_id": b["_id"]},
                                 {"$set": {"date": body.date, "start_time": body.start_time, "status": "pending", "reminder_sent": False}})
    doc = await db.bookings.find_one({"_id": b["_id"]})
    return clean(doc)


@api.post("/public/bookings/{reference}/cancel")
async def public_cancel(reference: str, request: Request):
    tenant = await resolve_tenant(request)
    tenant_id = str(tenant["_id"])
    b = await _get_public_booking(tenant_id, reference)
    if b["status"] in ("cancelled", "completed"):
        raise HTTPException(status_code=400, detail="This booking can no longer be changed")
    await db.bookings.update_one({"_id": b["_id"]}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


@api.get("/public/bookings/{reference}/calendar.ics")
async def booking_ics(reference: str, request: Request):
    tenant = await resolve_tenant(request)
    b = await _get_public_booking(str(tenant["_id"]), reference)
    ics = wrap_ics([booking_to_vevent(b)])
    return Response(content=ics, media_type="text/calendar",
                    headers={"Content-Disposition": f'attachment; filename="{reference}.ics"'})


@api.get("/public/bookings/{reference}")
async def get_booking_by_ref(reference: str, request: Request):
    tenant = await resolve_tenant(request)
    return clean(await _get_public_booking(str(tenant["_id"]), reference))


# ---- public payment actions
@api.post("/public/bookings/{reference}/pay-in-person")
async def mark_pay_in_person(reference: str, request: Request):
    tenant = await resolve_tenant(request)
    b = await _get_public_booking(str(tenant["_id"]), reference)
    await db.bookings.update_one({"_id": b["_id"]}, {"$set": {"payment_status": "pay_in_person", "payment_method_used": "in_person"}})
    return clean(await db.bookings.find_one({"_id": b["_id"]}))


@api.post("/public/bookings/{reference}/notify-paid")
async def notify_deposit_paid(reference: str, request: Request):
    tenant = await resolve_tenant(request)
    tenant_id = str(tenant["_id"])
    b = await _get_public_booking(tenant_id, reference)
    await db.bookings.update_one({"_id": b["_id"]}, {"$set": {"deposit_claimed": True, "deposit_claimed_at": now_utc().isoformat()}})
    settings = await get_settings(tenant_id)
    cfg = await resolve_cfg(tenant)
    shop_to = settings.get("business_email") or (cfg or {}).get("from_addr")
    amount = float(b.get("deposit_amount") or 0)
    cur = settings.get("payment_currency", "GBP")
    sym = {"GBP": "£", "USD": "$", "EUR": "€"}.get(cur, "")
    if shop_to:
        dispatch_email(cfg, shop_to, f"Deposit reported paid — {b['reference']}",
                   f"{b['customer_name']} reported paying their {sym}{amount:.2f} deposit for {b['appointment_type_name']} at {b['shop_name']} on {b['date']} at {b['start_time']}. Ref {b['reference']}.",
                   html=render_email(tenant, "Deposit Reported Paid",
                                     [f"<strong>{b['customer_name']}</strong> reported paying their <strong>{sym}{amount:.2f}</strong> deposit.",
                                      f"{b['appointment_type_name']} at {b['shop_name']} on {b['date']} at {b['start_time']}.<br>Reference: <strong>{b['reference']}</strong>",
                                      "Please verify and mark it paid in the admin panel."]),
                   logo=_logo_bytes(tenant))
    return clean(await db.bookings.find_one({"_id": b["_id"]}))


async def _paypal_token(env: dict) -> str:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(f"{_paypal_base(env['mode'])}/v1/oauth2/token",
                         auth=(env["client_id"], env["secret"]),
                         data={"grant_type": "client_credentials"})
        r.raise_for_status()
        return r.json()["access_token"]


@api.post("/public/bookings/{reference}/paypal/create-order")
async def paypal_create_order(reference: str, request: Request):
    env = _paypal_env()
    if not (env["client_id"] and env["secret"]):
        raise HTTPException(status_code=400, detail="PayPal is not configured")
    tenant = await resolve_tenant(request)
    tenant_id = str(tenant["_id"])
    b = await _get_public_booking(tenant_id, reference)
    amount = float(b.get("deposit_amount") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="No deposit is due for this booking")
    s = await get_settings(tenant_id)
    currency = s.get("payment_currency", "GBP")
    try:
        token = await _paypal_token(env)
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{_paypal_base(env['mode'])}/v2/checkout/orders",
                             headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                             json={"intent": "CAPTURE", "purchase_units": [{
                                 "reference_id": b["reference"],
                                 "description": f"Deposit — {b['appointment_type_name']} at {b['shop_name']}",
                                 "amount": {"currency_code": currency, "value": f"{amount:.2f}"}}]})
            r.raise_for_status()
            return {"id": r.json()["id"]}
    except httpx.HTTPError as e:
        logger.error("PayPal create-order failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not start PayPal payment")


@api.post("/public/bookings/{reference}/paypal/capture-order")
async def paypal_capture_order(reference: str, order_id: str, request: Request):
    env = _paypal_env()
    if not (env["client_id"] and env["secret"]):
        raise HTTPException(status_code=400, detail="PayPal is not configured")
    tenant = await resolve_tenant(request)
    b = await _get_public_booking(str(tenant["_id"]), reference)
    try:
        token = await _paypal_token(env)
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(f"{_paypal_base(env['mode'])}/v2/checkout/orders/{order_id}/capture",
                             headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
            r.raise_for_status()
            data = r.json()
    except httpx.HTTPError as e:
        logger.error("PayPal capture failed: %s", e)
        raise HTTPException(status_code=502, detail="Could not confirm PayPal payment")
    if data.get("status") == "COMPLETED":
        await db.bookings.update_one({"_id": b["_id"]}, {"$set": {
            "payment_status": "paid", "payment_method_used": "paypal",
            "payment_ref": order_id, "paid_at": now_utc().isoformat()}})
    return clean(await db.bookings.find_one({"_id": b["_id"]}))


# =================================================================== BOOKINGS (admin)
def _booking_query(tenant_id, shop_id, status, date_from, date_to):
    query: dict = {"tenant_id": tenant_id}
    if shop_id:
        query["shop_id"] = shop_id
    if status:
        query["status"] = status
    if date_from or date_to:
        query["date"] = {}
        if date_from:
            query["date"]["$gte"] = date_from
        if date_to:
            query["date"]["$lte"] = date_to
    return query


@api.get("/bookings")
async def list_bookings(user: dict = Depends(get_current_user), shop_id: Optional[str] = None,
                        status: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None):
    query = _booking_query(user["tenant_id"], shop_id, status, date_from, date_to)
    docs = await db.bookings.find(query).sort([("date", 1), ("start_time", 1)]).to_list(2000)
    return [clean(d) for d in docs]


@api.get("/bookings/export.csv")
async def export_bookings_csv(user: dict = Depends(get_current_user), shop_id: Optional[str] = None,
                              status: Optional[str] = None, date_from: Optional[str] = None, date_to: Optional[str] = None):
    query = _booking_query(user["tenant_id"], shop_id, status, date_from, date_to)
    docs = await db.bookings.find(query).sort([("date", 1), ("start_time", 1)]).to_list(5000)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Reference", "Date", "Time", "Duration (min)", "Status", "Location", "Appointment", "Customer", "Email", "Phone", "Deposit", "Payment", "Notes", "Created"])
    for b in docs:
        w.writerow([b.get("reference", ""), b.get("date", ""), b.get("start_time", ""), b.get("duration", ""),
                    b.get("status", ""), b.get("shop_name", ""), b.get("appointment_type_name", ""),
                    b.get("customer_name", ""), b.get("customer_email", ""), b.get("customer_phone", ""),
                    b.get("deposit_amount", 0), b.get("payment_status", ""),
                    (b.get("notes") or "").replace("\n", " "), b.get("created_at", "")])
    return Response(content=out.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="bookings.csv"'})


@api.get("/calendar/{feed_token}.ics")
async def calendar_feed(feed_token: str, request: Request, shop_id: Optional[str] = None):
    tenant = await resolve_tenant(request)
    tenant_id = str(tenant["_id"])
    s = await get_settings(tenant_id)
    if not s.get("feed_token") or feed_token != s["feed_token"]:
        raise HTTPException(status_code=404, detail="Calendar feed not found")
    today = datetime.now().date().isoformat()
    q = {"tenant_id": tenant_id, "date": {"$gte": today}, "status": {"$ne": "cancelled"}}
    if shop_id:
        q["shop_id"] = shop_id
    docs = await db.bookings.find(q).to_list(2000)
    return Response(content=wrap_ics([booking_to_vevent(b) for b in docs]), media_type="text/calendar")


@api.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, body: BookingUpdateIn, user: dict = Depends(require_tenant_write)):
    booking = await db.bookings.find_one({"_id": oid(booking_id), "tenant_id": user["tenant_id"]})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    update = {}
    if body.status:
        if body.status not in ("pending", "confirmed", "cancelled", "completed", "no_show"):
            raise HTTPException(status_code=400, detail="Invalid status")
        update["status"] = body.status
    if body.date:
        update["date"] = body.date
    if body.start_time:
        update["start_time"] = body.start_time
    if body.admin_notes is not None:
        update["admin_notes"] = body.admin_notes
    if body.payment_status is not None:
        if body.payment_status not in ("not_required", "pending", "paid", "pay_in_person"):
            raise HTTPException(status_code=400, detail="Invalid payment status")
        update["payment_status"] = body.payment_status
        if body.payment_status == "paid":
            update["paid_at"] = now_utc().isoformat()
            if not booking.get("payment_method_used"):
                update["payment_method_used"] = "manual"
    if update:
        await db.bookings.update_one({"_id": booking["_id"]}, {"$set": update})
    doc = await db.bookings.find_one({"_id": booking["_id"]})
    if body.status == "confirmed":
        tenant = await db.tenants.find_one({"_id": oid(user["tenant_id"])})
        settings = await get_settings(user["tenant_id"])
        if settings.get("notify_on_confirm"):
            cfg = await resolve_cfg(tenant, user)
            murl = manage_url(settings, doc["reference"])
            dispatch_email(cfg, doc["customer_email"], f"Your {brand_name_of(tenant)} appointment is confirmed",
                       f"Dear {doc['customer_name']},\n\nYour {doc['appointment_type_name']} at {doc['shop_name']} on "
                       f"{doc['date']} at {doc['start_time']} is now confirmed. Reference {doc['reference']}.{manage_link(settings, doc['reference'])}",
                       html=render_email(tenant, f"You're confirmed, {doc['customer_name'].split(' ')[0]}",
                                         [f"Your <strong>{doc['appointment_type_name']}</strong> at <strong>{doc['shop_name']}</strong> is now confirmed for:",
                                          f"<strong>{doc['date']} at {doc['start_time']}</strong>",
                                          f"Reference: <strong>{doc['reference']}</strong>. We can't wait to see you."],
                                         cta={"url": murl, "label": "View My Appointment"} if murl else None),
                       logo=_logo_bytes(tenant))
    return clean(doc)


class FollowUpIn(BaseModel):
    date: str
    start_time: str
    appointment_type_id: Optional[str] = None
    label: Optional[str] = ""


@api.post("/bookings/{booking_id}/follow-up")
async def create_follow_up(booking_id: str, body: FollowUpIn, user: dict = Depends(require_tenant_write)):
    tenant_id = user["tenant_id"]
    parent = await db.bookings.find_one({"_id": oid(booking_id), "tenant_id": tenant_id})
    if not parent:
        raise HTTPException(status_code=404, detail="Original booking not found")
    type_id = body.appointment_type_id or parent["appointment_type_id"]
    atype = await db.appointment_types.find_one({"_id": oid(type_id), "tenant_id": tenant_id})
    if not atype:
        raise HTTPException(status_code=404, detail="Appointment type not found")
    duration = atype["duration"]
    avail = await _compute_slots(tenant_id, parent["shop_id"], body.date, duration)
    if body.start_time not in avail.get("slots", []):
        raise HTTPException(status_code=409, detail="That time slot is no longer available")
    series_id = parent.get("series_id") or str(parent["_id"])
    if not parent.get("series_id"):
        await db.bookings.update_one({"_id": parent["_id"]}, {"$set": {"series_id": series_id}})
    ref = "REF-" + base64.b32encode(os.urandom(5)).decode().rstrip("=")[:8]
    doc = {
        "tenant_id": tenant_id,
        "reference": ref, "shop_id": parent["shop_id"], "shop_name": parent["shop_name"],
        "shop_address": parent.get("shop_address", ""),
        "appointment_type_id": type_id, "appointment_type_name": atype["name"], "duration": duration,
        "date": body.date, "start_time": body.start_time,
        "customer_name": parent["customer_name"], "customer_email": parent["customer_email"],
        "customer_phone": parent["customer_phone"],
        "notes": (body.label or "Follow-up appointment"), "answers": [], "admin_notes": "",
        "status": "confirmed", "reminder_sent": False, "series_id": series_id,
        "created_at": now_utc().isoformat(),
    }
    res = await db.bookings.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)


@api.get("/bookings/{booking_id}/series")
async def booking_series(booking_id: str, user: dict = Depends(get_current_user)):
    b = await db.bookings.find_one({"_id": oid(booking_id), "tenant_id": user["tenant_id"]})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    series_id = b.get("series_id") or str(b["_id"])
    docs = await db.bookings.find({"tenant_id": user["tenant_id"], "series_id": series_id}).sort([("date", 1), ("start_time", 1)]).to_list(100)
    return [clean(d) for d in docs]


# =================================================================== ANALYTICS
@api.get("/analytics")
async def analytics(user: dict = Depends(get_current_user), shop_id: Optional[str] = None):
    q: dict = {"tenant_id": user["tenant_id"]}
    if shop_id:
        q["shop_id"] = shop_id
    docs = await db.bookings.find(q, {
        "date": 1, "start_time": 1, "status": 1, "shop_name": 1, "answers": 1
    }).to_list(20000)
    weekday_names = WEEKDAYS
    by_weekday = {w: 0 for w in weekday_names}
    by_hour: dict = {}
    by_shop: dict = {}
    by_source: dict = {}
    completed = no_show = active = 0
    for b in docs:
        status = b.get("status")
        if status == "cancelled":
            continue
        active += 1
        try:
            d = datetime.strptime(b["date"], "%Y-%m-%d").date()
            by_weekday[weekday_names[d.weekday()]] += 1
        except Exception:
            pass
        hh = (b.get("start_time") or "")[:2]
        if hh:
            by_hour[hh] = by_hour.get(hh, 0) + 1
        sn = b.get("shop_name", "Unknown")
        by_shop[sn] = by_shop.get(sn, 0) + 1
        for a in (b.get("answers") or []):
            if a.get("label") == "How did you hear about us?" and a.get("value"):
                by_source[a["value"]] = by_source.get(a["value"], 0) + 1
        if status == "completed":
            completed += 1
        elif status == "no_show":
            no_show += 1
    total_attended = completed + no_show
    no_show_rate = round((no_show / total_attended) * 100) if total_attended else 0
    hours_sorted = [{"hour": f"{h}:00", "count": c} for h, c in sorted(by_hour.items())]
    return {
        "total": active,
        "by_weekday": [{"day": w, "count": by_weekday[w]} for w in weekday_names],
        "by_hour": hours_sorted,
        "by_shop": [{"shop": k, "count": v} for k, v in sorted(by_shop.items(), key=lambda x: -x[1])],
        "by_source": [{"source": k, "count": v} for k, v in sorted(by_source.items(), key=lambda x: -x[1])],
        "completed": completed, "no_show": no_show, "no_show_rate": no_show_rate,
    }


# =================================================================== CUSTOMERS
@api.get("/customers")
async def list_customers(user: dict = Depends(get_current_user), q: Optional[str] = None):
    docs = await db.bookings.find({"tenant_id": user["tenant_id"]}, {
        "customer_email": 1, "customer_name": 1, "customer_phone": 1,
        "date": 1, "shop_name": 1, "status": 1
    }).sort([("date", -1)]).to_list(20000)
    people: dict = {}
    for b in docs:
        email = (b.get("customer_email") or "").lower()
        if not email:
            continue
        p = people.setdefault(email, {"email": email, "name": b.get("customer_name", ""),
                                      "phone": b.get("customer_phone", ""), "total": 0,
                                      "last_date": "", "last_shop": ""})
        p["total"] += 1
        if b.get("date", "") > p["last_date"]:
            p["last_date"] = b.get("date", "")
            p["last_shop"] = b.get("shop_name", "")
            p["name"] = b.get("customer_name", "") or p["name"]
            p["phone"] = b.get("customer_phone", "") or p["phone"]
    rows = list(people.values())
    if q:
        ql = q.lower()
        rows = [r for r in rows if ql in r["name"].lower() or ql in r["email"] or ql in (r["phone"] or "")]
    rows.sort(key=lambda r: r["last_date"], reverse=True)
    return rows


@api.get("/customers/{email}")
async def customer_detail(email: str, user: dict = Depends(get_current_user)):
    em = email.lower().strip()
    docs = await db.bookings.find({"tenant_id": user["tenant_id"], "customer_email": em}).sort([("date", -1), ("start_time", -1)]).to_list(500)
    if not docs:
        raise HTTPException(status_code=404, detail="No bookings found for this customer")
    latest = docs[0]
    return {"email": em, "name": latest.get("customer_name", ""), "phone": latest.get("customer_phone", ""),
            "total": len(docs), "bookings": [clean(d) for d in docs]}


# =================================================================== WAITLIST
@api.post("/public/waitlist")
async def add_waitlist(body: WaitlistIn, request: Request):
    tenant = await resolve_tenant(request)
    if effective_status(tenant) in ("suspended", "expired"):
        raise HTTPException(status_code=403, detail="Temporarily unavailable.")
    tenant_id = str(tenant["_id"])
    shop = await db.shops.find_one({"_id": oid(body.shop_id), "tenant_id": tenant_id})
    if not shop:
        raise HTTPException(status_code=404, detail="Location not found")
    atype_name = ""
    if body.appointment_type_id:
        at = await db.appointment_types.find_one({"_id": oid(body.appointment_type_id), "tenant_id": tenant_id})
        atype_name = at["name"] if at else ""
    doc = {
        "tenant_id": tenant_id,
        "shop_id": body.shop_id, "shop_name": shop["name"],
        "appointment_type_id": body.appointment_type_id, "appointment_type_name": atype_name,
        "date": body.date or "", "customer_name": body.customer_name.strip(),
        "customer_email": body.customer_email.lower().strip(), "customer_phone": body.customer_phone.strip(),
        "notes": body.notes, "status": "waiting", "created_at": now_utc().isoformat(),
    }
    res = await db.waitlist.insert_one(doc)
    doc["_id"] = res.inserted_id
    return clean(doc)


@api.get("/waitlist")
async def list_waitlist(user: dict = Depends(get_current_user), shop_id: Optional[str] = None):
    q = {"tenant_id": user["tenant_id"]}
    if shop_id:
        q["shop_id"] = shop_id
    docs = await db.waitlist.find(q).sort("created_at", -1).to_list(500)
    return [clean(d) for d in docs]


@api.patch("/waitlist/{item_id}")
async def update_waitlist(item_id: str, body: WaitlistUpdateIn, user: dict = Depends(require_tenant_write)):
    await db.waitlist.update_one({"_id": oid(item_id), "tenant_id": user["tenant_id"]}, {"$set": {"status": body.status}})
    doc = await db.waitlist.find_one({"_id": oid(item_id), "tenant_id": user["tenant_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return clean(doc)


@api.delete("/waitlist/{item_id}")
async def delete_waitlist(item_id: str, user: dict = Depends(require_tenant_write)):
    await db.waitlist.delete_one({"_id": oid(item_id), "tenant_id": user["tenant_id"]})
    return {"ok": True}


# =================================================================== DASHBOARD
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    tenant_id = user["tenant_id"]
    today = datetime.now().date().isoformat()
    total = await db.bookings.count_documents({"tenant_id": tenant_id})
    pending = await db.bookings.count_documents({"tenant_id": tenant_id, "status": "pending"})
    confirmed = await db.bookings.count_documents({"tenant_id": tenant_id, "status": "confirmed"})
    upcoming = await db.bookings.count_documents({"tenant_id": tenant_id, "date": {"$gte": today}, "status": {"$ne": "cancelled"}})
    today_list = await db.bookings.find({"tenant_id": tenant_id, "date": today, "status": {"$ne": "cancelled"}}).sort("start_time", 1).to_list(100)
    per_shop = []
    shops = await db.shops.find({"tenant_id": tenant_id}).sort("order", 1).to_list(20)
    for s in shops:
        c = await db.bookings.count_documents({"tenant_id": tenant_id, "shop_id": str(s["_id"]), "date": {"$gte": today}, "status": {"$ne": "cancelled"}})
        per_shop.append({"shop": s["name"], "upcoming": c})
    waitlist = await db.waitlist.count_documents({"tenant_id": tenant_id, "status": "waiting"})
    return {"total": total, "pending": pending, "confirmed": confirmed, "upcoming": upcoming,
            "waitlist": waitlist, "today": [clean(d) for d in today_list], "per_shop": per_shop}


# =================================================================== SETTINGS (per-tenant, company superadmin)
@api.get("/settings")
async def read_settings(user: dict = Depends(require_company_superadmin)):
    tenant_id = user["tenant_id"]
    s = await get_settings(tenant_id)
    if not s.get("feed_token"):
        token = secrets.token_urlsafe(16)
        await db.settings.update_one({"tenant_id": tenant_id}, {"$set": {"feed_token": token}})
        s["feed_token"] = token
    s.pop("_id", None)
    s.pop("tenant_id", None)
    s["smtp_password"] = "********" if s.get("smtp_password") else ""
    return s


@api.put("/settings")
async def write_settings(body: SettingsIn, user: dict = Depends(require_company_superadmin)):
    _ = await require_tenant_write(user)
    tenant_id = user["tenant_id"]
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    if update.get("smtp_password") == "********":
        update.pop("smtp_password")
    if "payment_methods" in update:
        update["payment_methods"] = [m for m in update["payment_methods"] if m in VALID_PAYMENT_METHODS][:3]
    await db.settings.update_one({"tenant_id": tenant_id}, {"$set": {**update, "tenant_id": tenant_id}}, upsert=True)
    return {"ok": True}


# =================================================================== BRANDING (company superadmin)
@api.get("/branding")
async def get_branding(user: dict = Depends(require_company_superadmin), tenant: dict = Depends(get_user_tenant)):
    b = tenant.get("branding", {}) or {}
    return {
        "brand_name": b.get("brand_name") or tenant.get("name", ""),
        "logo_data": b.get("logo_data", ""),
        "logo_url": b.get("logo_url", ""),
        "primary_color": b.get("primary_color", "#B0904F"),
        "accent_color": b.get("accent_color", "#977937"),
        "font": b.get("font", ""),
        "tagline": b.get("tagline", ""),
        "footer_credit": b.get("footer_credit") or DEFAULT_FOOTER_CREDIT,
    }


@api.put("/branding")
async def put_branding(body: BrandingIn, user: dict = Depends(require_company_superadmin)):
    _ = await require_tenant_write(user)
    tenant = await db.tenants.find_one({"_id": oid(user["tenant_id"])})
    b = tenant.get("branding", {}) or {}
    incoming = {k: v for k, v in body.model_dump().items() if v is not None}
    incoming.pop("footer_credit", None)  # platform-controlled; tenants cannot change the credit
    if incoming.get("logo_data") and len(incoming["logo_data"]) > 3_000_000:
        raise HTTPException(status_code=400, detail="Logo is too large (max ~2MB). Please upload a smaller image.")
    b.update(incoming)
    b["footer_credit"] = DEFAULT_FOOTER_CREDIT  # always enforce platform credit
    await db.tenants.update_one({"_id": tenant["_id"]}, {"$set": {"branding": b, "name": b.get("brand_name") or tenant.get("name")}})
    fresh = await db.tenants.find_one({"_id": tenant["_id"]})
    return tenant_public(fresh)["branding"]


# =================================================================== SEED helpers
SOURCE_Q = {
    "id": "source",
    "label": "How did you hear about us?",
    "type": "dropdown",
    "options": ["Instagram", "Facebook", "Google Search", "Friend / Word of Mouth", "Wedding Fair", "Walk-in / Passing", "Other"],
    "required": False,
}

DEFAULT_HOURS = {
    "0": {"closed": True, "open": "10:00", "close": "17:00"},
    "1": {"closed": False, "open": "10:00", "close": "17:00"},
    "2": {"closed": False, "open": "10:00", "close": "17:00"},
    "3": {"closed": False, "open": "10:00", "close": "17:00"},
    "4": {"closed": False, "open": "10:00", "close": "17:00"},
    "5": {"closed": False, "open": "10:00", "close": "16:00"},
    "6": {"closed": True, "open": "10:00", "close": "17:00"},
}

DEFAULT_TYPES = [
    {"name": "Bridal Appointment", "duration": 90, "description": "Our signature private styling session.", "active": True},
    {"name": "First Look Consultation", "duration": 60, "description": "Begin your search with expert guidance.", "active": True},
    {"name": "Dress Fitting", "duration": 60, "description": "Fittings & alteration guidance.", "active": True},
    {"name": "Gown Collection", "duration": 30, "description": "Collect your finished gown.", "active": True},
]


async def _seed_tenant(tenant_id: str, locations: int = 1):
    if await db.shops.count_documents({"tenant_id": tenant_id}) > 0:
        return
    for i in range(locations):
        name = "Main Boutique" if i == 0 else f"Boutique {i + 1}"
        shop = {
            "tenant_id": tenant_id, "name": name, "slug": slugify(name), "role_label": "Wedding Dresses",
            "address": "", "phone": "", "email": "", "order": i,
            "blurb": "A private, unhurried bridal styling experience.",
            "hours_text": "Tue–Sat by appointment", "what_to_expect": "", "photo_url": "",
            "questions": [dict(SOURCE_Q)], "deposit_amount": 0, "deposit_required": False,
        }
        res = await db.shops.insert_one(shop)
        sid = str(res.inserted_id)
        await db.availability.insert_one({"tenant_id": tenant_id, "shop_id": sid, "hours": DEFAULT_HOURS,
                                          "slot_step": 30, "capacity": 1, "buffer": 0})
        for t in DEFAULT_TYPES:
            await db.appointment_types.insert_one({**t, "tenant_id": tenant_id, "shop_id": sid})
    await get_settings(tenant_id)


# =================================================================== reminder loop
async def reminder_loop():
    while True:
        try:
            tenants = await db.tenants.find().to_list(500)
            for tenant in tenants:
                if effective_status(tenant) in ("suspended", "expired"):
                    continue
                tenant_id = str(tenant["_id"])
                settings = await get_settings(tenant_id)
                if not settings.get("notify_reminder"):
                    continue
                cfg = await resolve_cfg(tenant)
                now = datetime.now()
                lo, hi = now + timedelta(hours=23), now + timedelta(hours=25)
                candidates = await db.bookings.find({"tenant_id": tenant_id, "status": "confirmed", "reminder_sent": {"$ne": True}}, {
                    "date": 1, "start_time": 1, "customer_email": 1, "customer_name": 1,
                    "appointment_type_name": 1, "shop_name": 1, "reference": 1
                }).to_list(500)
                for b in candidates:
                    try:
                        dt = datetime.strptime(f"{b['date']} {b['start_time']}", "%Y-%m-%d %H:%M")
                    except Exception:
                        continue
                    if lo <= dt <= hi:
                        murl = manage_url(settings, b["reference"])
                        sent = await asyncio.to_thread(
                            _smtp_send, cfg, b["customer_email"], f"Your {brand_name_of(tenant)} appointment is tomorrow",
                            f"Dear {b['customer_name']},\n\nA gentle reminder of your {b['appointment_type_name']} at {b['shop_name']} "
                            f"tomorrow, {b['date']} at {b['start_time']}. Reference {b['reference']}.{manage_link(settings, b['reference'])}",
                            render_email(tenant, "See you tomorrow",
                                         [f"Dear {b['customer_name'].split(' ')[0]}, a gentle reminder of your <strong>{b['appointment_type_name']}</strong> at <strong>{b['shop_name']}</strong> tomorrow:",
                                          f"<strong>{b['date']} at {b['start_time']}</strong>",
                                          f"Reference: <strong>{b['reference']}</strong>. We look forward to welcoming you."],
                                         cta={"url": murl, "label": "View My Appointment"} if murl else None),
                            _logo_bytes(tenant))
                        if sent:
                            await db.bookings.update_one({"_id": b["_id"]}, {"$set": {"reminder_sent": True}})
        except Exception as e:
            logger.error("reminder loop error: %s", e)
        await asyncio.sleep(1800)


async def billing_loop():
    """Daily check: auto-generate & send invoices for tenants whose next due date has arrived,
    then roll their next due date forward by one cycle. Idempotent via invoice period_key."""
    # small delay so startup/seed completes first
    await asyncio.sleep(30)
    while True:
        try:
            tenants = await db.tenants.find({"billing.active": True}).to_list(500)
            for t in tenants:
                try:
                    billing = t.get("billing") or {}
                    if effective_status(t) == "suspended":
                        continue
                    due = parse_dt(billing.get("next_due_date"))
                    if not due or now_utc() < due:
                        continue
                    # Generate + send this period's invoice (idempotent), then advance the clock.
                    await create_and_maybe_send_invoice(t, send=True, period_dt=due)
                    new_due = add_cycle(due, billing.get("cycle", "monthly"))
                    # guard against long downtime: roll forward until in the future
                    while new_due < now_utc():
                        new_due = add_cycle(new_due, billing.get("cycle", "monthly"))
                    await db.tenants.update_one({"_id": t["_id"]}, {"$set": {"billing.next_due_date": new_due.isoformat()}})
                    logger.info("Auto-invoiced %s; next due %s", t.get("name"), new_due.date())
                except Exception as e:
                    logger.error("billing loop (tenant %s) error: %s", t.get("slug"), e)
        except Exception as e:
            logger.error("billing loop error: %s", e)
        await asyncio.sleep(6 * 3600)  # re-check every 6 hours


# =================================================================== seed + startup
async def seed():
    await db.tenants.create_index("slug", unique=True)
    await db.platform_users.create_index("email", unique=True)
    await db.users.create_index([("tenant_id", 1), ("email", 1)], unique=True)
    await db.bookings.create_index([("tenant_id", 1), ("shop_id", 1), ("date", 1), ("status", 1)])
    await db.bookings.create_index([("tenant_id", 1), ("reference", 1)], unique=True)
    await db.blocked_dates.create_index([("tenant_id", 1), ("shop_id", 1), ("date", 1)])
    await db.appointment_types.create_index([("tenant_id", 1), ("shop_id", 1)])
    await db.availability.create_index([("tenant_id", 1), ("shop_id", 1)])
    await db.settings.create_index("tenant_id", unique=True)
    await db.invoices.create_index("period_key", unique=True)
    await db.invoices.create_index([("tenant_id", 1), ("created_at", -1)])

    # Migration: ensure every tenant has a shop allowance (default = current shop count)
    async for t in db.tenants.find({"max_locations": {"$exists": False}}):
        cnt = await db.shops.count_documents({"tenant_id": str(t["_id"])})
        await db.tenants.update_one({"_id": t["_id"]}, {"$set": {"max_locations": max(1, cnt)}})

    email = os.environ["PLATFORM_SUPERADMIN_EMAIL"].lower()
    existing = await db.platform_users.find_one({"email": email})
    if not existing:
        await db.platform_users.insert_one({
            "name": os.environ.get("PLATFORM_SUPERADMIN_NAME", "Platform Owner"),
            "email": email,
            "password_hash": hash_password(os.environ["PLATFORM_SUPERADMIN_PASSWORD"]),
            "role": "platform_superadmin",
            "totp_enabled": False,
            "totp_secret": None,
            "created_at": now_utc().isoformat(),
        })
        logger.info("Seeded platform superadmin %s", email)
    elif not verify_password(os.environ["PLATFORM_SUPERADMIN_PASSWORD"], existing["password_hash"]):
        await db.platform_users.update_one({"email": email}, {"$set": {"password_hash": hash_password(os.environ["PLATFORM_SUPERADMIN_PASSWORD"])}})


@app.on_event("startup")
async def startup():
    await seed()
    asyncio.create_task(reminder_loop())
    asyncio.create_task(billing_loop())


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/health")
async def health():
    return {"ok": True}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
