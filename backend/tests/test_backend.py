"""Comprehensive backend API test suite for JobMatch AI."""
import os
import time
import uuid
import requests
import pytest

API = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://matchjob-india.preview.emergentagent.com").rstrip("/") + "/api"


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ============ HEALTH / META ============
class TestHealthMeta:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=20)
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_meta(self):
        r = requests.get(f"{API}/meta", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("categories", "skills", "industries", "work_modes", "stages", "report_categories"):
            assert k in d


# ============ AUTH ============
class TestAuth:
    def test_login_admin(self, admin_token):
        assert admin_token

    def test_login_bad(self):
        r = requests.post(f"{API}/auth/login", json={"email": "admin@test.jobmatchai.in", "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, candidate_token):
        r = requests.get(f"{API}/auth/me", headers=h(candidate_token))
        assert r.status_code == 200
        assert r.json()["role"] == "candidate"

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code in (401, 403)

    def test_duplicate_registration(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": "candidate@test.jobmatchai.in", "password": "Password@123", "name": "Dup"
        })
        assert r.status_code == 409

    def test_register_candidate_and_delete(self):
        email = f"TEST_cand_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Password@123", "name": "Test Cand"
        })
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        assert r.json()["user"]["role"] == "candidate"
        # /auth/me
        r2 = requests.get(f"{API}/auth/me", headers=h(tok))
        assert r2.status_code == 200
        # delete account (fresh user per instructions)
        rd = requests.delete(f"{API}/account", headers=h(tok))
        assert rd.status_code == 200

    def test_register_recruiter_pending(self):
        email = f"TEST_rec_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Password@123", "name": "Test Rec", "role": "recruiter",
            "company": {"name": "TEST Co " + uuid.uuid4().hex[:6], "industry": "IT Services"}
        })
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["role"] == "recruiter"
        assert u.get("company", {}).get("verification_status") == "pending"

    def test_register_recruiter_missing_company(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_rec2_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password@123", "name": "Valid Name", "role": "recruiter"
        })
        assert r.status_code == 400

    def test_logout(self, candidate_token):
        # Don't use the fixture token (session-scoped), create a fresh one
        tok = requests.post(f"{API}/auth/login", json={
            "email": "candidate@test.jobmatchai.in", "password": "Candidate@123"}).json()["token"]
        r = requests.post(f"{API}/auth/logout", headers=h(tok))
        assert r.status_code == 200


# ============ RBAC ============
class TestRBAC:
    def test_candidate_blocked_admin(self, candidate_token):
        r = requests.get(f"{API}/admin/metrics", headers=h(candidate_token))
        assert r.status_code == 403

    def test_recruiter_blocked_admin(self, recruiter_token):
        r = requests.get(f"{API}/admin/metrics", headers=h(recruiter_token))
        assert r.status_code == 403

    def test_candidate_blocked_recruiter(self, candidate_token):
        r = requests.get(f"{API}/recruiter/dashboard", headers=h(candidate_token))
        assert r.status_code == 403


# ============ CANDIDATE PROFILE ============
class TestProfile:
    def test_get(self, candidate_token):
        r = requests.get(f"{API}/candidate/profile", headers=h(candidate_token))
        assert r.status_code == 200
        assert "completion" in r.json()

    def test_update(self, candidate_token):
        r = requests.put(f"{API}/candidate/profile", headers=h(candidate_token),
                         json={"headline": "QA Updated " + uuid.uuid4().hex[:4]})
        assert r.status_code == 200
        assert r.json()["headline"].startswith("QA Updated")


# ============ RESUME ============
class TestResume:
    def test_get_resume(self, candidate_token):
        r = requests.get(f"{API}/candidate/resume", headers=h(candidate_token))
        assert r.status_code == 200
        d = r.json()
        # Candidate was seeded with a resume
        assert d["resume"] is not None, "Seeded candidate should have a resume"
        assert d["analysis"] is not None

    def test_resume_improve(self, candidate_token):
        r = requests.post(f"{API}/ai/resume-improve", headers=h(candidate_token),
                          json={"mode": "summary"})
        assert r.status_code in (200, 502), r.text
        if r.status_code == 200:
            assert isinstance(r.json(), dict)


