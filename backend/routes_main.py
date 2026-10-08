"""Auth, candidate, jobs, applications, notifications, AI coach, plans, files."""
import asyncio
import os
import re
import uuid
from typing import List, Optional, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field

import ai
import storage
from core import (db, USER_PUBLIC, iso, new_id, clean, hash_password, verify_password, create_session,
                  get_current_user, require_roles, audit, track, notify, rate_limit, logger)
from domain import (STAGES, WORK_MODES, REPORT_CATEGORIES, DEFAULT_PRIVACY, profile_completion, get_profile,
                    active_resume, job_card, public_job, expire_jobs, days_ago_iso, get_plan, annual)
from matching import compute_match

router = APIRouter(prefix="/api")
candidate_only = require_roles("candidate")

RESUME_TYPES = {"pdf": "application/pdf", "doc": "application/msword",
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
IMAGE_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
MAX_RESUME = 5 * 1024 * 1024
MAX_IMAGE = 3 * 1024 * 1024


# ============================== AUTH ==============================
class CompanyIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    website: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None
    size: Optional[str] = None
    location: Optional[str] = None


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=2, max_length=80)
    role: Literal["candidate", "recruiter"] = "candidate"
    phone: Optional[str] = None
    company: Optional[CompanyIn] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


async def user_payload(user: dict) -> dict:
    u = {k: v for k, v in user.items() if k not in ("password_hash", "_session_token")}
    if u["role"] == "candidate":
        p = await get_profile(u["id"]) or {}
        u["profile_completion"] = profile_completion(p, bool(await active_resume(u["id"])))
        u["photo_file_id"] = p.get("photo_file_id")
    if u["role"] == "recruiter" and u.get("company_id"):
        c = await db.companies.find_one({"id": u["company_id"]}, {"_id": 0})
        u["company"] = c
    u["unread_notifications"] = await db.notifications.count_documents({"user_id": u["id"], "read": False})
    return u


async def create_company(data: dict, owner: dict) -> dict:
    comp = {"id": new_id("cmp"), **{k: clean(v, 2000) for k, v in data.items()}, "logo_file_id": None,
            "verification_status": "pending", "owner_id": owner["id"], "is_test": False,
            "created_at": iso(), "updated_at": iso()}
    await db.companies.insert_one(dict(comp))
    await db.company_verifications.insert_one({"id": new_id("cv"), "company_id": comp["id"], "status": "pending",
                                               "note": "Submitted at registration", "reviewed_by": None,
                                               "created_at": iso(), "updated_at": iso()})
    return comp


@router.post("/auth/register")
async def register(body: RegisterIn, request: Request):
    rate_limit(request, "register", 10, 600)
    if not (re.search(r"[A-Za-z]", body.password) and re.search(r"\d", body.password)):
        raise HTTPException(400, "Password must contain at least one letter and one number.")
    email = body.email.lower()
    if await db.users.find_one({"email": email}, {"_id": 1}):
        raise HTTPException(409, "An account with this email already exists")
    if body.role == "recruiter" and not body.company:
        raise HTTPException(400, "Company details are required for recruiter registration")
    user = {"id": new_id("usr"), "email": email, "name": clean(body.name, 80), "role": body.role,
            "phone": clean(body.phone, 20), "password_hash": hash_password(body.password), "auth_provider": "password",
            "status": "active", "company_id": None, "is_test": False, "created_at": iso(), "updated_at": iso()}
    await db.users.insert_one(dict(user))
    if body.role == "candidate":
        await db.candidate_profiles.insert_one({"user_id": user["id"], "name": user["name"], "privacy": DEFAULT_PRIVACY,
                                                "created_at": iso(), "updated_at": iso()})
        await track("signup", user["id"], {"role": "candidate"})
    else:
        comp = await create_company(body.company.model_dump(), user)
        await db.users.update_one({"id": user["id"]}, {"$set": {"company_id": comp["id"]}})
        user["company_id"] = comp["id"]
        await db.recruiter_profiles.insert_one({"user_id": user["id"], "company_id": comp["id"], "title": "Recruiter",
                                                "phone": user["phone"], "created_at": iso(), "updated_at": iso()})
        await track("recruiter_signup", user["id"])
        for adm in await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(20):
            await notify(adm["id"], "company_pending", "New company awaiting verification", comp["name"], {"company_id": comp["id"]})
    token = await create_session(user["id"])
    return {"token": token, "user": await user_payload(user)}


@router.post("/auth/login")
async def login(body: LoginIn, request: Request):
    rate_limit(request, "login", 10, 300)
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    if user.get("status") == "suspended":
        raise HTTPException(403, "Your account is suspended. Contact support.")
    token = await create_session(user["id"])
    return {"token": token, "user": await user_payload(user)}


class GoogleSessionIn(BaseModel):
    session_id: str
    role: Optional[Literal["candidate", "recruiter"]] = "candidate"


