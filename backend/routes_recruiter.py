"""Recruiter routes: company, jobs, pipeline, interviews, messages."""
import re
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel, Field

from core import db, iso, new_id, clean, require_roles, audit, track, notify, rate_limit
from domain import STAGES, get_profile, get_plan, detect_risk, annual, recruiter_company
from matching import compute_match
from routes_main import store_file, IMAGE_TYPES, MAX_IMAGE

router = APIRouter(prefix="/api")
recruiter_only = require_roles("recruiter")
staff = require_roles("recruiter", "admin")


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    website: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = Field(None, max_length=3000)
    industry: Optional[str] = None
    size: Optional[str] = None
    location: Optional[str] = None


async def _company_or_400(user):
    c = await recruiter_company(user)
    if not c:
        raise HTTPException(400, "No company linked to this recruiter account")
    return c


@router.get("/recruiter/company")
async def get_company(user=Depends(recruiter_only)):
    c = await _company_or_400(user)
    c["plan"] = await get_plan(user)
    return c


@router.put("/recruiter/company")
async def update_company(body: CompanyUpdate, user=Depends(recruiter_only)):
    c = await _company_or_400(user)
    data = {k: clean(v, 3000) for k, v in body.model_dump(exclude_none=True).items()}
    if data.get("website") and not re.match(r"^https?://", data["website"]):
        data["website"] = "https://" + data["website"]
    data["updated_at"] = iso()
    await db.companies.update_one({"id": c["id"]}, {"$set": data})
    if "name" in data:
        await db.jobs.update_many({"company_id": c["id"]}, {"$set": {"company_name": data["name"]}})
    await audit(user, "company_updated", "company", c["id"])
    return await get_company(user)


@router.post("/recruiter/company/logo")
async def upload_logo(file: UploadFile = File(...), user=Depends(recruiter_only)):
    c = await _company_or_400(user)
    rec = await store_file(user, file, "logo", IMAGE_TYPES, MAX_IMAGE)
    await db.companies.update_one({"id": c["id"]}, {"$set": {"logo_file_id": rec["id"], "updated_at": iso()}})
    await db.jobs.update_many({"company_id": c["id"]}, {"$set": {"company_logo_id": rec["id"]}})
    return {"logo_file_id": rec["id"]}


@router.get("/recruiter/dashboard")
async def dashboard(user=Depends(recruiter_only)):
    c = await _company_or_400(user)
    cid = c["id"]
    by_stage = {s: 0 for s in STAGES}
    async for row in db.applications.aggregate([{"$match": {"company_id": cid}}, {"$group": {"_id": "$stage", "n": {"$sum": 1}}}]):
        by_stage[row["_id"]] = row["n"]
    upcoming = await db.interviews.find({"company_id": cid, "status": "scheduled", "scheduled_at": {"$gte": iso()}},
                                        {"_id": 0}).sort("scheduled_at", 1).limit(5).to_list(5)
    recent = await db.applications.find({"company_id": cid}, {"_id": 0, "recruiter_notes": 0}).sort("applied_at", -1).limit(6).to_list(6)
    return {
        "company": {"id": cid, "name": c["name"], "verification_status": c["verification_status"], "logo_file_id": c.get("logo_file_id")},
        "metrics": {
            "active_jobs": await db.jobs.count_documents({"company_id": cid, "status": "published"}),
            "pending_jobs": await db.jobs.count_documents({"company_id": cid, "status": "pending_approval"}),
            "total_applications": sum(by_stage.values()),
            "new_applications": await db.applications.count_documents({"company_id": cid, "viewed_at": None}),
            "shortlisted": by_stage["shortlisted"], "interviews": by_stage["interview"],
            "hired": by_stage["hired"], "rejected": by_stage["rejected"],
        },
        "by_stage": by_stage, "upcoming_interviews": upcoming, "recent_applications": recent,
    }


class JobIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=30, max_length=8000)
    responsibilities: Optional[str] = Field(None, max_length=5000)
    benefits: Optional[str] = Field(None, max_length=3000)
    required_skills: List[str] = Field(default_factory=list, max_length=30)
    preferred_skills: List[str] = Field(default_factory=list, max_length=30)
    min_experience: float = Field(0, ge=0, le=40)
    max_experience: Optional[float] = Field(None, ge=0, le=50)
    education: Optional[str] = Field(None, max_length=120)
    salary_min: Optional[float] = Field(None, ge=0)
    salary_max: Optional[float] = Field(None, ge=0)
    salary_period: Literal["yearly", "monthly"] = "yearly"
    location: str = Field(min_length=2, max_length=100)
    work_mode: Literal["office", "hybrid", "remote"] = "office"
    employment_type: Literal["full_time", "part_time", "contract", "internship", "temporary"] = "full_time"
    industry: Optional[str] = Field(None, max_length=80)
    category: Optional[str] = Field(None, max_length=80)
    openings: int = Field(1, ge=1, le=1000)
    application_deadline: Optional[str] = None
    external_url: Optional[str] = Field(None, max_length=500)
    save_as_draft: bool = False


def _job_fields(body: JobIn) -> dict:
    d = body.model_dump()
    d.pop("save_as_draft")
    for k in ("title", "description", "responsibilities", "benefits", "education", "location", "industry", "category", "external_url"):
        d[k] = clean(d[k], 8000)
    d["required_skills"] = list(dict.fromkeys(clean(d["required_skills"], 60)))
    d["preferred_skills"] = list(dict.fromkeys(clean(d["preferred_skills"], 60)))
    if d["salary_min"] and d["salary_max"] and d["salary_min"] > d["salary_max"]:
        raise HTTPException(400, "Minimum salary cannot exceed maximum salary")
    if d["max_experience"] is not None and d["max_experience"] < d["min_experience"]:
        raise HTTPException(400, "Maximum experience cannot be less than minimum experience")
    if d["external_url"] and not re.match(r"^https://", d["external_url"]):
        raise HTTPException(400, "External application URL must start with https://")
    d["salary_annual_max"] = annual(d["salary_max"] or d["salary_min"], d["salary_period"])
    d["is_external"] = bool(d["external_url"])
    return d


async def _decide_status(company: dict, flags: list, draft: bool) -> str:
    if draft:
        return "draft"
    if company["verification_status"] == "verified" and not flags:
        return "published"
    return "pending_approval"


@router.get("/recruiter/jobs")
async def my_jobs(status: str = "", user=Depends(recruiter_only)):
    c = await _company_or_400(user)
    q = {"company_id": c["id"]}
    if status:
        q["status"] = status
    jobs = await db.jobs.find(q, {"_id": 0, "description": 0, "responsibilities": 0, "risk_flags": 0}).sort("created_at", -1).to_list(200)
    for j in jobs:
        j["applications_count"] = await db.applications.count_documents({"job_id": j["id"]})
    return {"items": jobs}


@router.post("/recruiter/jobs")
async def create_job(body: JobIn, request: Request, user=Depends(recruiter_only)):
    rate_limit(request, f"postjob:{user['id']}", 30, 3600)
    c = await _company_or_400(user)
    if c["verification_status"] in ("rejected", "suspended"):
        raise HTTPException(403, f"Your company is {c['verification_status']}. You cannot post jobs.")
    plan = await get_plan(user)
    active = await db.jobs.count_documents({"company_id": c["id"], "status": {"$in": ["published", "pending_approval", "paused"]}})
    if not body.save_as_draft and active >= plan.get("job_post_limit", 2):
        raise HTTPException(402, f"Your {plan.get('name', 'Free')} plan allows {plan.get('job_post_limit', 2)} active jobs. Upgrade or close a job.")
    d = _job_fields(body)
    d.update({"company_id": c["id"], "company_name": c["name"], "company_logo_id": c.get("logo_file_id"),
              "company_verified": c["verification_status"] == "verified"})
    flags = await detect_risk(d)
    status = await _decide_status(c, flags, body.save_as_draft)
    job = {"id": new_id("job"), **d, "status": status, "risk_flags": flags, "source": "recruiter",
           "verification_status": "verified" if status == "published" else "pending", "featured": False,
           "posted_by": user["id"], "posted_at": iso() if status == "published" else None, "views": 0,
           "applications_count": 0, "is_test": c.get("is_test", False), "created_at": iso(), "updated_at": iso()}
    await db.jobs.insert_one(dict(job))
    await db.job_skills.insert_many([{"job_id": job["id"], "skill": s, "type": "required"} for s in d["required_skills"]] or
                                    [{"job_id": job["id"], "skill": None, "type": "none"}])
    await audit(user, "job_created", "job", job["id"], {"status": status})
    await track("job_posted", user["id"], {"job_id": job["id"]})
    if status == "pending_approval":
        for adm in await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(20):
            await notify(adm["id"], "job_pending", "Job awaiting approval", f"{job['title']} — {c['name']}", {"job_id": job["id"]})
    job.pop("risk_flags")
    return job


