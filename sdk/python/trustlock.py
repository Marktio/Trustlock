"""
TrustLock client for server-side Python (3.9+). One file, standard library only. Copy it into your project.

    from trustlock import TrustLock
    tl = TrustLock(api_key=os.environ["TRUSTLOCK_API_KEY"], base_url="https://your-trustlock-host")
    tl.users.upsert("cust-1001", "Amina", "client")
    contract = tl.as_user("cust-1001").contracts.create({...}, idempotency_key=f"order-{order_id}")

Keep the API key on your server. Never ship it to a browser or a mobile app.
Amounts are minor units (100 = 1 credit).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Any, Optional

__all__ = ["TrustLock", "TrustLockError", "verify_webhook"]


class TrustLockError(Exception):
    """Every failed call raises this. `code` is the stable machine-readable part, `message` is safe to show."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.status, self.code, self.message = status, code, message


class _Client:
    def __init__(self, api_key: str, base_url: str, max_retries: int, timeout: float):
        if not api_key.startswith("tlk_"):
            raise ValueError("TrustLock: api_key should start with tlk_")
        self.api_key, self.base_url = api_key, base_url.rstrip("/")
        self.max_retries, self.timeout = max_retries, timeout

    def request(self, method: str, path: str, *, user: Optional[str] = None, body: Any = None, idem: Any = None) -> Any:
        headers = {"Authorization": f"Bearer {self.api_key}", "Accept": "application/json"}
        if user:
            headers["TrustLock-User"] = user
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        key = f"sdk-{uuid.uuid4()}" if idem is True else idem
        if key:
            headers["Idempotency-Key"] = key
        # A request may be repeated after a failure only if repeating it cannot do anything twice.
        repeatable = method == "GET" or bool(key)

        attempt = 0
        while True:
            last = attempt >= self.max_retries
            req = urllib.request.Request(f"{self.base_url}/api/v1{path}", data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as res:
                    return json.loads(res.read() or b"null")
            except urllib.error.HTTPError as e:
                payload = _json_or_none(e.read())
                err = (payload or {}).get("error", {}) if isinstance(payload, dict) else {}
                # 429 was refused before it did anything, so it is always safe to repeat.
                if not last and (e.code == 429 or (e.code >= 500 and repeatable)):
                    wait = _retry_after(e.headers.get("Retry-After"))
                    time.sleep(min(wait, 30) if e.code == 429 and wait > 0 else 0.2 * 2**attempt)
                    attempt += 1
                    continue
                raise TrustLockError(e.code, err.get("code", "UNKNOWN"), err.get("message", f"TrustLock answered {e.code}")) from None
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if not repeatable or last:
                    raise
                time.sleep(0.2 * 2**attempt)
                attempt += 1


def _json_or_none(raw: bytes) -> Any:
    try:
        return json.loads(raw)
    except ValueError:
        return None


def _retry_after(value: Optional[str]) -> float:
    try:
        return float(value) if value else 0.0
    except ValueError:
        return 0.0


class _Users:
    def __init__(self, c: _Client):
        self._c = c

    def upsert(self, id: str, name: str, role: str) -> dict:
        """Link one of your users. Safe to repeat. role is "client" or "freelancer" and cannot change later."""
        return self._c.request("POST", "/users", body={"external_id": id, "name": name, "role": role})

    def get(self, id: str) -> dict:
        return self._c.request("GET", f"/users/{urllib.parse.quote(id, safe='')}")


class _Webhooks:
    def __init__(self, c: _Client):
        self._c = c

    def create(self, url: str, events: Optional[list] = None) -> dict:
        """The response holds the signing `secret` once. Store it."""
        return self._c.request("POST", "/webhook-endpoints", body={"url": url, "events": events or ["*"]})

    def list(self) -> list:
        return self._c.request("GET", "/webhook-endpoints")["data"]

    def get(self, id: str) -> dict:
        return self._c.request("GET", f"/webhook-endpoints/{id}")

    def delete(self, id: str) -> dict:
        return self._c.request("DELETE", f"/webhook-endpoints/{id}")

    def test(self, id: str) -> dict:
        """Sends a ping now and reports how your server answered."""
        return self._c.request("POST", f"/webhook-endpoints/{id}/test")


class _Wallet:
    def __init__(self, c: _Client, user: str):
        self._c, self._u = c, user

    def get(self) -> dict:
        return self._c.request("GET", "/wallet", user=self._u)

    def top_up(self, amount: int, idempotency_key: Optional[str] = None) -> dict:
        return self._c.request("POST", "/wallet/top-ups", user=self._u, body={"amount": amount}, idem=idempotency_key or True)

    def withdraw(self, amount: int, idempotency_key: Optional[str] = None) -> dict:
        return self._c.request("POST", "/wallet/withdrawals", user=self._u, body={"amount": amount}, idem=idempotency_key or True)


class _Contracts:
    def __init__(self, c: _Client, user: str):
        self._c, self._u = c, user

    def _act(self, id: str, action: str, body: Any = None, idem: Any = None) -> dict:
        return self._c.request("POST", f"/contracts/{id}/{action}", user=self._u, body=body, idem=idem)

    def list(self, state: Optional[str] = None) -> list:
        q = f"?state={urllib.parse.quote(state)}" if state else ""
        return self._c.request("GET", f"/contracts{q}", user=self._u)["data"]

    def get(self, id: str) -> dict:
        """Includes `allowed_actions`: what this user can do right now. Drive your buttons from it."""
        return self._c.request("GET", f"/contracts/{id}", user=self._u)

    def create(self, contract: dict, idempotency_key: Optional[str] = None) -> dict:
        """The client proposes a contract to one of your freelancers. Derive the key from YOUR record (e.g. f"create-{order_id}")."""
        return self._c.request("POST", "/contracts", user=self._u, body=contract, idem=idempotency_key or True)

    def accept(self, id: str) -> dict: return self._act(id, "accept")
    def reject(self, id: str, reason: str) -> dict: return self._act(id, "reject", {"reason": reason})
    def counter(self, id: str, terms: dict) -> dict: return self._act(id, "counter", terms)
    def accept_counter(self, id: str) -> dict: return self._act(id, "accept-counter")
    def decline_counter(self, id: str, reason: str) -> dict: return self._act(id, "decline-counter", {"reason": reason})
    def cancel(self, id: str, reason: Optional[str] = None) -> dict: return self._act(id, "cancel", {"reason": reason} if reason else None)

    def fund(self, id: str, idempotency_key: Optional[str] = None) -> dict:
        """Moves the client's credits into escrow."""
        return self._act(id, "fund", idem=idempotency_key or True)

    def start_work(self, id: str) -> dict: return self._act(id, "start-work")

    def deliver(self, id: str, file_name: str, size_bytes: int, sha256: str, note: Optional[str] = None) -> dict:
        """Records the file by name, size and SHA-256. The file itself stays with you."""
        body = {"file_name": file_name, "size_bytes": size_bytes, "sha256": sha256}
        if note:
            body["note"] = note
        return self._act(id, "deliver", body)

    def request_revision(self, id: str, reason: str) -> dict: return self._act(id, "request-revision", {"reason": reason})

    def approve(self, id: str, idempotency_key: Optional[str] = None) -> dict:
        """Releases the escrow to the freelancer (minus the platform fee)."""
        return self._act(id, "approve", idem=idempotency_key or True)

    def dispute(self, id: str, reason: str) -> dict: return self._act(id, "dispute", {"reason": reason})
    def withdraw_dispute(self, id: str) -> dict: return self._act(id, "withdraw-dispute")
    def cancel_funded(self, id: str) -> dict: return self._act(id, "cancel-funded")
    def decline_cancel(self, id: str) -> dict: return self._act(id, "decline-cancel")
    def message(self, id: str, text: str) -> dict: return self._act(id, "message", {"text": text})

    def submit_evidence(self, id: str, text: Optional[str] = None, files: Optional[list] = None) -> dict:
        """Dispute evidence: a note and/or files, each {"file_name", "size_bytes", "sha256"}."""
        body: dict = {}
        if text:
            body["text"] = text
        if files:
            body["files"] = files
        return self._act(id, "evidence", body)


class _AsUser:
    def __init__(self, c: _Client, user: str):
        self.wallet, self.contracts = _Wallet(c, user), _Contracts(c, user)


class TrustLock:
    def __init__(self, api_key: str, base_url: str, max_retries: int = 2, timeout: float = 15.0):
        c = self._c = _Client(api_key, base_url, max_retries, timeout)
        self.users, self.webhooks = _Users(c), _Webhooks(c)

    def as_user(self, user_id: str) -> _AsUser:
        """Everything on the result runs as this user, with exactly the powers they have in TrustLock."""
        return _AsUser(self._c, user_id)

    def usage(self, limit: int = 50) -> list:
        """The most recent calls made with your keys in this mode: what you called and why one failed."""
        return self._c.request("GET", f"/usage?limit={int(limit)}")["data"]


def verify_webhook(raw_body: "str | bytes", signature_header: Optional[str], secret: str, tolerance_seconds: int = 86_400) -> dict:
    """
    Check a webhook before you trust it. Pass the RAW request body (the exact bytes, not re-serialised JSON), the
    TrustLock-Signature header and your endpoint secret. Returns the event dict or raises ValueError.
    Deduplicate on event["id"]: a delivery can arrive more than once, and a retry keeps its original timestamp,
    so the default tolerance is a day.
    """
    body = raw_body.decode() if isinstance(raw_body, bytes) else raw_body
    parts = dict(p.strip().split("=", 1) for p in (signature_header or "").split(",") if "=" in p)
    try:
        t = int(parts["t"])
        v1 = parts["v1"]
    except (KeyError, ValueError):
        raise ValueError("TrustLock webhook: malformed signature header") from None
    if abs(time.time() - t) > tolerance_seconds:
        raise ValueError("TrustLock webhook: timestamp outside tolerance")
    want = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(want, v1):
        raise ValueError("TrustLock webhook: signature does not match")
    return json.loads(body)