@router.post("/auth/session")
async def google_session(body: GoogleSessionIn, request: Request):
    rate_limit(request, "gsession", 20, 300)
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get("https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                        headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(401, "Google sign-in failed")
    data = r.json()
    email = data["email"].lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        user = {"id": new_id("usr"), "email": email, "name": clean(data.get("name") or email.split("@")[0], 80),
                "role": "candidate", "phone": None, "password_hash": None, "auth_provider": "google",
                "status": "active", "company_id": None, "is_test": False, "created_at": iso(), "updated_at": iso()}
        await db.users.insert_one(dict(user))
        await db.candidate_profiles.insert_one({"user_id": user["id"], "name": user["name"], "privacy": DEFAULT_PRIVACY,
                                                "created_at": iso(), "updated_at": iso()})
        await track("signup", user["id"], {"role": "candidate", "provider": "google"})
    if user.get("status") == "suspended":
        raise HTTPException(403, "Your account is suspended. Contact support.")
    token = await create_session(user["id"])
    return {"session_token": token, "token": token, "user": await user_payload(user)}


@router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return await user_payload(user)


@router.post("/auth/logout")
async def logout(user=Depends(get_current_user)):
    await db.user_sessions.delete_one({"session_token": user["_session_token"]})
    return {"ok": True}


@router.post("/auth/logout-all")
async def logout_all(user=Depends(get_current_user)):
    res = await db.user_sessions.delete_many({"user_id": user["id"]})
    return {"ok": True, "sessions_ended": res.deleted_count}


class PushTokenIn(BaseModel):
    token: str
    platform: str


@router.post("/auth/push-token")
async def push_token(body: PushTokenIn, user=Depends(get_current_user)):
    await db.push_tokens.update_one({"token": body.token}, {"$set": {"user_id": user["id"], "platform": body.platform,
                                                                    "updated_at": iso()}}, upsert=True)
    return {"ok": True}


@router.post("/account/data-deletion-request")
async def data_deletion_request(user=Depends(get_current_user)):
    await db.data_requests.insert_one({"id": new_id("dr"), "user_id": user["id"], "type": "deletion",
                                       "status": "pending", "created_at": iso(), "updated_at": iso()})
    await audit(user, "data_deletion_requested", "user", user["id"])
    return {"ok": True, "message": "Your data deletion request has been recorded. Our team will process it within 30 days."}


@router.delete("/account")
async def delete_account(user=Depends(get_current_user)):
    if user["role"] == "admin":
        raise HTTPException(400, "Admin accounts cannot be self-deleted")
    uid = user["id"]
    app_ids = [a["id"] for a in await db.applications.find({"candidate_id": uid}, {"id": 1, "_id": 0}).to_list(5000)]
    await db.application_events.delete_many({"application_id": {"$in": app_ids}})
    await db.interviews.delete_many({"application_id": {"$in": app_ids}})
    for coll in ("applications",):
        await db[coll].delete_many({"candidate_id": uid})
    for coll in ("candidate_profiles", "recruiter_profiles", "saved_jobs", "notifications", "user_sessions",
                 "coach_sessions", "resume_analysis", "push_tokens", "subscriptions"):
        await db[coll].delete_many({"user_id": uid})
    await db.resumes.update_many({"user_id": uid}, {"$set": {"deleted": True, "is_active": False}})
    await db.files.update_many({"owner_id": uid}, {"$set": {"deleted": True}})
    await db.users.delete_one({"id": uid})
    await audit(user, "account_deleted", "user", uid)
    return {"ok": True}


# ============================== FILES ==============================
async def store_file(user: dict, f: UploadFile, kind: str, allowed: dict, max_size: int) -> dict:
    ext = (f.filename or "").rsplit(".", 1)[-1].lower() if "." in (f.filename or "") else ""
    logger.info("RESUME_UPLOAD_DEBUG upload started user=%s kind=%s name=%s ext=%s", user["id"], kind, f.filename, ext)
    if ext not in allowed:
        raise HTTPException(415, f"Unsupported file type. Allowed: {', '.join(allowed)}")
    data = await f.read()
    if len(data) == 0:
        raise HTTPException(400, "Invalid file: file is empty")
    if len(data) > max_size:
        raise HTTPException(413, f"File is too large. Maximum size is {max_size // (1024 * 1024)} MB")
    logger.info("RESUME_UPLOAD_DEBUG received %d bytes, validating", len(data))
    # magic-byte validation
    if ext == "pdf" and not data.startswith(b"%PDF"):
        raise HTTPException(400, "File is not a valid PDF")
    if ext == "docx" and not data.startswith(b"PK"):
        raise HTTPException(400, "File is not a valid DOCX")
    if ext in ("png",) and not data.startswith(b"\x89PNG"):
        raise HTTPException(400, "File is not a valid PNG")
    if ext in ("jpg", "jpeg") and not data.startswith(b"\xff\xd8"):
        raise HTTPException(400, "File is not a valid JPEG")
    path = f"{storage.APP_NAME}/{kind}/{user['id']}/{uuid.uuid4().hex}.{ext}"
    try:
        res = await run_in_threadpool(storage.put_object, path, data, allowed[ext])
    except Exception as e:
        logger.error("upload failed: %s", e)
        raise HTTPException(502, "File storage is unavailable. Please try again.")
    rec = {"id": new_id("fil"), "owner_id": user["id"], "kind": kind, "path": res.get("path", path),
           "content_type": allowed[ext], "ext": ext, "original_name": clean(f.filename, 200), "size": len(data),
           "deleted": False, "created_at": iso(), "updated_at": iso()}
    await db.files.insert_one(dict(rec))
    rec["_data"] = data
    return rec


@router.get("/files/{file_id}")
async def get_file(file_id: str, download: int = 0, user=Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id, "deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(404, "File not found")
    if rec["kind"] == "resume" and rec["owner_id"] != user["id"] and user["role"] != "admin":
        ok = False
        if user["role"] == "recruiter" and user.get("company_id"):
            ok = bool(await db.applications.find_one({"company_id": user["company_id"], "resume_file_id": file_id}, {"_id": 1}))
        if not ok:
            raise HTTPException(403, "You do not have access to this resume")
    try:
        data, ctype = await run_in_threadpool(storage.get_object, rec["path"])
    except Exception:
        raise HTTPException(502, "Could not fetch file")
    disp = "attachment" if download else "inline"
    return Response(content=data, media_type=rec["content_type"],
                    headers={"Content-Disposition": f'{disp}; filename="{rec["original_name"] or "file"}"',
                             "Cache-Control": "private, max-age=3600"})


# ============================== CANDIDATE PROFILE ==============================
class EducationIn(BaseModel):
    degree: str = ""
    institution: str = ""
    year: str = ""


class PrivacyIn(BaseModel):
    profile_visible: bool = True
    share_email_default: bool = True
    share_phone_default: bool = False
    allow_contact: bool = True


class ProfileIn(BaseModel):
    name: Optional[str] = Field(None, max_length=80)
    phone: Optional[str] = Field(None, max_length=20)
    headline: Optional[str] = Field(None, max_length=140)
    current_location: Optional[str] = None
    preferred_locations: Optional[List[str]] = None
    experience_years: Optional[float] = Field(None, ge=0, le=50)
    education: Optional[List[EducationIn]] = None
    skills: Optional[List[str]] = None
    current_salary: Optional[float] = Field(None, ge=0)
    expected_salary: Optional[float] = Field(None, ge=0)
    notice_period: Optional[str] = None
    job_types: Optional[List[str]] = None
    work_preferences: Optional[List[Literal["office", "hybrid", "remote"]]] = None
    preferred_industries: Optional[List[str]] = None
    preferred_roles: Optional[List[str]] = None
    privacy: Optional[PrivacyIn] = None


@router.get("/candidate/profile")
async def get_my_profile(user=Depends(candidate_only)):
    p = await get_profile(user["id"]) or {"user_id": user["id"], "name": user["name"], "privacy": DEFAULT_PRIVACY}
    resume = await active_resume(user["id"])
    p["email"] = user["email"]
    p["phone"] = p.get("phone") or user.get("phone")
    p["completion"] = profile_completion(p, bool(resume))
    p["has_resume"] = bool(resume)
    return p


@router.put("/candidate/profile")
async def update_profile(body: ProfileIn, user=Depends(candidate_only)):
    data = body.model_dump(exclude_none=True)
    for k, v in list(data.items()):
        if isinstance(v, str) or (isinstance(v, list) and v and isinstance(v[0], str)):
            data[k] = clean(v, 300)
    if "skills" in data:
        data["skills"] = list(dict.fromkeys(s for s in data["skills"] if s))[:50]
    data["updated_at"] = iso()
    before = await get_profile(user["id"]) or {}
    await db.candidate_profiles.update_one({"user_id": user["id"]}, {"$set": data,
                                           "$setOnInsert": {"created_at": iso()}}, upsert=True)
    if data.get("name"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"name": data["name"], "updated_at": iso()}})
    p = await get_profile(user["id"])
    comp = profile_completion(p, bool(await active_resume(user["id"])))
    if comp >= 80 and profile_completion(before, True) < 80:
        await track("profile_completed", user["id"])
    return await get_my_profile(user)


