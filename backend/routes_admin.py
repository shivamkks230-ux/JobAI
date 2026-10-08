"""Admin routes: users, companies, job moderation, reports, analytics, taxonomy, plans, test data."""
import os
import re
from typing import Optional, Literal, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core import db, iso, new_id, clean, require_roles, audit, notify
from domain import days_ago_iso, expire_jobs, profile_completion
from routes_recruiter import JobIn, _job_fields

router = APIRouter(prefix="/api/admin")
admin_only = require_roles("admin")


@router.get("/metrics")
async def metrics(user=Depends(admin_only)):
    await expire_jobs()
    revenue = 0
    async for r in db.payments.aggregate([{"$match": {"status": "paid"}}, {"$group": {"_id": None, "s": {"$sum": "$amount_inr"}}}]):
        revenue = r["s"]
    return {
        "total_users": await db.users.count_documents({}),
        "candidates": await db.users.count_documents({"role": "candidate"}),
        "recruiters": await db.users.count_documents({"role": "recruiter"}),
        "active_users": await db.users.count_documents({"last_active_at": {"$gte": days_ago_iso(30)}}),
        "total_companies": await db.companies.count_documents({}),
        "verified_companies": await db.companies.count_documents({"verification_status": "verified"}),
        "pending_companies": await db.companies.count_documents({"verification_status": "pending"}),
        "total_jobs": await db.jobs.count_documents({}),
        "active_jobs": await db.jobs.count_documents({"status": "published"}),
        "pending_jobs": await db.jobs.count_documents({"status": "pending_approval"}),
        "rejected_jobs": await db.jobs.count_documents({"status": "rejected"}),
        "shortlisted": await db.applications.count_documents({"stage": "shortlisted"}),
        "interview_stage": await db.applications.count_documents({"stage": "interview"}),
        "active_candidates": await db.users.count_documents({"role": "candidate", "last_active_at": {"$gte": days_ago_iso(30)}}),
        "active_recruiters": await db.users.count_documents({"role": "recruiter", "last_active_at": {"$gte": days_ago_iso(30)}}),
        "admins": await db.users.count_documents({"role": "admin"}),
        "applications": await db.applications.count_documents({}),
        "interviews": await db.interviews.count_documents({}),
        "hires": await db.applications.count_documents({"stage": "hired"}),
        "open_reports": await db.reports.count_documents({"status": "open"}),
        "revenue_inr": revenue,
        "test_records": await db.users.count_documents({"is_test": True}) + await db.jobs.count_documents({"is_test": True}),
    }


async def _daily(coll, match: dict, field: str = "created_at", days: int = 14):
    out = {}
    async for r in db[coll].aggregate([{"$match": {**match, field: {"$gte": days_ago_iso(days)}}},
                                       {"$group": {"_id": {"$substr": [f"${field}", 0, 10]}, "n": {"$sum": 1}}}]):
        out[r["_id"]] = r["n"]
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone.utc).date()
    return [{"date": (today - timedelta(days=i)).isoformat()[5:], "value": out.get((today - timedelta(days=i)).isoformat(), 0)}
            for i in range(days - 1, -1, -1)]