# ============ JOBS ============
class TestJobs:
    def test_list_jobs(self):
        r = requests.get(f"{API}/jobs?limit=5")
        assert r.status_code == 200
        assert "items" in r.json()

    def test_list_jobs_filters(self):
        r = requests.get(f"{API}/jobs?work_mode=remote&limit=5")
        assert r.status_code == 200

    def test_list_jobs_sort_best_match(self, candidate_token):
        r = requests.get(f"{API}/jobs?sort=best_match&limit=5", headers=h(candidate_token))
        assert r.status_code == 200

    def test_home_feed(self, candidate_token):
        r = requests.get(f"{API}/jobs/home", headers=h(candidate_token))
        assert r.status_code == 200
        d = r.json()
        for k in ("recommended", "high_match", "recent", "remote", "featured_companies"):
            assert k in d

    def test_job_detail(self, candidate_token):
        lst = requests.get(f"{API}/jobs?limit=1").json()["items"]
        assert lst, "no jobs seeded"
        jid = lst[0]["id"]
        r = requests.get(f"{API}/jobs/{jid}", headers=h(candidate_token))
        assert r.status_code == 200
        assert r.json()["id"] == jid

    def test_save_unsave(self, candidate_token):
        jid = requests.get(f"{API}/jobs?limit=1").json()["items"][0]["id"]
        r1 = requests.post(f"{API}/jobs/{jid}/save", headers=h(candidate_token))
        assert r1.status_code == 200 and r1.json()["saved"] is True
        r2 = requests.get(f"{API}/saved", headers=h(candidate_token))
        assert r2.status_code == 200
        ids = [i["id"] for i in r2.json()["items"]]
        assert jid in ids
        r3 = requests.delete(f"{API}/jobs/{jid}/save", headers=h(candidate_token))
        assert r3.status_code == 200 and r3.json()["saved"] is False


# ============ APPLICATIONS ============
class TestApplications:
    def test_list(self, candidate_token):
        r = requests.get(f"{API}/applications", headers=h(candidate_token))
        assert r.status_code == 200
        assert len(r.json()["items"]) >= 1

    def test_apply_consent_false(self, candidate_token):
        jid = requests.get(f"{API}/jobs?limit=1").json()["items"][0]["id"]
        r = requests.post(f"{API}/applications", headers=h(candidate_token),
                          json={"job_id": jid, "consent": False})
        assert r.status_code == 400

    def test_apply_duplicate(self, candidate_token):
        apps = requests.get(f"{API}/applications", headers=h(candidate_token)).json()["items"]
        if not apps:
            pytest.skip("No existing application")
        jid = apps[0]["job_id"]
        r = requests.post(f"{API}/applications", headers=h(candidate_token),
                          json={"job_id": jid, "consent": True})
        assert r.status_code == 409

    def test_application_detail(self, candidate_token):
        apps = requests.get(f"{API}/applications", headers=h(candidate_token)).json()["items"]
        if not apps:
            pytest.skip("No application")
        r = requests.get(f"{API}/applications/{apps[0]['id']}", headers=h(candidate_token))
        assert r.status_code == 200
        d = r.json()
        assert "events" in d and "interviews" in d


# ============ COACH ============
class TestCoach:
    @pytest.fixture(scope="class")
    def session_id(self, candidate_token):
        r = requests.post(f"{API}/coach/sessions", headers=h(candidate_token),
                          json={"category": "HR interview", "role": "Support Executive"}, timeout=60)
        assert r.status_code in (200, 502), r.text
        if r.status_code == 502:
            pytest.skip("AI coach temporarily unavailable")
        d = r.json()
        assert len(d["questions"]) > 0
        return d["id"]

    def test_sessions_list(self, candidate_token):
        r = requests.get(f"{API}/coach/sessions", headers=h(candidate_token))
        assert r.status_code == 200
        assert "categories" in r.json()

    def test_answer(self, candidate_token, session_id):
        r = requests.post(f"{API}/coach/sessions/{session_id}/answer", headers=h(candidate_token),
                          json={"index": 0, "answer": "I have 3 years experience resolving customer issues effectively."},
                          timeout=60)
        assert r.status_code in (200, 502)
        if r.status_code == 200:
            assert "feedback" in r.json()