@router.post("/candidate/photo")
async def upload_photo(file: UploadFile = File(...), user=Depends(candidate_only)):
    rec = await store_file(user, file, "photo", IMAGE_TYPES, MAX_IMAGE)
    await db.candidate_profiles.update_one({"user_id": user["id"]}, {"$set": {"photo_file_id": rec["id"], "updated_at": iso()}})
    return {"photo_file_id": rec["id"]}


# ============================== RESUME ==============================
async def run_analysis(user_id: str, resume_id: str, text: str):
    try:
        if len(text.strip()) < 80:
            raise ValueError("Could not read enough text from this file. Try a text-based PDF or DOCX.")
        logger.info("RESUME_UPLOAD_DEBUG ai analysis started resume=%s text_len=%d", resume_id, len(text))
        result = await ai.analyze_resume(text)
        parsed = result.get("parsed") or {}
        analysis = {"resume_id": resume_id, "user_id": user_id, "status": "completed",
                    "parsed": parsed, "score": max(0, min(100, int(result.get("score") or 0))),
                    **{k: (result.get(k) or [])[:10] for k in ("strengths", "missing_skills", "missing_keywords",
                                                              "formatting_issues", "experience_gaps", "suggestions")},
                    "error": None, "updated_at": iso()}
        await db.resume_analysis.update_one({"resume_id": resume_id}, {"$set": analysis}, upsert=True)
        # auto-populate empty profile fields only (never overwrite user-entered data)
        p = await get_profile(user_id) or {}
        upd = {}
        if not p.get("skills") and parsed.get("skills"):
            upd["skills"] = [clean(s, 60) for s in parsed["skills"][:30]]
        if p.get("experience_years") in (None, "") and parsed.get("years_of_experience") is not None:
            try:
                upd["experience_years"] = float(parsed["years_of_experience"])
            except (TypeError, ValueError):
                pass
        if not p.get("education") and parsed.get("education"):
            upd["education"] = [{"degree": clean(e.get("degree", ""), 120), "institution": clean(e.get("institution", ""), 120),
                                 "year": clean(str(e.get("year", "")), 10)} for e in parsed["education"][:5] if isinstance(e, dict)]
        if not p.get("headline") and parsed.get("headline"):
            upd["headline"] = clean(parsed["headline"], 140)
        if parsed.get("job_titles"):
            upd["job_titles"] = [clean(t, 80) for t in parsed["job_titles"][:10]]
        if not p.get("preferred_industries") and parsed.get("industry"):
            upd["preferred_industries"] = [clean(parsed["industry"], 60)]
        if upd:
            upd["updated_at"] = iso()
            await db.candidate_profiles.update_one({"user_id": user_id}, {"$set": upd})
        await notify(user_id, "resume_analyzed", "Resume analysis ready", f"Your resume score is {analysis['score']}/100.", {})
        logger.info("RESUME_UPLOAD_DEBUG ai analysis completed resume=%s score=%s", resume_id, analysis["score"])
    except Exception as e:
        logger.error("RESUME_UPLOAD_DEBUG ai analysis failed resume=%s error=%s", resume_id, e)
        await db.resume_analysis.update_one({"resume_id": resume_id}, {"$set": {
            "resume_id": resume_id, "user_id": user_id, "status": "failed", "error": str(e)[:300], "updated_at": iso()}}, upsert=True)