@router.get("/analytics")
async def analytics(user=Depends(admin_only)):
    dau = {}
    async for r in db.daily_active.aggregate([{"$match": {"date": {"$gte": days_ago_iso(14)[:10]}}},
                                              {"$group": {"_id": "$date", "n": {"$sum": 1}}}]):
        dau[r["_id"]] = r["n"]
    regs = await _daily("users", {})
    from datetime import datetime, timedelta, timezone
    today = datetime.now(timezone.utc).date()
    views = await db.analytics_events.count_documents({"event": "job_viewed"})
    apps = await db.applications.count_documents({})
    cats, locs = [], []
    async for r in db.jobs.aggregate([{"$match": {"category": {"$nin": [None, ""]}}}, {"$group": {"_id": "$category", "n": {"$sum": 1}}},
                                      {"$sort": {"n": -1}}, {"$limit": 6}]):
        cats.append({"label": r["_id"], "value": r["n"]})
    async for r in db.jobs.aggregate([{"$group": {"_id": "$location", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 6}]):
        locs.append({"label": r["_id"], "value": r["n"]})
    return {
        "daily_active_users": [{"date": (today - timedelta(days=i)).isoformat()[5:], "value": dau.get((today - timedelta(days=i)).isoformat(), 0)}
                               for i in range(13, -1, -1)],
        "new_registrations": regs,
        "candidate_growth": await _daily("users", {"role": "candidate"}),
        "recruiter_growth": await _daily("users", {"role": "recruiter"}),
        "jobs_posted": await _daily("jobs", {}),
        "applications": await _daily("applications", {}),
        "application_conversion": {"job_views": views, "applications": apps,
                                   "rate": round(apps * 100 / views, 1) if views else 0},
        "top_categories": cats, "top_locations": locs,
    }


@router.get("/users")
async def users(role: str = "", q: str = "", status: str = "", page: int = 1, user=Depends(admin_only)):
    query = {}
    if role:
        query["role"] = role
    if status:
        query["status"] = status
    if q.strip():
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        query["$or"] = [{"name": rx}, {"email": rx}]
    total = await db.users.count_documents(query)
    items = await db.users.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).skip((page - 1) * 30).limit(30).to_list(30)
    for u in items:
        if u["role"] == "candidate":
            p = await db.candidate_profiles.find_one({"user_id": u["id"]}, {"_id": 0}) or {}
            has_resume = bool(await db.resumes.find_one({"user_id": u["id"], "is_active": True, "deleted": {"$ne": True}}, {"_id": 1}))
            u["profile_completion"] = profile_completion(p, has_resume)
            u["has_resume"] = has_resume
            u["applications_count"] = await db.applications.count_documents({"candidate_id": u["id"]})
        elif u["role"] == "recruiter":
            c = await db.companies.find_one({"id": u.get("company_id")}, {"_id": 0, "name": 1, "verification_status": 1}) or {}
            u["company_name"] = c.get("name")
            u["company_status"] = c.get("verification_status")
            u["jobs_posted"] = await db.jobs.count_documents({"posted_by": u["id"]})
            u["jobs_published"] = await db.jobs.count_documents({"posted_by": u["id"], "status": "published"})
            u["applications_received"] = await db.applications.count_documents({"company_id": u.get("company_id")}) if u.get("company_id") else 0
    return {"items": items, "total": total, "has_more": page * 30 < total}


class UserStatusIn(BaseModel):
    status: Literal["active", "suspended"]
    reason: Optional[str] = Field(None, max_length=300)


@router.post("/users/{uid}/status")
async def set_user_status(uid: str, body: UserStatusIn, user=Depends(admin_only)):
    target = await db.users.find_one({"id": uid}, {"_id": 0})
    if not target:
        raise HTTPException(404, "User not found")
    if target["role"] == "admin":
        raise HTTPException(400, "Admins cannot be suspended here")
    await db.users.update_one({"id": uid}, {"$set": {"status": body.status, "updated_at": iso()}})
    if body.status == "suspended":
        await db.user_sessions.delete_many({"user_id": uid})
    await audit(user, f"user_{body.status}", "user", uid, {"reason": clean(body.reason, 300)})
    return {"ok": True}


