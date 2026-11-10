"""
The same marketplace walkthrough as marketplace.ts, in Python. Run against a local TrustLock (TRUSTLOCK_DEV_API_KEY set):
  TRUSTLOCK_API_KEY=tlk_... TRUSTLOCK_URL=http://localhost:3000 python3 examples/marketplace.py
"""
import hashlib, os, sys, time, hmac, json, uuid
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "sdk", "python"))
from trustlock import TrustLock, TrustLockError, verify_webhook

tl = TrustLock(api_key=os.environ["TRUSTLOCK_API_KEY"], base_url=os.environ.get("TRUSTLOCK_URL", "http://localhost:3000"))
run = uuid.uuid4().hex[:8]
buyer, seller = f"py-buyer-{run}", f"py-seller-{run}"

print("== link users")
tl.users.upsert(buyer, "Amina Wanjiru", "client")
tl.users.upsert(seller, "Brian Otieno", "freelancer")
tl.users.upsert(buyer, "Amina Wanjiru", "client")  # safe to repeat

print("== top up, create, accept, fund")
tl.as_user(buyer).wallet.top_up(500_00, idempotency_key=f"topup-{run}")
order = f"order-{run}"
terms = dict(freelancer=seller, title="Logo", description=f"Acme order {order}", amount=200_00, review_period_days=3, revision_limit=1,
             milestones=[dict(title="Delivery", due_date="2026-12-31", amount=200_00)])
c = tl.as_user(buyer).contracts.create(terms, idempotency_key=f"create-{order}")
again = tl.as_user(buyer).contracts.create(terms, idempotency_key=f"create-{order}")
assert again["id"] == c["id"], "same idempotency key must return the same contract"
tl.as_user(seller).contracts.accept(c["id"])
tl.as_user(buyer).contracts.fund(c["id"], idempotency_key=f"fund-{order}")
print("buyer wallet:", {k: v for k, v in tl.as_user(buyer).wallet.get().items() if k in ("available", "held")})

print("== deliver and approve")
tl.as_user(seller).contracts.start_work(c["id"])
data = b"logo-v1"
tl.as_user(seller).contracts.deliver(c["id"], "logo.pdf", len(data), hashlib.sha256(data).hexdigest(), "First version")
print("buyer can:", tl.as_user(buyer).contracts.get(c["id"])["allowed_actions"])
done = tl.as_user(buyer).contracts.approve(c["id"], idempotency_key=f"approve-{order}")
assert done["state"] == "completed", done["state"]

print("== dispute with evidence")
c2 = tl.as_user(buyer).contracts.create({**terms, "title": "Logo 2"}, idempotency_key=f"create-{order}-b")
tl.as_user(seller).contracts.accept(c2["id"])
tl.as_user(buyer).contracts.fund(c2["id"], idempotency_key=f"fund-{order}-b")
tl.as_user(seller).contracts.start_work(c2["id"])
tl.as_user(seller).contracts.deliver(c2["id"], "logo2.pdf", len(data), hashlib.sha256(data).hexdigest())
tl.as_user(buyer).contracts.dispute(c2["id"], "Not what we agreed")
tl.as_user(seller).contracts.submit_evidence(c2["id"], text="Matches the brief", files=[dict(file_name="brief.pdf", size_bytes=10, sha256=hashlib.sha256(b"x").hexdigest())])
assert tl.as_user(buyer).contracts.get(c2["id"])["state"] == "disputed"

print("== typed errors")
try:
    tl.as_user(buyer).contracts.get("00000000-0000-0000-0000-000000000000")
    raise SystemExit("expected an error")
except TrustLockError as e:
    assert (e.status, e.code) == (404, "NOT_FOUND"), (e.status, e.code)
    print("caught", e)

print("== webhooks and usage")
ep = tl.webhooks.create("https://example.com/hooks/trustlock")
assert ep["secret"].startswith("whsec_") or len(ep["secret"]) > 16
assert any(x["id"] == ep["id"] for x in tl.webhooks.list())
tl.webhooks.delete(ep["id"])
body = json.dumps({"id": "evt_1", "type": "contract.funded", "created_at": "now", "data": {}})
t = int(time.time())
sig = f"t={t},v1={hmac.new(b'shh', f'{t}.{body}'.encode(), hashlib.sha256).hexdigest()}"
assert verify_webhook(body, sig, "shh")["id"] == "evt_1"
for bad in (sig[:-1] + "0", f"t={t - 10**6},v1=" + sig.split("v1=")[1], "garbage"):
    try:
        verify_webhook(body, bad, "shh"); raise SystemExit("bad signature accepted")
    except ValueError:
        pass
print("recent calls:", [(u["method"], u["path"], u["status"]) for u in tl.usage(3)])
print("\nPython client OK")