@router.post("/candidate/resume")
async def upload_resume(request: Request, file: UploadFile = File(...), user=Depends(candidate_only)):
    rate_limit(request, f"resume:{user['id']}", 10, 3600)
    rec = await store_file(user, file, "resume", RESUME_TYPES, MAX_RESUME)
    text = await run_in_threadpool(ai.extract_text, rec["_data"], rec["ext"])
    await db.resumes.update_many({"user_id": user["id"], "is_active": True}, {"$set": {"is_active": False, "updated_at": iso()}})
    resume = {"id": new_id("res"), "user_id": user["id"], "file_id": rec["id"], "file_name": rec["original_name"],
              "ext": rec["ext"], "size": rec["size"], "text": text, "is_active": True, "deleted": False,
              "created_at": iso(), "updated_at": iso()}
    await db.resumes.insert_one(dict(resume))
    await db.resume_analysis.insert_one({"resume_id": resume["id"], "user_id": user["id"], "status": "processing",
                                         "created_at": iso(), "updated_at": iso()})
    await track("resume_uploaded", user["id"])
    logger.info("RESUME_UPLOAD_DEBUG stored file_id=%s resume_id=%s, starting AI analysis", rec["id"], resume["id"])
    asyncio.create_task(run_analysis(user["id"], resume["id"], text))
    return {k: v for k, v in resume.items() if k not in ("text", "_id")}


@router.get("/candidate/resume")
async def get_resume(user=Depends(candidate_only)):
    r = await active_resume(user["id"])
    if not r:
        return {"resume": None, "analysis": None}
    r.pop("text", None)
    a = await db.resume_analysis.find_one({"resume_id": r["id"]}, {"_id": 0})
    return {"resume": r, "analysis": a}


@router.post("/candidate/resume/reanalyze")
async def reanalyze(request: Request, user=Depends(candidate_only)):
    rate_limit(request, f"reanalyze:{user['id']}", 5, 3600)
    r = await active_resume(user["id"])
    if not r:
        raise HTTPException(404, "Upload a resume first")
    await db.resume_analysis.update_one({"resume_id": r["id"]}, {"$set": {"status": "processing", "updated_at": iso()}}, upsert=True)
    asyncio.create_task(run_analysis(user["id"], r["id"], r.get("text", "")))
    return {"status": "processing"}


@router.delete("/candidate/resume")
async def delete_resume(user=Depends(candidate_only)):
    r = await active_resume(user["id"])
    if not r:
        raise HTTPException(404, "No resume to delete")
    await db.resumes.update_one({"id": r["id"]}, {"$set": {"deleted": True, "is_active": False, "text": "", "updated_at": iso()}})
    await db.files.update_one({"id": r["file_id"]}, {"$set": {"deleted": True}})
    await db.resume_analysis.delete_many({"resume_id": r["id"]})
    await audit(user, "resume_deleted", "resume", r["id"])
    return {"ok": True}


class ImproveIn(BaseModel):
    mode: Literal["resume", "summary", "experience", "skills", "ats"]
    target_role: Optional[str] = Field(None, max_length=100)


@router.post("/ai/resume-improve")
async def resume_improve(body: ImproveIn, request: Request, user=Depends(candidate_only)):
    rate_limit(request, f"improve:{user['id']}", 15, 3600)
    r = await db.resumes.find_one({"user_id": user["id"], "is_active": True, "deleted": {"$ne": True}}, {"_id": 0})
    if not r or len((r.get("text") or "").strip()) < 80:
        raise HTTPException(400, "Upload a readable resume first")
    try:
        return await ai.improve_resume(body.mode, r["text"], clean(body.target_role, 100))
    except Exception as e:
        logger.error("improve failed: %s", e)
        raise HTTPException(502, "AI service is temporarily unavailable. Please retry.")


