"""
Verifies the PLATFORM email settings (new) against a local authenticated SMTP server,
using the Hostinger-style single Email Address (= username + from) model.
Run: python /app/tests/platform_email_test.py
"""
import time
import requests
from aiosmtpd.controller import Controller
from aiosmtpd.smtp import AuthResult

B = "http://localhost:8001/api"
GOOD_USER = "admin@ivory-digital.uk"
GOOD_PASS = "platpass"
CAPTURED = []


def authenticator(server, session, envelope, mechanism, auth_data):
    u = getattr(auth_data, "login", b"")
    p = getattr(auth_data, "password", b"")
    u = u.decode() if isinstance(u, bytes) else str(u)
    p = p.decode() if isinstance(p, bytes) else str(p)
    return AuthResult(success=(u == GOOD_USER and p == GOOD_PASS))


class Handler:
    async def handle_DATA(self, server, session, envelope):
        CAPTURED.append(envelope.rcpt_tos)
        return "250 OK"


def main():
    controller = Controller(Handler(), hostname="127.0.0.1", port=8027,
                            authenticator=authenticator, auth_required=True, auth_require_tls=False)
    controller.start()
    ok = fail = 0

    def check(cond, msg):
        nonlocal ok, fail
        if cond: ok += 1; print("  PASS:", msg)
        else: fail += 1; print("  ****FAIL:", msg)

    try:
        tok = requests.post(f"{B}/platform/login", json={"email": GOOD_USER, "password": "IvoryAdmin2025!"}).json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}

        print("\n=== Platform email: save (single Email Address = username+from) ===")
        r = requests.put(f"{B}/platform/email-settings", headers=h, json={
            "smtp_host": "127.0.0.1", "smtp_port": 8027, "sender_email": GOOD_USER,
            "smtp_password": " plat pass ", "sender_name": "Ivory Digital"})
        check(r.status_code == 200, f"save platform email -> {r.status_code}")
        g = requests.get(f"{B}/platform/email-settings", headers=h).json()
        check(g["smtp_password"] == "********", "password is masked on GET")
        check(g["sender_email"] == GOOD_USER, "sender email persisted")

        print("\n=== Platform email: send test (uses email as username, strips password spaces) ===")
        CAPTURED.clear()
        r = requests.post(f"{B}/platform/email-settings/test", headers=h, json={"to": "someone@example.com"}, timeout=30)
        print("   test resp:", r.status_code, r.text[:150])
        check(r.status_code == 200, "platform test email succeeds via local authenticated SMTP")
        time.sleep(0.5)
        check(len(CAPTURED) == 1, "platform test email actually delivered")

        print("\n=== Platform email: wrong password surfaces error ===")
        requests.put(f"{B}/platform/email-settings", headers=h, json={"smtp_password": "WRONG"})
        r = requests.post(f"{B}/platform/email-settings/test", headers=h, json={"to": "someone@example.com"}, timeout=30)
        check(r.status_code == 400, f"wrong password -> 400 ({r.status_code})")

        print(f"\n=========== RESULT: {ok} passed, {fail} failed ===========")
    finally:
        controller.stop()


if __name__ == "__main__":
    main()
