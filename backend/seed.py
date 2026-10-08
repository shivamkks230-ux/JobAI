"""Indexes, production config (plans/taxonomy) and clearly-labelled DEVELOPMENT test data.

Test data is created only when SEED_TEST_DATA=true and every record carries is_test=True.
Remove it with:  python seed.py --purge   (or Admin > Overview > Remove test data)
"""
import asyncio
import os
import sys

from pymongo import ASCENDING, DESCENDING

from core import db, iso, new_id, hash_password
from domain import DEFAULT_PRIVACY, annual

TEST_PASSWORDS = {"admin": "Admin@123", "recruiter": "Recruiter@123", "candidate": "Candidate@123"}

CATEGORIES = ["Customer Support", "Sales", "Customer Success", "BPO", "EdTech", "Marketing", "Software Engineering",
              "Data & Analytics", "Finance & Accounts", "Human Resources", "Operations", "Design", "Product Management"]
INDUSTRIES = ["IT Services", "Software / SaaS", "EdTech", "BFSI", "E-commerce", "Healthcare", "BPO / KPO",
              "Manufacturing", "Retail", "Telecom", "Media", "Consulting", "Logistics"]
SKILLS = ["Communication", "MS Excel", "Advanced Excel", "CRM", "Salesforce", "Customer Service", "Lead Generation",
          "Negotiation", "Inside Sales", "Cold Calling", "Email Support", "Chat Support", "Hindi", "English",
          "Python", "JavaScript", "React", "Node.js", "SQL", "Java", "AWS", "Data Analysis", "Power BI", "Tableau",
          "SEO", "Social Media Marketing", "Content Writing", "Google Ads", "Tally", "GST", "Recruitment", "Figma"]

PLANS = [
    {"audience": "candidate", "code": "free", "name": "Free", "price_inr": 0, "period": "month", "job_post_limit": 0,
     "features": ["Unlimited job search", "Apply to jobs", "Match scores", "Application tracker", "Basic resume score"]},
    {"audience": "candidate", "code": "premium", "name": "Premium", "price_inr": 299, "period": "month", "job_post_limit": 0,
     "features": ["AI resume optimisation", "Advanced AI matching", "Unlimited interview coach", "Application insights"]},
    {"audience": "recruiter", "code": "free", "name": "Free", "price_inr": 0, "period": "month", "job_post_limit": 2,
     "features": ["2 active job postings", "Basic applicant list"]},
    {"audience": "recruiter", "code": "basic", "name": "Basic", "price_inr": 1999, "period": "month", "job_post_limit": 10,
     "features": ["10 active job postings", "Candidate management", "Interview scheduling"]},
    {"audience": "recruiter", "code": "pro", "name": "Pro", "price_inr": 4999, "period": "month", "job_post_limit": 50,
     "features": ["50 active job postings", "AI candidate matching", "Advanced filters", "Hiring analytics"]},
]


async def create_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index([("role", ASCENDING), ("created_at", DESCENDING)])
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.candidate_profiles.create_index("user_id", unique=True)
    await db.recruiter_profiles.create_index("user_id", unique=True)
    await db.companies.create_index("id", unique=True)
    await db.companies.create_index("verification_status")
    await db.company_verifications.create_index("company_id")
    await db.files.create_index("id", unique=True)
    await db.resumes.create_index([("user_id", ASCENDING), ("is_active", ASCENDING)])
    await db.resume_analysis.create_index("resume_id", unique=True)
    await db.jobs.create_index("id", unique=True)
    await db.jobs.create_index([("status", ASCENDING), ("posted_at", DESCENDING)])
    await db.jobs.create_index([("company_id", ASCENDING), ("status", ASCENDING)])
    await db.jobs.create_index([("status", ASCENDING), ("salary_annual_max", DESCENDING)])
    await db.job_skills.create_index("job_id")
    await db.saved_jobs.create_index([("user_id", ASCENDING), ("job_id", ASCENDING)], unique=True)
    await db.applications.create_index([("candidate_id", ASCENDING), ("job_id", ASCENDING)], unique=True)
    await db.applications.create_index([("company_id", ASCENDING), ("stage", ASCENDING)])
    await db.applications.create_index("id", unique=True)
    await db.application_events.create_index("application_id")
    await db.interviews.create_index([("company_id", ASCENDING), ("scheduled_at", ASCENDING)])
    await db.notifications.create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    await db.messages.create_index("application_id")
    await db.reports.create_index([("status", ASCENDING), ("created_at", DESCENDING)])
    await db.audit_logs.create_index("created_at")
    await db.analytics_events.create_index([("event", ASCENDING), ("date", ASCENDING)])
    await db.daily_active.create_index([("date", ASCENDING), ("user_id", ASCENDING)], unique=True)
    await db.subscriptions.create_index("user_id")
    await db.payments.create_index("user_id")
    for c in ("categories", "skills", "industries"):
        await db[c].create_index("name", unique=True)