# ============================== JOBS ==============================
def _f(v):
    return v not in (None, "", "all")


async def _annotate(items: list, user: dict | None, profile: dict | None) -> list:
    ids = [j["id"] for j in items]
    saved, applied = set(), {}
    if user and user["role"] == "candidate" and ids:
        saved = {s["job_id"] for s in await db.saved_jobs.find({"user_id": user["id"], "job_id": {"$in": ids}}, {"job_id": 1, "_id": 0}).to_list(500)}
        applied = {a["job_id"]: a["stage"] for a in await db.applications.find(
            {"candidate_id": user["id"], "job_id": {"$in": ids}}, {"job_id": 1, "stage": 1, "_id": 0}).to_list(500)}
    out = []
    for j in items:
        c = job_card(j)
        c["match_score"] = compute_match(profile, j)["score"] if profile else None
        c["saved"] = j["id"] in saved
        c["application_stage"] = applied.get(j["id"])
        out.append(c)
    return out


async def _viewer(request: Request):
    try:
        user = await get_current_user(request)
    except HTTPException:
        return None, None
    profile = await get_profile(user["id"]) if user["role"] == "candidate" else None
    return user, profile


@router.get("/jobs")
async def search_jobs(request: Request, q: str = "", location: str = "", work_mode: str = "", employment_type: str = "",
                      industry: str = "", category: str = "", min_salary: float = 0, experience: Optional[float] = None,
                      posted_within: int = 0, min_match: int = 0, sort: str = "latest", company_id: str = "",
                      page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=50)):
    await expire_jobs()
    user, profile = await _viewer(request)
    query: dict = {"status": "published"}
    if q.strip():
        rx = {"$regex": re.escape(q.strip()[:80]), "$options": "i"}
        query["$or"] = [{"title": rx}, {"company_name": rx}, {"required_skills": rx}, {"location": rx}, {"category": rx}]
    if location.strip():
        query["location"] = {"$regex": re.escape(location.strip()[:60]), "$options": "i"}
    if _f(work_mode):
        query["work_mode"] = {"$in": work_mode.split(",")}
    if _f(employment_type):
        query["employment_type"] = {"$in": employment_type.split(",")}
    if _f(industry):
        query["industry"] = industry
    if _f(category):
        query["category"] = category
    if min_salary:
        query["salary_annual_max"] = {"$gte": min_salary}
    if experience is not None:
        query["min_experience"] = {"$lte": experience}
    if posted_within:
        query["posted_at"] = {"$gte": days_ago_iso(posted_within)}
    if company_id:
        query["company_id"] = company_id
    proj = {"_id": 0, "description": 0, "responsibilities": 0, "risk_flags": 0}
    use_match = profile is not None and (sort == "best_match" or min_match > 0)
    if use_match:
        pool = await db.jobs.find(query, proj).sort("posted_at", -1).limit(400).to_list(400)
        scored = [(compute_match(profile, j)["score"], j) for j in pool]
        scored = [s for s in scored if s[0] >= min_match]
        if sort == "best_match":
            scored.sort(key=lambda s: s[0], reverse=True)
        total = len(scored)
        page_items = [j for _, j in scored[(page - 1) * limit: page * limit]]
    else:
        sort_spec = {"latest": [("featured", -1), ("posted_at", -1)], "salary_high": [("salary_annual_max", -1)],
                     "salary_low": [("salary_annual_max", 1)]}.get(sort, [("posted_at", -1)])
        total = await db.jobs.count_documents(query)
        page_items = await db.jobs.find(query, proj).sort(sort_spec).skip((page - 1) * limit).limit(limit).to_list(limit)
    return {"items": await _annotate(page_items, user, profile), "page": page, "total": total,
            "has_more": page * limit < total}


@router.get("/jobs/home")
async def home_feed(user=Depends(candidate_only)):
    await expire_jobs()
    profile = await get_profile(user["id"]) or {}
    proj = {"_id": 0, "description": 0, "responsibilities": 0, "risk_flags": 0}
    pool = await db.jobs.find({"status": "published"}, proj).sort("posted_at", -1).limit(300).to_list(300)
    scored = sorted(pool, key=lambda j: compute_match(profile, j)["score"], reverse=True)
    locs = [l.lower() for l in (profile.get("preferred_locations") or []) + [profile.get("current_location") or ""] if l]
    near = [j for j in pool if j.get("location") and any(l in j["location"].lower() for l in locs)]
    sections = {
        "recommended": scored[:8],
        "high_match": [j for j in scored if compute_match(profile, j)["score"] >= 80][:8],
        "recent": pool[:8],
        "remote": [j for j in pool if j.get("work_mode") == "remote"][:8],
        "nearby": near[:8],
    }
    out = {k: await _annotate(v, user, profile) for k, v in sections.items()}
    out["featured_companies"] = await db.companies.find({"verification_status": "verified"},
                                                        {"_id": 0, "id": 1, "name": 1, "logo_file_id": 1, "industry": 1, "location": 1}).limit(10).to_list(10)
    for c in out["featured_companies"]:
        c["active_jobs"] = await db.jobs.count_documents({"company_id": c["id"], "status": "published"})
    out["profile_completion"] = profile_completion(profile, bool(await active_resume(user["id"])))
    ra = await db.resume_analysis.find_one({"user_id": user["id"], "status": "completed"}, {"_id": 0, "score": 1}, sort=[("updated_at", -1)])
    out["resume_score"] = ra["score"] if ra else None
    out["application_count"] = await db.applications.count_documents({"candidate_id": user["id"]})
    return out


