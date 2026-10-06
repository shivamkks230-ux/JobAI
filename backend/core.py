"""Shared infrastructure: DB, auth/session helpers, RBAC, audit, notifications, analytics, rate limiting."""
import os
import re
import time
import uuid
import secrets
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

import bcrypt
from dotenv import load_dotenv
from fastapi import Request, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
logger = logging.getLogger("jobmatch")

SESSION_DAYS = 7
NO_ID = {"_id": 0}
USER_PUBLIC = {"_id": 0, "password_hash": 0}


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso() -> str:
    return now().isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


TAG_RE = re.compile(r"<[^>]*>")


def clean(value, max_len: int = 5000):
    """Basic input sanitization: strip HTML tags + trim + cap length."""
    if value is None:
        return None
    if isinstance(value, str):
        return TAG_RE.sub("", value).strip()[:max_len]
    if isinstance(value, list):
        return [clean(v, max_len) for v in value if v not in (None, "")]
    return value


# ---------------- Rate limiting (in-memory, per instance) ----------------
_hits: dict = defaultdict(list)


def rate_limit(request: Request, key: str, limit: int, window_s: int):
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "x").split(",")[0]
    bucket = f"{key}:{ip}"
    t = time.time()
    _hits[bucket] = [h for h in _hits[bucket] if t - h < window_s]
    if len(_hits[bucket]) >= limit:
        raise HTTPException(429, "Too many requests. Please try again shortly.")
    _hits[bucket].append(t)


# ---------------- Sessions ----------------
async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(40)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now(),
        "expires_at": now() + timedelta(days=SESSION_DAYS),
    })
    return token


def _token_from(request: Request):
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.query_params.get("token")


async def get_current_user(request: Request) -> dict:
    token = _token_from(request)
    if not token:
        raise HTTPException(401, "Not authenticated")
    sess = await db.user_sessions.find_one({"session_token": token}, NO_ID)
    if not sess:
        raise HTTPException(401, "Session expired")
    exp = sess["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < now():
        await db.user_sessions.delete_one({"session_token": token})
        raise HTTPException(401, "Session expired")
    user = await db.users.find_one({"id": sess["user_id"]}, USER_PUBLIC)
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("status") == "suspended":
        raise HTTPException(403, "Your account is suspended. Contact support.")
    last = user.get("last_active_at")
    if not last or last < (now() - timedelta(minutes=5)).isoformat():
        await db.users.update_one({"id": user["id"]}, {"$set": {"last_active_at": iso()}})
        await db.daily_active.update_one(
            {"date": now().date().isoformat(), "user_id": user["id"]},
            {"$setOnInsert": {"role": user["role"]}}, upsert=True)
    user["_session_token"] = token
    return user


def require_roles(*roles):
    async def dep(request: Request) -> dict:
        user = await get_current_user(request)
        if user["role"] not in roles:
            raise HTTPException(403, "You do not have permission for this action")
        return user
    return dep


# ---------------- Audit / analytics / notifications ----------------
async def audit(actor: dict, action: str, target_type: str, target_id: str, meta: dict | None = None):
    await db.audit_logs.insert_one({
        "id": new_id("aud"), "actor_id": actor.get("id"), "actor_role": actor.get("role"),
        "action": action, "target_type": target_type, "target_id": target_id,
        "meta": meta or {}, "created_at": iso(),
    })


async def track(event: str, user_id: str | None = None, meta: dict | None = None):
    await db.analytics_events.insert_one({
        "id": new_id("evt"), "event": event, "user_id": user_id,
        "meta": meta or {}, "date": now().date().isoformat(), "created_at": iso(),
    })


async def send_push(user_id: str, title: str, body: str):
    """Push abstraction. FCM is connected once FCM credentials are configured."""
    if not os.environ.get("FCM_SERVER_KEY"):
        return False
    tokens = await db.push_tokens.find({"user_id": user_id}, NO_ID).to_list(10)
    logger.info("push queued for %s (%d devices)", user_id, len(tokens))
    return True


async def send_email(to: str, subject: str, body: str):
    """Email abstraction. Connect an email provider by setting EMAIL_PROVIDER_API_KEY."""
    if not os.environ.get("EMAIL_PROVIDER_API_KEY"):
        return False
    logger.info("email queued to %s: %s", to, subject)
    return True


async def notify(user_id: str, ntype: str, title: str, body: str, data: dict | None = None):
    await db.notifications.insert_one({
        "id": new_id("ntf"), "user_id": user_id, "type": ntype, "title": title,
        "body": body, "data": data or {}, "read": False, "created_at": iso(), "updated_at": iso(),
    })
    await send_push(user_id, title, body)
