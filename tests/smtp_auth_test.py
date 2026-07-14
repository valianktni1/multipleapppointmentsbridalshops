"""
Verifies the SMTP AUTH fixes against a LOCAL authenticated SMTP server:
  - username fallback: leaving 'SMTP Username' blank uses the sender email to log in
  - app-password spaces are stripped
  - wrong password surfaces a clear error (not swallowed)
Run: python /app/tests/smtp_auth_test.py
"""
import time
import requests
from datetime import date, timedelta
from aiosmtpd.controller import Controller
from aiosmtpd.smtp import AuthResult

B = "http://localhost:8001/api"
GOOD_USER = "owner@superbrides.co.uk"
GOOD_PASS = "secretpass"
CAPTURED = []


def authenticator(server, session, envelope, mechanism, auth_data):
    username = getattr(auth_data, "login", b"").decode() if isinstance(getattr(auth_data, "login", b""), bytes) else str(getattr(auth_data, "login", ""))
    password = getattr(auth_data, "password", b"").decode() if isinstance(getattr(auth_data, "password", b""), bytes) else str(getattr(auth_data, "password", ""))
    if username == GOOD_USER and password == GOOD_PASS:
        return AuthResult(success=True)
    return AuthResult(success=False)


class Handler:
    async def handle_DATA(self, server, session, envelope):
        CAPTURED.append(envelope.rcpt_tos)
        return "250 OK"


def owner_headers():
    tok = requests.post(f"{B}/auth/login", headers={"X-Tenant": "superbrides"},
                        json={"email": "owner@superbrides.co.uk", "password": "super123"}).json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "X-Tenant": "superbrides"}


def main():
    controller = Controller(Handler(), hostname="127.0.0.1", port=8026,
                            authenticator=authenticator, auth_required=True, auth_require_tls=False)
    controller.start()
    ok = fail = 0

    def check(cond, msg):
        nonlocal ok, fail
        if cond: ok += 1; print("  PASS:", msg)
        else: fail += 1; print("  ****FAIL:", msg)

    try:
        ah = owner_headers()

        print("\n=== 1. Username fallback (blank SMTP username -> uses sender email) ===")
        # sender_email == GOOD_USER, smtp_user left BLANK, password with trailing spaces
        requests.put(f"{B}/auth/my-email-settings", headers=ah, json={
            "smtp_host": "127.0.0.1", "smtp_port": 8026, "smtp_user": "",
            "smtp_password": "  secr etpass ", "sender_email": GOOD_USER, "sender_name": "Mark"})
        CAPTURED.clear()
        r = requests.post(f"{B}/auth/my-email-settings/test", headers=ah, json={"to": "someone@example.com"}, timeout=30)
        print("   test resp:", r.status_code, r.text[:160])
        check(r.status_code == 200, "test email succeeds with blank username (fallback) + spaced app password")
        time.sleep(0.5)
        check(len(CAPTURED) == 1, "email actually delivered to the SMTP server")

        print("\n=== 2. Wrong password surfaces a clear error ===")
        requests.put(f"{B}/auth/my-email-settings", headers=ah, json={
            "smtp_host": "127.0.0.1", "smtp_port": 8026, "smtp_user": GOOD_USER,
            "smtp_password": "WRONGpass", "sender_email": GOOD_USER})
        r = requests.post(f"{B}/auth/my-email-settings/test", headers=ah, json={"to": "someone@example.com"}, timeout=30)
        print("   test resp:", r.status_code, r.text[:200])
        check(r.status_code == 400, "wrong password returns 400 (not 200)")
        check("could not send" in r.text.lower(),
              "the real SMTP failure reason is surfaced to the user (not swallowed/generic-success)")

        # reset so superbrides has no smtp afterwards
        requests.put(f"{B}/auth/my-email-settings", headers=ah, json={"smtp_host": "", "smtp_user": "", "smtp_password": ""})
        print(f"\n=========== RESULT: {ok} passed, {fail} failed ===========")
    finally:
        controller.stop()


if __name__ == "__main__":
    main()