async def seed_config():
    for kind, names in (("categories", CATEGORIES), ("industries", INDUSTRIES), ("skills", SKILLS)):
        if await db[kind].count_documents({}) == 0:
            await db[kind].insert_many([{"id": new_id(kind[:3]), "name": n, "created_at": iso(), "updated_at": iso()} for n in names])
    for p in PLANS:
        await db.plans.update_one({"audience": p["audience"], "code": p["code"]},
                                  {"$setOnInsert": {"id": new_id("pln"), **p, "active": True, "created_at": iso(), "updated_at": iso()}},
                                  upsert=True)


async def _user(email, name, role, company_id=None):
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        return existing
    u = {"id": new_id("usr"), "email": email, "name": name, "role": role, "phone": "9000000000",
         "password_hash": hash_password(TEST_PASSWORDS[role]), "auth_provider": "password", "status": "active",
         "company_id": company_id, "is_test": True, "created_at": iso(), "updated_at": iso()}
    await db.users.insert_one(dict(u))
    return u


async def seed_test_data():
    admin = await _user("admin@test.jobmatchai.in", "Test Admin", "admin")
    await db.admin_users.update_one({"user_id": admin["id"]}, {"$setOnInsert": {"user_id": admin["id"], "level": "super",
                                    "is_test": True, "created_at": iso(), "updated_at": iso()}}, upsert=True)
    comp = await db.companies.find_one({"is_test": True, "name": "[TEST] Demo Hiring Co"}, {"_id": 0})
    if not comp:
        comp = {"id": new_id("cmp"), "name": "[TEST] Demo Hiring Co", "website": "https://example.com",
                "description": "Development-only test company. Remove before production.", "industry": "Software / SaaS",
                "size": "51-200", "location": "Bengaluru", "logo_file_id": None, "verification_status": "verified",
                "owner_id": None, "is_test": True, "created_at": iso(), "updated_at": iso()}
        await db.companies.insert_one(dict(comp))
    rec = await _user("recruiter@test.jobmatchai.in", "Test Recruiter", "recruiter", comp["id"])
    await db.companies.update_one({"id": comp["id"]}, {"$set": {"owner_id": rec["id"]}})
    await db.recruiter_profiles.update_one({"user_id": rec["id"]}, {"$setOnInsert": {"user_id": rec["id"], "company_id": comp["id"],
                                           "title": "Talent Partner", "is_test": True, "created_at": iso(), "updated_at": iso()}}, upsert=True)
    cand = await _user("candidate@test.jobmatchai.in", "Test Candidate", "candidate")
    await db.candidate_profiles.update_one({"user_id": cand["id"]}, {"$setOnInsert": {
        "user_id": cand["id"], "name": "Test Candidate", "headline": "Customer Support Executive", "current_location": "Bengaluru",
        "preferred_locations": ["Bengaluru", "Hyderabad"], "experience_years": 2, "skills": ["Communication", "CRM", "Email Support", "MS Excel"],
        "education": [{"degree": "B.Com", "institution": "Test University", "year": "2021"}], "expected_salary": 450000,
        "current_salary": 360000, "notice_period": "30 days", "job_types": ["full_time"], "work_preferences": ["hybrid", "remote"],
        "preferred_industries": ["Software / SaaS"], "preferred_roles": ["Customer Support", "Customer Success"],
        "privacy": DEFAULT_PRIVACY, "is_test": True, "created_at": iso(), "updated_at": iso()}}, upsert=True)
    if await db.jobs.count_documents({"is_test": True}) == 0:
        samples = [
            ("Customer Support Executive", "Customer Support", ["Communication", "Email Support", "CRM"], ["Advanced Excel"], 1, 3, 300000, 450000, "Bengaluru", "hybrid"),
            ("Customer Success Associate", "Customer Success", ["Communication", "CRM", "MS Excel"], ["Salesforce"], 1, 4, 400000, 600000, "Bengaluru", "office"),
            ("Inside Sales Representative", "Sales", ["Inside Sales", "Cold Calling", "Negotiation"], ["CRM"], 0, 2, 250000, 400000, "Hyderabad", "office"),
            ("Chat Support Specialist (Remote)", "Customer Support", ["Chat Support", "English", "Communication"], ["Hindi"], 0, 3, 280000, 420000, "Remote - India", "remote"),
            ("Frontend Developer (React)", "Software Engineering", ["React", "JavaScript"], ["Node.js", "AWS"], 2, 5, 800000, 1400000, "Pune", "hybrid"),
            ("Digital Marketing Executive", "Marketing", ["SEO", "Social Media Marketing", "Google Ads"], ["Content Writing"], 1, 3, 350000, 550000, "Mumbai", "office"),
        ]
        docs = []
        for t, cat, req, pref, mn, mx, smin, smax, loc, mode in samples:
            docs.append({"id": new_id("job"), "company_id": comp["id"], "company_name": comp["name"], "company_logo_id": None,
                         "company_verified": True, "title": t, "category": cat, "industry": "Software / SaaS",
                         "description": f"[TEST DATA] This is a development test listing for {t}. It is not a real vacancy.",
                         "responsibilities": "Handle assigned responsibilities for this role.\nCollaborate with the team.\nMeet quality targets.",
                         "benefits": "Health insurance\nPaid leave", "required_skills": req, "preferred_skills": pref,
                         "min_experience": mn, "max_experience": mx, "education": "Graduate", "salary_min": smin, "salary_max": smax,
                         "salary_period": "yearly", "salary_annual_max": annual(smax, "yearly"), "location": loc, "work_mode": mode,
                         "employment_type": "full_time", "openings": 2, "application_deadline": None, "external_url": None,
                         "is_external": False, "source": "recruiter", "status": "published", "verification_status": "verified",
                         "risk_flags": [], "featured": t.startswith("Customer Success"), "posted_by": rec["id"], "posted_at": iso(),
                         "views": 0, "applications_count": 0, "is_test": True, "created_at": iso(), "updated_at": iso()})
        await db.jobs.insert_many(docs)


