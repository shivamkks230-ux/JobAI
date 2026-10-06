"""Domain constants and helpers shared by routers."""
import re
from datetime import datetime, timedelta, timezone

from core import db, NO_ID, iso, now

STAGES = ["applied", "screening", "shortlisted", "interview", "selected", "hired", "rejected"]
JOB_STATUSES = ["draft", "pending_approval", "published", "paused", "closed", "rejected", "expired"]
WORK_MODES = ["office", "hybrid", "remote"]
EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "temporary"]
COMPANY_STATUSES = ["pending", "verified", "rejected", "suspended"]
REPORT_CATEGORIES = ["fake_job", "scam", "wrong_information", "offensive", "duplicate", "other"]

DEFAULT_PRIVACY = {"profile_visible": True, "share_email_default": True, "share_phone_default": False,
                   "allow_contact": True}

PROFILE_FIELDS = [("name", 10), ("photo_file_id", 5), ("headline", 5), ("current_location", 10),
                  ("preferred_locations", 5), ("experience_years", 10), ("education", 10), ("skills", 15),
                  ("expected_salary", 5), ("notice_period", 5), ("job_types", 5), ("work_preferences", 5),
                  ("preferred_industries", 5), ("preferred_roles", 5)]


def profile_completion(profile: dict, has_resume: bool) -> int:
    total = 0
    for f, w in PROFILE_FIELDS:
        v = profile.get(f)
        if v not in (None, "", []) or (f == "experience_years" and v == 0):
            total += w
    # resume bonus folded into scale: fields max 100, resume counts as 0..10 extra scaled down
    pct = round(total * 0.9 + (10 if has_resume else 0))
    return min(100, pct)


async def get_profile(user_id: str) -> dict | None:
    return await db.candidate_profiles.find_one({"user_id": user_id}, NO_ID)


async def active_resume(user_id: str) -> dict | None:
    return await db.resumes.find_one({"user_id": user_id, "is_active": True, "deleted": {"$ne": True}}, NO_ID)


RISK_PATTERNS = [
    (r"(registration|security|processing|joining|training|application)\s*(fee|deposit|charge)", "Payment request detected"),
    (r"\bpay\s*(rs\.?|inr|₹)\s*\d+", "Payment request detected"),
    (r"whats\s*app|telegram", "Off-platform contact (WhatsApp/Telegram)"),
    (r"(\+91[\s-]?)?[6-9]\d{9}", "Personal phone number in description"),
    (r"[\w.]+@(gmail|yahoo|hotmail|outlook)\.com", "Personal email in description"),
    (r"earn\s*(rs\.?|₹)?\s*\d+.*(per day|daily)|work from home.*earn", "Unrealistic earning claim"),
]


async def detect_risk(job: dict, exclude_id: str | None = None) -> list:
    text = " ".join(str(job.get(k) or "") for k in ("title", "description", "responsibilities", "benefits"))
    flags = []
    for pat, label in RISK_PATTERNS:
        if re.search(pat, text, re.I) and label not in flags:
            flags.append(label)
    smax = job.get("salary_max") or 0
    annual = smax * 12 if job.get("salary_period") == "monthly" else smax
    if annual > 20000000 and (job.get("max_experience") or 0) < 5:
        flags.append("Unusually high salary for experience level")
    q = {"company_id": job.get("company_id"), "title": job.get("title"),
         "status": {"$in": ["published", "pending_approval"]}}
    if exclude_id:
        q["id"] = {"$ne": exclude_id}
    if job.get("company_id") and await db.jobs.find_one(q, {"_id": 1}):
        flags.append("Possible duplicate job")
    return flags


def annual(amount, period) -> float:
    if not amount:
        return 0
    return float(amount) * (12 if period == "monthly" else 1)


_last_expire = {"t": None}


async def expire_jobs():
    t = now()
    if _last_expire["t"] and t - _last_expire["t"] < timedelta(minutes=1):
        return
    _last_expire["t"] = t
    await db.jobs.update_many({"status": "published", "application_deadline": {"$nin": [None, ""], "$lt": t.date().isoformat()}},
                              {"$set": {"status": "expired", "updated_at": iso()}})


def job_card(job: dict) -> dict:
    keys = ["id", "title", "company_id", "company_name", "company_logo_id", "company_verified", "location",
            "salary_min", "salary_max", "salary_period", "min_experience", "max_experience", "work_mode",
            "employment_type", "industry", "category", "posted_at", "featured", "is_external", "source",
            "is_test", "status", "required_skills", "openings"]
    return {k: job.get(k) for k in keys}


def public_job(job: dict) -> dict:
    j = {k: v for k, v in job.items() if k not in ("risk_flags", "moderation_note")}
    return j


async def recruiter_company(user: dict) -> dict | None:
    if not user.get("company_id"):
        return None
    return await db.companies.find_one({"id": user["company_id"]}, NO_ID)


async def get_plan(user: dict) -> dict:
    sub = await db.subscriptions.find_one({"user_id": user["id"], "status": "active"}, NO_ID, sort=[("created_at", -1)])
    code = "free"
    if sub:
        plan = await db.plans.find_one({"id": sub["plan_id"]}, NO_ID)
        if plan:
            return plan
    audience = "recruiter" if user["role"] == "recruiter" else "candidate"
    return await db.plans.find_one({"audience": audience, "code": code}, NO_ID) or {"code": "free", "job_post_limit": 2}


def days_ago_iso(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
