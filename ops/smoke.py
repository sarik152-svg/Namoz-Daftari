"""Run inside the web container; no credentials or response data are printed."""
import json
import urllib.error
import urllib.request

from app.config import load_settings

BASE = "http://127.0.0.1:8080"


def request(path, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    payload = None if data is None else json.dumps(data).encode()
    req = urllib.request.Request(BASE + path, data=payload, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)


assert request("/health")["status"] == "ok"
try:
    request("/api/v1/state")
except urllib.error.HTTPError as error:
    assert error.code == 401, error.code
else:
    raise AssertionError("Unauthenticated state must be private")

settings = load_settings()
session = request("/api/v1/auth/admin", "POST", {"password": settings.admin_password})
token = session["token"]
try:
    assert session["is_admin"] is True
    identity = request("/api/v1/auth/me", token=token)
    assert identity["is_admin"] is True and identity["member_id"] is None
finally:
    request("/api/v1/auth/session", "DELETE", token=token)
print("PASS: database health, private API protection, original admin login, logout")