async def purge_test_data(keep_user_id: str | None = None) -> dict:
    test_users = [u["id"] for u in await db.users.find({"is_test": True}, {"id": 1, "_id": 0}).to_list(10000) if u["id"] != keep_user_id]
    test_companies = [c["id"] for c in await db.companies.find({"is_test": True}, {"id": 1, "_id": 0}).to_list(1000)]
    test_jobs = [j["id"] for j in await db.jobs.find({"$or": [{"is_test": True}, {"company_id": {"$in": test_companies}}]}, {"id": 1, "_id": 0}).to_list(10000)]
    apps = [a["id"] for a in await db.applications.find({"$or": [{"job_id": {"$in": test_jobs}}, {"candidate_id": {"$in": test_users}}]}, {"id": 1, "_id": 0}).to_list(100000)]
    res = {"users": len(test_users), "companies": len(test_companies), "jobs": len(test_jobs), "applications": len(apps)}
    await db.application_events.delete_many({"application_id": {"$in": apps}})
    await db.interviews.delete_many({"application_id": {"$in": apps}})
    await db.messages.delete_many({"application_id": {"$in": apps}})
    await db.applications.delete_many({"id": {"$in": apps}})
    await db.saved_jobs.delete_many({"$or": [{"job_id": {"$in": test_jobs}}, {"user_id": {"$in": test_users}}]})
    await db.reports.delete_many({"job_id": {"$in": test_jobs}})
    await db.job_skills.delete_many({"job_id": {"$in": test_jobs}})
    await db.jobs.delete_many({"id": {"$in": test_jobs}})
    for coll in ("candidate_profiles", "recruiter_profiles", "notifications", "user_sessions", "coach_sessions",
                 "resumes", "resume_analysis", "admin_users", "subscriptions"):
        await db[coll].delete_many({"user_id": {"$in": test_users}})
    await db.files.update_many({"owner_id": {"$in": test_users}}, {"$set": {"deleted": True}})
    await db.company_verifications.delete_many({"company_id": {"$in": test_companies}})
    await db.companies.delete_many({"id": {"$in": test_companies}})
    await db.users.delete_many({"id": {"$in": test_users}})
    return res


async def startup_seed():
    await create_indexes()
    await seed_config()
    # Seed test data only once per database; after an admin purges it, it never comes back.
    if os.environ.get("SEED_TEST_DATA", "").lower() == "true" and not await db.system_flags.find_one({"key": "test_data_seeded"}):
        await seed_test_data()
        await db.system_flags.insert_one({"key": "test_data_seeded", "created_at": iso()})


if __name__ == "__main__":
    if "--purge" in sys.argv:
        print(asyncio.run(purge_test_data()))
    else:
        asyncio.run(startup_seed())
        print("seeded")