# ============ RECRUITER ============
class TestRecruiter:
    def test_dashboard(self, recruiter_token):
        r = requests.get(f"{API}/recruiter/dashboard", headers=h(recruiter_token))
        assert r.status_code == 200

    def test_company_get(self, recruiter_token):
        r = requests.get(f"{API}/recruiter/company", headers=h(recruiter_token))
        assert r.status_code == 200

    def test_jobs_list(self, recruiter_token):
        r = requests.get(f"{API}/recruiter/jobs", headers=h(recruiter_token))
        assert r.status_code == 200

    def test_applications(self, recruiter_token):
        r = requests.get(f"{API}/recruiter/applications", headers=h(recruiter_token))
        assert r.status_code == 200

    def test_interviews(self, recruiter_token):
        r = requests.get(f"{API}/recruiter/interviews", headers=h(recruiter_token))
        assert r.status_code == 200

    def test_post_job(self, recruiter_token):
        payload = {
            "title": "TEST QA Engineer " + uuid.uuid4().hex[:6],
            "description": "Test the application thoroughly across functional and UI layers.",
            "location": "Bangalore", "work_mode": "remote", "employment_type": "full_time",
            "min_experience": 1, "max_experience": 5,
            "salary_annual_min": 500000, "salary_annual_max": 1200000,
            "required_skills": ["pytest", "playwright"], "category": "Engineering",
            "industry": "IT Services"
        }
        r = requests.post(f"{API}/recruiter/jobs", headers=h(recruiter_token), json=payload)
        # 402 is expected when plan quota reached; otherwise should be 200/201
        assert r.status_code in (200, 201, 402), r.text
        if r.status_code in (200, 201):
            d = r.json()
            assert d.get("status") in ("published", "pending_approval", "draft")


# ============ ADMIN ============
class TestAdmin:
    def test_metrics(self, admin_token):
        r = requests.get(f"{API}/admin/metrics", headers=h(admin_token))
        assert r.status_code == 200

    def test_users(self, admin_token):
        r = requests.get(f"{API}/admin/users?limit=5", headers=h(admin_token))
        assert r.status_code == 200

    def test_companies(self, admin_token):
        r = requests.get(f"{API}/admin/companies?limit=5", headers=h(admin_token))
        assert r.status_code == 200

    def test_jobs(self, admin_token):
        r = requests.get(f"{API}/admin/jobs?limit=5", headers=h(admin_token))
        assert r.status_code == 200

    def test_reports(self, admin_token):
        r = requests.get(f"{API}/admin/reports?limit=5", headers=h(admin_token))
        assert r.status_code == 200

    def test_analytics(self, admin_token):
        r = requests.get(f"{API}/admin/analytics", headers=h(admin_token))
        assert r.status_code == 200

    def test_audit_logs(self, admin_token):
        r = requests.get(f"{API}/admin/audit-logs?limit=5", headers=h(admin_token))
        assert r.status_code == 200

    def test_plans(self, admin_token):
        r = requests.get(f"{API}/plans", headers=h(admin_token))
        assert r.status_code == 200

    def test_integrations(self, admin_token):
        r = requests.get(f"{API}/admin/integrations", headers=h(admin_token))
        assert r.status_code == 200


# ============ NOTIFICATIONS ============
class TestNotifications:
    def test_list(self, candidate_token):
        r = requests.get(f"{API}/notifications", headers=h(candidate_token))
        assert r.status_code == 200

    def test_read_all(self, candidate_token):
        r = requests.post(f"{API}/notifications/read-all", headers=h(candidate_token))
        assert r.status_code == 200


# ============ PLANS / PAYMENTS ============
class TestPlans:
    def test_plans(self, candidate_token):
        r = requests.get(f"{API}/plans", headers=h(candidate_token))
        assert r.status_code == 200
        d = r.json()
        assert d["payments_enabled"] is False

    def test_checkout_503(self, candidate_token):
        pl = requests.get(f"{API}/plans", headers=h(candidate_token)).json()["items"]
        if not pl:
            pytest.skip("No plans seeded")
        r = requests.post(f"{API}/payments/checkout", headers=h(candidate_token),
                          json={"plan_id": pl[0]["id"]})
        assert r.status_code == 503


# ============ FILE INVALID ============
class TestFileValidation:
    def test_upload_txt_rejected(self, candidate_token):
        files = {"file": ("resume.txt", b"hello", "text/plain")}
        r = requests.post(f"{API}/candidate/resume", headers=h(candidate_token), files=files)
        assert r.status_code == 415  # unsupported type -> 415 (updated contract)

    def test_upload_fake_pdf_rejected(self, candidate_token):
        files = {"file": ("fake.pdf", b"not a pdf", "application/pdf")}
        r = requests.post(f"{API}/candidate/resume", headers=h(candidate_token), files=files)
        assert r.status_code == 400