@router.get("/jobs/{job_id}")
async def job_detail(job_id: str, request: Request):
    user, profile = await _viewer(request)
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    is_owner = user and (user["role"] == "admin" or (user["role"] == "recruiter" and user.get("company_id") == job["company_id"]))
    if job["status"] != "published" and not is_owner:
        if not (user and await db.applications.find_one({"candidate_id": user["id"], "job_id": job_id}, {"_id": 1})):
            raise HTTPException(404, "This job is no longer available")
    company = await db.companies.find_one({"id": job["company_id"]}, {"_id": 0}) if job.get("company_id") else None
    out = public_job(job) if not (user and user["role"] == "admin") else job
    out["company"] = company
    out["match"] = compute_match(profile, job) if profile else None
    out["saved"] = bool(user and await db.saved_jobs.find_one({"user_id": user["id"], "job_id": job_id}, {"_id": 1}))
    app = await db.applications.find_one({"candidate_id": user["id"], "job_id": job_id}, {"_id": 0, "id": 1, "stage": 1}) if user else None
    out["application"] = app
    if user and user["role"] == "candidate":
        await db.jobs.update_one({"id": job_id}, {"$inc": {"views": 1}})
        await track("job_viewed", user["id"], {"job_id": job_id})
    return out


@router.post("/jobs/{job_id}/save")
async def save_job(job_id: str, user=Depends(candidate_only)):
    if not await db.jobs.find_one({"id": job_id}, {"_id": 1}):
        raise HTTPException(404, "Job not found")
    await db.saved_jobs.update_one({"user_id": user["id"], "job_id": job_id},
                                   {"$setOnInsert": {"id": new_id("sav"), "created_at": iso(), "updated_at": iso()}}, upsert=True)
    await track("job_saved", user["id"], {"job_id": job_id})
    return {"saved": True}


@router.delete("/jobs/{job_id}/save")
async def unsave_job(job_id: str, user=Depends(candidate_only)):
    await db.saved_jobs.delete_one({"user_id": user["id"], "job_id": job_id})
    return {"saved": False}


@router.get("/saved")
async def saved_jobs(user=Depends(candidate_only)):
    saved = await db.saved_jobs.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    jobs = await db.jobs.find({"id": {"$in": [s["job_id"] for s in saved]}}, {"_id": 0, "description": 0}).to_list(200)
    by_id = {j["id"]: j for j in jobs}
    profile = await get_profile(user["id"])
    ordered = [by_id[s["job_id"]] for s in saved if s["job_id"] in by_id]
    return {"items": await _annotate(ordered, user, profile)}


class ReportIn(BaseModel):
    category: Literal["fake_job", "scam", "wrong_information", "offensive", "duplicate", "other"]
    details: Optional[str] = Field(None, max_length=1000)