@router.get("/companies")
async def companies(status: str = "", user=Depends(admin_only)):
    q = {"verification_status": status} if status else {}
    items = await db.companies.find(q, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    for c in items:
        owner = await db.users.find_one({"id": c.get("owner_id")}, {"_id": 0, "name": 1, "email": 1, "phone": 1})
        c["owner"] = owner
        c["jobs_count"] = await db.jobs.count_documents({"company_id": c["id"]})
        c["open_reports"] = await db.reports.count_documents({"company_id": c["id"], "status": "open"})
    return {"items": items}


class VerifyIn(BaseModel):
    status: Literal["verified", "rejected", "suspended", "pending"]
    note: Optional[str] = Field(None, max_length=500)


@router.post("/companies/{cid}/verify")
async def verify_company(cid: str, body: VerifyIn, user=Depends(admin_only)):
    c = await db.companies.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Company not found")
    await db.companies.update_one({"id": cid}, {"$set": {"verification_status": body.status, "updated_at": iso()}})
    await db.company_verifications.insert_one({"id": new_id("cv"), "company_id": cid, "status": body.status,
                                               "note": clean(body.note, 500), "reviewed_by": user["id"],
                                               "created_at": iso(), "updated_at": iso()})
    await db.jobs.update_many({"company_id": cid}, {"$set": {"company_verified": body.status == "verified"}})
    if body.status == "suspended":
        await db.jobs.update_many({"company_id": cid, "status": "published"}, {"$set": {"status": "paused", "updated_at": iso()}})
        for r in await db.users.find({"company_id": cid}, {"id": 1, "_id": 0}).to_list(50):
            await db.users.update_one({"id": r["id"]}, {"$set": {"status": "suspended"}})
            await db.user_sessions.delete_many({"user_id": r["id"]})
    for r in await db.users.find({"company_id": cid}, {"id": 1, "_id": 0}).to_list(50):
        await notify(r["id"], "company_verification", f"Company {body.status}",
                     f"{c['name']} verification status: {body.status}. {clean(body.note, 300) or ''}", {"company_id": cid})
    await audit(user, f"company_{body.status}", "company", cid, {"note": clean(body.note, 500)})
    return {"ok": True}


@router.get("/jobs")
async def jobs(status: str = "", q: str = "", page: int = 1, user=Depends(admin_only)):
    query = {}
    if status:
        query["status"] = status
    if q.strip():
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        query["$or"] = [{"title": rx}, {"company_name": rx}]
    total = await db.jobs.count_documents(query)
    items = await db.jobs.find(query, {"_id": 0, "description": 0}).sort("created_at", -1).skip((page - 1) * 30).limit(30).to_list(30)
    pids = list({j.get("posted_by") for j in items if j.get("posted_by")})
    rec = {u["id"]: u for u in await db.users.find({"id": {"$in": pids}}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(100)}
    for j in items:
        r = rec.get(j.get("posted_by")) or {}
        j["recruiter_name"], j["recruiter_email"] = r.get("name"), r.get("email")
    return {"items": items, "total": total, "has_more": page * 30 < total}


class ModerateIn(BaseModel):
    action: Literal["approve", "reject", "feature", "unfeature", "remove", "pause"]
    note: Optional[str] = Field(None, max_length=500)


@router.post("/jobs/{job_id}/moderate")
async def moderate(job_id: str, body: ModerateIn, user=Depends(admin_only)):
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    upd = {"updated_at": iso(), "moderation_note": clean(body.note, 500)}
    if body.action == "approve":
        upd.update({"status": "published", "verification_status": "verified", "posted_at": job.get("posted_at") or iso()})
    elif body.action == "reject":
        upd.update({"status": "rejected", "verification_status": "rejected"})
    elif body.action == "remove":
        upd.update({"status": "closed", "removed_by_admin": True})
    elif body.action == "pause":
        upd.update({"status": "paused"})
    else:
        upd["featured"] = body.action == "feature"
    await db.jobs.update_one({"id": job_id}, {"$set": upd})
    if job.get("posted_by") and body.action in ("approve", "reject", "remove", "pause"):
        await notify(job["posted_by"], f"job_{body.action}", f"Job {body.action}d" if body.action != "remove" else "Job removed",
                     f"{job['title']}: {clean(body.note, 300) or 'Reviewed by JobMatch AI team'}", {"job_id": job_id})
    await audit(user, f"job_{body.action}", "job", job_id, {"note": clean(body.note, 500)})
    return {"ok": True}


class AdminJobIn(JobIn):
    company_id: Optional[str] = None
    company_name: Optional[str] = Field(None, max_length=120)
    source: Optional[str] = Field("admin", max_length=60)


@router.post("/jobs")
async def admin_create_job(body: AdminJobIn, user=Depends(admin_only)):
    d = _job_fields(JobIn(**body.model_dump(exclude={"company_id", "company_name", "source"})))
    comp = await db.companies.find_one({"id": body.company_id}, {"_id": 0}) if body.company_id else None
    if body.company_id and not comp:
        raise HTTPException(404, "Company not found")
    if not comp and not body.company_name:
        raise HTTPException(400, "Select a company or provide the employer name")
    job = {"id": new_id("job"), **d, "company_id": comp["id"] if comp else None,
           "company_name": comp["name"] if comp else clean(body.company_name, 120),
           "company_logo_id": comp.get("logo_file_id") if comp else None,
           "company_verified": bool(comp and comp["verification_status"] == "verified"),
           "status": "published", "verification_status": "verified", "risk_flags": [], "source": clean(body.source, 60) or "admin",
           "featured": False, "posted_by": None, "posted_at": iso(), "views": 0, "applications_count": 0, "is_test": False,
           "created_at": iso(), "updated_at": iso()}
    if not job["company_id"] and not job["is_external"]:
        raise HTTPException(400, "Jobs without a platform company must have an external application URL")
    await db.jobs.insert_one(dict(job))
    await audit(user, "admin_job_created", "job", job["id"])
    return {k: v for k, v in job.items() if k != "_id"}


@router.put("/jobs/{job_id}")
async def admin_edit_job(job_id: str, body: JobIn, user=Depends(admin_only)):
    if not await db.jobs.find_one({"id": job_id}, {"_id": 1}):
        raise HTTPException(404, "Job not found")
    d = _job_fields(body)
    d["updated_at"] = iso()
    await db.jobs.update_one({"id": job_id}, {"$set": d})
    await audit(user, "admin_job_edited", "job", job_id)
    return {"ok": True}


@router.get("/applications")
async def applications(page: int = 1, stage: str = "", user=Depends(admin_only)):
    q = {"stage": stage} if stage else {}
    total = await db.applications.count_documents(q)
    items = await db.applications.find(q, {"_id": 0, "cover_letter": 0, "recruiter_notes": 0}).sort("applied_at", -1).skip((page - 1) * 30).limit(30).to_list(30)
    rids = list({a.get("recruiter_id") for a in items if a.get("recruiter_id")})
    names = {u["id"]: u["name"] for u in await db.users.find({"id": {"$in": rids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100)}
    for a in items:
        a["recruiter_name"] = names.get(a.get("recruiter_id"))
    return {"items": items, "total": total, "has_more": page * 30 < total}


@router.get("/reports")
async def reports(status: str = "open", user=Depends(admin_only)):
    q = {"status": status} if status else {}
    items = await db.reports.find(q, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    for r in items:
        j = await db.jobs.find_one({"id": r["job_id"]}, {"_id": 0, "status": 1, "risk_flags": 1})
        r["job_status"] = (j or {}).get("status")
        r["risk_flags"] = (j or {}).get("risk_flags") or []
        r["report_count"] = await db.reports.count_documents({"job_id": r["job_id"]})
    return {"items": items}


class ResolveIn(BaseModel):
    status: Literal["resolved", "dismissed"]
    action: Literal["none", "pause_job", "remove_job"] = "none"
    note: Optional[str] = Field(None, max_length=500)


@router.post("/reports/{rid}/resolve")
async def resolve_report(rid: str, body: ResolveIn, user=Depends(admin_only)):
    r = await db.reports.find_one({"id": rid}, {"_id": 0})
    if not r:
        raise HTTPException(404, "Report not found")
    await db.reports.update_one({"id": rid}, {"$set": {"status": body.status, "action": body.action,
                                                       "resolution_note": clean(body.note, 500), "reviewed_by": user["id"], "updated_at": iso()}})
    if body.action != "none":
        await moderate(r["job_id"], ModerateIn(action="pause" if body.action == "pause_job" else "remove", note=body.note), user)
    await notify(r["reporter_id"], "report_reviewed", "Your report was reviewed",
                 f"Thanks for reporting {r['job_title']}. Our team has reviewed it.", {"job_id": r["job_id"]})
    await audit(user, f"report_{body.status}", "report", rid, {"action": body.action})
    return {"ok": True}


# ---------------- Taxonomy ----------------
KINDS = {"categories": "categories", "skills": "skills", "industries": "industries"}


class TaxIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)


@router.get("/taxonomy/{kind}")
async def tax_list(kind: str, user=Depends(admin_only)):
    if kind not in KINDS:
        raise HTTPException(404, "Unknown list")
    return {"items": await db[kind].find({}, {"_id": 0}).sort("name", 1).to_list(1000)}


@router.post("/taxonomy/{kind}")
async def tax_add(kind: str, body: TaxIn, user=Depends(admin_only)):
    if kind not in KINDS:
        raise HTTPException(404, "Unknown list")
    name = clean(body.name, 60)
    if await db[kind].find_one({"name": {"$regex": f"^{re.escape(name)}$", "$options": "i"}}, {"_id": 1}):
        raise HTTPException(409, "Already exists")
    item = {"id": new_id(kind[:3]), "name": name, "created_at": iso(), "updated_at": iso()}
    await db[kind].insert_one(dict(item))
    await audit(user, f"{kind}_added", kind, item["id"])
    return item


@router.delete("/taxonomy/{kind}/{item_id}")
async def tax_delete(kind: str, item_id: str, user=Depends(admin_only)):
    if kind not in KINDS:
        raise HTTPException(404, "Unknown list")
    await db[kind].delete_one({"id": item_id})
    await audit(user, f"{kind}_deleted", kind, item_id)
    return {"ok": True}


# ---------------- Plans ----------------
@router.get("/plans")
async def plans(user=Depends(admin_only)):
    return {"items": await db.plans.find({}, {"_id": 0}).sort([("audience", 1), ("price_inr", 1)]).to_list(50)}


class PlanIn(BaseModel):
    name: Optional[str] = Field(None, max_length=40)
    price_inr: Optional[float] = Field(None, ge=0)
    job_post_limit: Optional[int] = Field(None, ge=0, le=10000)
    features: Optional[List[str]] = None
    active: Optional[bool] = None


@router.put("/plans/{pid}")
async def update_plan(pid: str, body: PlanIn, user=Depends(admin_only)):
    d = {k: clean(v, 200) for k, v in body.model_dump(exclude_none=True).items()}
    d["updated_at"] = iso()
    res = await db.plans.update_one({"id": pid}, {"$set": d})
    if not res.matched_count:
        raise HTTPException(404, "Plan not found")
    await audit(user, "plan_updated", "plan", pid)
    return {"ok": True}


# ---------------- Settings / audit / test data ----------------
@router.get("/integrations")
async def integrations(user=Depends(admin_only)):
    def on(k):
        return bool(os.environ.get(k))
    return {"items": [
        {"key": "ai", "name": "AI (resume, coach, improve)", "configured": on("EMERGENT_LLM_KEY"), "env": "EMERGENT_LLM_KEY"},
        {"key": "storage", "name": "Cloud file storage", "configured": on("EMERGENT_LLM_KEY"), "env": "EMERGENT_LLM_KEY"},
        {"key": "push", "name": "Push notifications (FCM)", "configured": on("FCM_SERVER_KEY"), "env": "FCM_SERVER_KEY"},
        {"key": "email", "name": "Email notifications", "configured": on("EMAIL_PROVIDER_API_KEY"), "env": "EMAIL_PROVIDER_API_KEY"},
        {"key": "payments", "name": "Payments (Razorpay/Cashfree)", "configured": on("PAYMENT_PROVIDER"), "env": "PAYMENT_PROVIDER, PAYMENT_KEY_ID, PAYMENT_KEY_SECRET"},
        {"key": "job_feeds", "name": "External job feeds (approved APIs)", "configured": on("JOB_FEED_API_KEY"), "env": "JOB_FEED_API_KEY"},
    ]}


@router.get("/audit-logs")
async def audit_logs(user=Depends(admin_only)):
    return {"items": await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)}


@router.delete("/test-data")
async def purge_test_data(user=Depends(admin_only)):
    from seed import purge_test_data as purge
    result = await purge(keep_user_id=user["id"])
    await audit(user, "test_data_purged", "system", "-", result)
    return result