@router.get("/recruiter/jobs/{job_id}")
async def get_my_job(job_id: str, user=Depends(recruiter_only)):
    job = await db.jobs.find_one({"id": job_id, "company_id": user.get("company_id")}, {"_id": 0, "risk_flags": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.put("/recruiter/jobs/{job_id}")
async def edit_job(job_id: str, body: JobIn, user=Depends(recruiter_only)):
    c = await _company_or_400(user)
    job = await db.jobs.find_one({"id": job_id, "company_id": c["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    if job["status"] in ("rejected",) and user["role"] != "admin":
        raise HTTPException(400, "Rejected jobs cannot be edited. Create a new job.")
    d = _job_fields(body)
    d["updated_at"] = iso()
    flags = await detect_risk({**job, **d}, exclude_id=job_id)
    d["risk_flags"] = flags
    if flags and job["status"] == "published":
        d["status"] = "pending_approval"
    elif job["status"] == "draft" and not body.save_as_draft:
        d["status"] = await _decide_status(c, flags, False)
        if d["status"] == "published":
            d["posted_at"] = iso()
    await db.jobs.update_one({"id": job_id}, {"$set": d})
    await audit(user, "job_edited", "job", job_id)
    return await get_my_job(job_id, user)


class JobStatusIn(BaseModel):
    status: Literal["published", "paused", "closed"]


@router.post("/recruiter/jobs/{job_id}/status")
async def change_job_status(job_id: str, body: JobStatusIn, user=Depends(recruiter_only)):
    job = await db.jobs.find_one({"id": job_id, "company_id": user.get("company_id")}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    allowed = {"published": ["paused"], "paused": ["published", "closed"], "draft": ["closed"],
               "pending_approval": ["closed"], "expired": ["closed"]}
    if body.status == "closed" and job["status"] != "closed":
        pass
    elif body.status not in allowed.get(job["status"], []):
        raise HTTPException(400, f"Cannot change job from {job['status']} to {body.status}")
    await db.jobs.update_one({"id": job_id}, {"$set": {"status": body.status, "updated_at": iso()}})
    await audit(user, f"job_{body.status}", "job", job_id)
    return {"ok": True, "status": body.status}


# ---------------- Pipeline ----------------
@router.get("/recruiter/applications")
async def pipeline(job_id: str = "", stage: str = "", q: str = "", min_match: int = 0, page: int = 1,
                   user=Depends(recruiter_only)):
    c = await _company_or_400(user)
    query = {"company_id": c["id"], "candidate_status": {"$ne": "withdrawn"}}
    if job_id:
        query["job_id"] = job_id
    if stage:
        query["stage"] = stage
    if min_match:
        query["match_score"] = {"$gte": min_match}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
        query["$or"] = [{"candidate_name": rx}, {"job_title": rx}, {"candidate_headline": rx}]
    total = await db.applications.count_documents(query)
    items = await db.applications.find(query, {"_id": 0, "recruiter_notes": 0, "cover_letter": 0}).sort(
        [("match_score", -1), ("applied_at", -1)]).skip((page - 1) * 30).limit(30).to_list(30)
    counts = {s: 0 for s in STAGES}
    base = {k: v for k, v in query.items() if k != "stage"}
    async for row in db.applications.aggregate([{"$match": base}, {"$group": {"_id": "$stage", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    return {"items": items, "total": total, "has_more": page * 30 < total, "counts": counts}


async def _my_app(app_id: str, user: dict) -> dict:
    a = await db.applications.find_one({"id": app_id, "company_id": user.get("company_id")}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Application not found")
    return a


@router.get("/recruiter/applications/{app_id}")
async def applicant_detail(app_id: str, user=Depends(recruiter_only)):
    a = await _my_app(app_id, user)
    if not a.get("viewed_at"):
        await db.applications.update_one({"id": app_id}, {"$set": {"viewed_at": iso()}})
        await notify(a["candidate_id"], "application_viewed", "Application viewed",
                     f"{a['company_name']} viewed your application for {a['job_title']}.", {"application_id": app_id})
    p = await get_profile(a["candidate_id"]) or {}
    cand = await db.users.find_one({"id": a["candidate_id"]}, {"_id": 0, "email": 1, "phone": 1})
    privacy = p.get("privacy") or {}
    shared = a.get("shared") or {}
    profile = {k: p.get(k) for k in ("name", "headline", "photo_file_id", "current_location", "preferred_locations",
                                      "experience_years", "education", "skills", "expected_salary", "notice_period",
                                      "work_preferences", "preferred_roles", "job_titles")}
    profile["email"] = (cand or {}).get("email") if shared.get("email") else None
    profile["phone"] = (p.get("phone") or (cand or {}).get("phone")) if shared.get("phone") else None
    profile["allow_contact"] = privacy.get("allow_contact", True)
    job = await db.jobs.find_one({"id": a["job_id"]}, {"_id": 0})
    a["candidate"] = profile
    a["match"] = compute_match(p, job) if job else None
    a["events"] = await db.application_events.find({"application_id": app_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    a["interviews"] = await db.interviews.find({"application_id": app_id}, {"_id": 0}).sort("scheduled_at", 1).to_list(20)
    a["messages"] = await db.messages.find({"application_id": app_id}, {"_id": 0}).sort("created_at", 1).to_list(50)
    ra = await db.resume_analysis.find_one({"resume_id": a["resume_id"]}, {"_id": 0, "score": 1, "strengths": 1})
    a["resume_score"] = (ra or {}).get("score")
    return a


class StageIn(BaseModel):
    stage: Literal["applied", "screening", "shortlisted", "interview", "selected", "hired", "rejected"]
    note: Optional[str] = Field(None, max_length=500)


STAGE_MSG = {"screening": "is screening your application", "shortlisted": "shortlisted you",
             "interview": "moved you to the interview stage", "selected": "selected you",
             "hired": "marked you as hired", "rejected": "has decided not to proceed with your application",
             "applied": "moved your application back to applied"}


@router.post("/recruiter/applications/{app_id}/stage")
async def move_stage(app_id: str, body: StageIn, user=Depends(recruiter_only)):
    a = await _my_app(app_id, user)
    if a["stage"] == body.stage:
        raise HTTPException(400, f"Candidate is already in {body.stage}")
    await db.applications.update_one({"id": app_id}, {"$set": {"stage": body.stage, "updated_at": iso(),
                                                              "viewed_at": a.get("viewed_at") or iso()}})
    await db.application_events.insert_one({"id": new_id("aev"), "application_id": app_id, "stage": body.stage,
                                            "from_stage": a["stage"], "note": clean(body.note, 500), "actor_id": user["id"],
                                            "actor_role": "recruiter", "created_at": iso()})
    title = "Shortlisted!" if body.stage == "shortlisted" else "Application status updated"
    await notify(a["candidate_id"], f"stage_{body.stage}", title,
                 f"{a['company_name']} {STAGE_MSG[body.stage]} for {a['job_title']}.", {"application_id": app_id})
    await audit(user, "stage_changed", "application", app_id, {"from": a["stage"], "to": body.stage})
    if body.stage == "shortlisted":
        await track("candidate_shortlisted", user["id"], {"application_id": app_id})
    if body.stage == "hired":
        await track("candidate_hired", user["id"], {"application_id": app_id})
    return {"ok": True, "stage": body.stage}


class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=1000)


@router.post("/recruiter/applications/{app_id}/notes")
async def add_note(app_id: str, body: NoteIn, user=Depends(recruiter_only)):
    await _my_app(app_id, user)
    note = {"id": new_id("nte"), "text": clean(body.note, 1000), "author_id": user["id"], "author_name": user["name"], "created_at": iso()}
    await db.applications.update_one({"id": app_id}, {"$push": {"recruiter_notes": note}, "$set": {"updated_at": iso()}})
    return note


class InterviewIn(BaseModel):
    scheduled_at: str = Field(min_length=10, max_length=40)
    duration_minutes: int = Field(30, ge=10, le=480)
    mode: Literal["video", "phone", "in_person"] = "video"
    location_or_link: Optional[str] = Field(None, max_length=300)
    notes: Optional[str] = Field(None, max_length=1000)


@router.post("/recruiter/applications/{app_id}/interviews")
async def schedule_interview(app_id: str, body: InterviewIn, user=Depends(recruiter_only)):
    a = await _my_app(app_id, user)
    if a["stage"] in ("rejected", "hired"):
        raise HTTPException(400, f"Cannot schedule interview for a {a['stage']} candidate")
    if body.scheduled_at < iso()[:16]:
        raise HTTPException(400, "Interview time must be in the future")
    iv = {"id": new_id("int"), "application_id": app_id, "company_id": a["company_id"], "job_id": a["job_id"],
          "candidate_id": a["candidate_id"], "candidate_name": a["candidate_name"], "job_title": a["job_title"],
          "company_name": a["company_name"], "scheduled_at": body.scheduled_at, "duration_minutes": body.duration_minutes,
          "mode": body.mode, "location_or_link": clean(body.location_or_link, 300), "notes": clean(body.notes, 1000),
          "status": "scheduled", "scheduled_by": user["id"], "created_at": iso(), "updated_at": iso()}
    await db.interviews.insert_one(dict(iv))
    if a["stage"] != "interview":
        await db.applications.update_one({"id": app_id}, {"$set": {"stage": "interview", "updated_at": iso()}})
        await db.application_events.insert_one({"id": new_id("aev"), "application_id": app_id, "stage": "interview",
                                                "from_stage": a["stage"], "note": "Interview scheduled", "actor_id": user["id"],
                                                "actor_role": "recruiter", "created_at": iso()})
    await notify(a["candidate_id"], "interview_scheduled", "Interview scheduled",
                 f"{a['company_name']} scheduled a {body.mode.replace('_', ' ')} interview for {a['job_title']}.",
                 {"application_id": app_id, "interview_id": iv["id"]})
    await notify(user["id"], "interview_reminder", "Interview scheduled", f"{a['candidate_name']} — {body.scheduled_at[:16].replace('T', ' ')}",
                 {"application_id": app_id})
    await track("interview_scheduled", user["id"], {"application_id": app_id})
    await audit(user, "interview_scheduled", "application", app_id)
    return iv


@router.get("/recruiter/interviews")
async def list_interviews(status: str = "", user=Depends(recruiter_only)):
    q = {"company_id": user.get("company_id")}
    if status:
        q["status"] = status
    items = await db.interviews.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(200)
    return {"items": items}


class InterviewStatusIn(BaseModel):
    status: Literal["scheduled", "completed", "cancelled", "no_show"]


@router.post("/recruiter/interviews/{iid}/status")
async def interview_status(iid: str, body: InterviewStatusIn, user=Depends(recruiter_only)):
    iv = await db.interviews.find_one({"id": iid, "company_id": user.get("company_id")}, {"_id": 0})
    if not iv:
        raise HTTPException(404, "Interview not found")
    await db.interviews.update_one({"id": iid}, {"$set": {"status": body.status, "updated_at": iso()}})
    if body.status == "cancelled":
        await notify(iv["candidate_id"], "interview_cancelled", "Interview cancelled",
                     f"Your interview for {iv['job_title']} was cancelled.", {"application_id": iv["application_id"]})
    return {"ok": True}


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


@router.post("/recruiter/applications/{app_id}/message")
async def message_candidate(app_id: str, body: MessageIn, request: Request, user=Depends(recruiter_only)):
    rate_limit(request, f"msg:{user['id']}", 60, 3600)
    a = await _my_app(app_id, user)
    p = await get_profile(a["candidate_id"]) or {}
    if not (p.get("privacy") or {}).get("allow_contact", True):
        raise HTTPException(403, "This candidate has disabled recruiter contact")
    msg = {"id": new_id("msg"), "application_id": app_id, "from_user_id": user["id"], "to_user_id": a["candidate_id"],
           "from_name": a["company_name"], "body": clean(body.body, 2000), "created_at": iso(), "updated_at": iso()}
    await db.messages.insert_one(dict(msg))
    await notify(a["candidate_id"], "message", f"Message from {a['company_name']}", msg["body"][:140], {"application_id": app_id})
    return msg