@router.post("/jobs/{job_id}/report")
async def report_job(job_id: str, body: ReportIn, request: Request, user=Depends(get_current_user)):
    rate_limit(request, f"report:{user['id']}", 10, 3600)
    job = await db.jobs.find_one({"id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job not found")
    if await db.reports.find_one({"reporter_id": user["id"], "job_id": job_id, "status": "open"}, {"_id": 1}):
        raise HTTPException(409, "You have already reported this job. Our team is reviewing it.")
    await db.reports.insert_one({"id": new_id("rep"), "reporter_id": user["id"], "job_id": job_id,
                                 "company_id": job.get("company_id"), "job_title": job["title"],
                                 "company_name": job.get("company_name"), "category": body.category,
                                 "details": clean(body.details, 1000), "status": "open", "created_at": iso(), "updated_at": iso()})
    for adm in await db.users.find({"role": "admin"}, {"id": 1, "_id": 0}).to_list(20):
        await notify(adm["id"], "job_reported", "Job reported", f"{job['title']} — {body.category}", {"job_id": job_id})
    return {"ok": True, "message": "Thanks. Our team will review this report. No action is taken without review."}


@router.get("/companies/{company_id}")
async def company_page(company_id: str, request: Request):
    c = await db.companies.find_one({"id": company_id}, {"_id": 0})
    if not c or c["verification_status"] in ("rejected", "suspended"):
        raise HTTPException(404, "Company not found")
    user, profile = await _viewer(request)
    jobs = await db.jobs.find({"company_id": company_id, "status": "published"}, {"_id": 0, "description": 0}).sort("posted_at", -1).limit(50).to_list(50)
    c.pop("owner_id", None)
    return {"company": c, "jobs": await _annotate(jobs, user, profile)}


@router.get("/meta")
async def meta():
    cats = await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    skills = await db.skills.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    inds = await db.industries.find({}, {"_id": 0}).sort("name", 1).to_list(200)
    return {"categories": [c["name"] for c in cats], "skills": [s["name"] for s in skills],
            "industries": [i["name"] for i in inds], "work_modes": WORK_MODES, "stages": STAGES,
            "report_categories": REPORT_CATEGORIES}


# ============================== APPLICATIONS ==============================
class ApplyIn(BaseModel):
    job_id: str
    cover_letter: Optional[str] = Field(None, max_length=3000)
    consent: bool
    share_email: bool = True
    share_phone: bool = False


@router.post("/applications")
async def apply(body: ApplyIn, request: Request, user=Depends(candidate_only)):
    rate_limit(request, f"apply:{user['id']}", 30, 3600)
    if not body.consent:
        raise HTTPException(400, "Please confirm consent to share your profile with the recruiter")
    job = await db.jobs.find_one({"id": body.job_id}, {"_id": 0})
    if not job or job["status"] != "published":
        raise HTTPException(404, "This job is not accepting applications")
    if job.get("is_external"):
        raise HTTPException(400, "This job accepts applications on the employer's website only")
    profile = await get_profile(user["id"]) or {}
    missing = [label for f, label in (("name", "Name"), ("current_location", "Current location"), ("skills", "Skills"))
               if not profile.get(f)]
    if missing:
        raise HTTPException(400, f"Complete your profile before applying. Missing: {', '.join(missing)}")
    resume = await active_resume(user["id"])
    if not resume:
        raise HTTPException(400, "Upload a resume before applying")
    if await db.applications.find_one({"candidate_id": user["id"], "job_id": job["id"]}, {"_id": 1}):
        raise HTTPException(409, "You have already applied to this job")
    match = compute_match(profile, job)
    app = {"id": new_id("app"), "candidate_id": user["id"], "job_id": job["id"], "company_id": job["company_id"],
           "resume_id": resume["id"], "resume_file_id": resume["file_id"], "cover_letter": clean(body.cover_letter, 3000),
           "stage": "applied", "candidate_status": "active", "recruiter_notes": [],
           "shared": {"email": body.share_email, "phone": body.share_phone},
           "match_score": match["score"], "job_title": job["title"], "company_name": job.get("company_name"),
           "candidate_name": profile.get("name") or user["name"], "candidate_headline": profile.get("headline"),
           "viewed_at": None, "applied_at": iso(), "created_at": iso(), "updated_at": iso()}
    try:
        await db.applications.insert_one(dict(app))
    except Exception:
        raise HTTPException(409, "You have already applied to this job")
    await db.application_events.insert_one({"id": new_id("aev"), "application_id": app["id"], "stage": "applied",
                                            "note": "Application submitted", "actor_role": "candidate", "created_at": iso()})
    await db.jobs.update_one({"id": job["id"]}, {"$inc": {"applications_count": 1}})
    for r in await db.users.find({"company_id": job["company_id"], "role": "recruiter"}, {"id": 1, "_id": 0}).to_list(20):
        await notify(r["id"], "new_application", "New application", f"{app['candidate_name']} applied for {job['title']}",
                     {"application_id": app["id"], "job_id": job["id"]})
    await notify(user["id"], "application_submitted", "Application submitted",
                 f"You applied for {job['title']} at {job.get('company_name')}.", {"application_id": app["id"]})
    await track("job_applied", user["id"], {"job_id": job["id"]})
    await track("application_received", job.get("posted_by"), {"job_id": job["id"]})
    return app


@router.get("/applications")
async def my_applications(user=Depends(candidate_only)):
    apps = await db.applications.find({"candidate_id": user["id"]}, {"_id": 0, "recruiter_notes": 0}).sort("updated_at", -1).to_list(300)
    jobs = {j["id"]: j for j in await db.jobs.find({"id": {"$in": [a["job_id"] for a in apps]}},
                                                   {"_id": 0, "id": 1, "location": 1, "company_logo_id": 1, "status": 1}).to_list(300)}
    for a in apps:
        j = jobs.get(a["job_id"], {})
        a["location"], a["company_logo_id"], a["job_status"] = j.get("location"), j.get("company_logo_id"), j.get("status")
    return {"items": apps}


@router.get("/applications/{app_id}")
async def application_detail(app_id: str, user=Depends(get_current_user)):
    a = await db.applications.find_one({"id": app_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Application not found")
    if user["role"] == "candidate" and a["candidate_id"] != user["id"]:
        raise HTTPException(404, "Application not found")
    if user["role"] == "recruiter" and a["company_id"] != user.get("company_id"):
        raise HTTPException(404, "Application not found")
    if user["role"] == "candidate":
        a.pop("recruiter_notes", None)
    a["events"] = await db.application_events.find({"application_id": app_id}, {"_id": 0, "actor_id": 0}).sort("created_at", 1).to_list(100)
    a["interviews"] = await db.interviews.find({"application_id": app_id}, {"_id": 0}).sort("scheduled_at", 1).to_list(20)
    a["job"] = await db.jobs.find_one({"id": a["job_id"]}, {"_id": 0, "id": 1, "title": 1, "location": 1, "company_name": 1,
                                                          "company_logo_id": 1, "work_mode": 1, "status": 1})
    return a


@router.post("/applications/{app_id}/withdraw")
async def withdraw(app_id: str, user=Depends(candidate_only)):
    a = await db.applications.find_one({"id": app_id, "candidate_id": user["id"]}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Application not found")
    await db.applications.update_one({"id": app_id}, {"$set": {"candidate_status": "withdrawn", "updated_at": iso()}})
    await db.application_events.insert_one({"id": new_id("aev"), "application_id": app_id, "stage": a["stage"],
                                            "note": "Candidate withdrew application", "actor_role": "candidate", "created_at": iso()})
    return {"ok": True}


@router.post("/jobs/{job_id}/external-click")
async def external_click(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"id": job_id, "is_external": True}, {"_id": 0, "external_url": 1})
    if not job:
        raise HTTPException(404, "Not an external job")
    await track("external_apply_click", user["id"], {"job_id": job_id})
    return {"url": job["external_url"]}


# ============================== NOTIFICATIONS ==============================
@router.get("/notifications")
async def list_notifications(page: int = 1, user=Depends(get_current_user)):
    items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).skip((page - 1) * 30).limit(30).to_list(30)
    unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"items": items, "unread": unread}


@router.post("/notifications/read-all")
async def read_all(user=Depends(get_current_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True, "updated_at": iso()}})
    return {"ok": True}


@router.post("/notifications/{nid}/read")
async def read_one(nid: str, user=Depends(get_current_user)):
    await db.notifications.update_one({"id": nid, "user_id": user["id"]}, {"$set": {"read": True, "updated_at": iso()}})
    return {"ok": True}


# ============================== AI INTERVIEW COACH ==============================
COACH_CATEGORIES = ["HR interview", "Customer Support", "Sales", "Customer Success", "BPO", "EdTech", "Marketing", "Technical", "General"]


class CoachStartIn(BaseModel):
    category: str
    role: Optional[str] = Field(None, max_length=80)
    level: Optional[str] = Field(None, max_length=40)


class CoachAnswerIn(BaseModel):
    index: int = Field(ge=0, le=9)
    answer: str = Field(min_length=10, max_length=4000)


@router.get("/coach/sessions")
async def coach_sessions(user=Depends(candidate_only)):
    items = await db.coach_sessions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(20).to_list(20)
    return {"items": items, "categories": COACH_CATEGORIES}


@router.post("/coach/sessions")
async def coach_start(body: CoachStartIn, request: Request, user=Depends(candidate_only)):
    rate_limit(request, f"coach:{user['id']}", 10, 3600)
    if body.category not in COACH_CATEGORIES:
        raise HTTPException(400, "Unknown category")
    try:
        res = await ai.interview_questions(body.category, clean(body.role, 80), clean(body.level, 40))
    except Exception as e:
        logger.error("coach failed: %s", e)
        raise HTTPException(502, "AI coach is temporarily unavailable. Please retry.")
    qs = [clean(q, 400) for q in (res.get("questions") or [])][:5]
    if not qs:
        raise HTTPException(502, "AI coach returned no questions. Please retry.")
    s = {"id": new_id("cs"), "user_id": user["id"], "category": body.category, "role": clean(body.role, 80),
         "questions": qs, "answers": {}, "created_at": iso(), "updated_at": iso()}
    await db.coach_sessions.insert_one(dict(s))
    return s


@router.get("/coach/sessions/{sid}")
async def coach_get(sid: str, user=Depends(candidate_only)):
    s = await db.coach_sessions.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(404, "Session not found")
    return s


@router.post("/coach/sessions/{sid}/answer")
async def coach_answer(sid: str, body: CoachAnswerIn, request: Request, user=Depends(candidate_only)):
    rate_limit(request, f"coachans:{user['id']}", 40, 3600)
    s = await db.coach_sessions.find_one({"id": sid, "user_id": user["id"]}, {"_id": 0})
    if not s or body.index >= len(s["questions"]):
        raise HTTPException(404, "Question not found")
    try:
        fb = await ai.interview_feedback(s["category"], s["questions"][body.index], clean(body.answer, 4000))
    except Exception as e:
        logger.error("coach feedback failed: %s", e)
        raise HTTPException(502, "AI feedback is temporarily unavailable. Please retry.")
    entry = {"answer": clean(body.answer, 4000), "feedback": fb, "created_at": iso()}
    await db.coach_sessions.update_one({"id": sid}, {"$set": {f"answers.{body.index}": entry, "updated_at": iso()}})
    return entry


# ============================== PLANS / PAYMENTS ==============================
@router.get("/plans")
async def plans(user=Depends(get_current_user)):
    audience = "recruiter" if user["role"] == "recruiter" else "candidate"
    items = await db.plans.find({"audience": audience, "active": True}, {"_id": 0}).sort("price_inr", 1).to_list(20)
    current = await get_plan(user)
    return {"items": items, "current_plan_id": current.get("id"), "payments_enabled": bool(os.environ.get("PAYMENT_PROVIDER"))}


class CheckoutIn(BaseModel):
    plan_id: str


@router.post("/payments/checkout")
async def checkout(body: CheckoutIn, user=Depends(get_current_user)):
    plan = await db.plans.find_one({"id": body.plan_id, "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found")
    provider = os.environ.get("PAYMENT_PROVIDER")
    pay = {"id": new_id("pay"), "user_id": user["id"], "plan_id": plan["id"], "amount_inr": plan["price_inr"],
           "provider": provider or "unconfigured", "status": "created", "created_at": iso(), "updated_at": iso()}
    await db.payments.insert_one(dict(pay))
    if not provider:
        await db.payments.update_one({"id": pay["id"]}, {"$set": {"status": "failed", "error": "provider_not_configured"}})
        raise HTTPException(503, "Online payments are not enabled yet. Please check back soon.")
    # Provider adapters (e.g. Razorpay/Cashfree) plug in here and return a checkout order.
    return {"payment_id": pay["id"], "provider": provider, "status": "created"}
