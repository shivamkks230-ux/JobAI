"""Iteration 4 — Admin approval + reject + application enrichment regression suite."""
import os, uuid, time
import requests
import pytest

API = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://matchjob-india.preview.emergentagent.com").rstrip("/") + "/api"


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _qa_job_payload():
    return {
        "title": "QA Auto Pending " + uuid.uuid4().hex[:6],
        "description": "Auto-created pending job for iteration 4 admin approval flow regression testing.",
        "location": "Bangalore", "work_mode": "remote", "employment_type": "full_time",
        "min_experience": 1, "max_experience": 5,
        "salary_annual_min": 500000, "salary_annual_max": 1200000,
        "required_skills": ["pytest"], "category": "Engineering", "industry": "IT Services",
    }


# ============ RBAC ============
class TestAdminRBAC:
    def test_no_token_metrics(self):
        r = requests.get(f"{API}/admin/metrics")
        assert r.status_code in (401, 403)

    def test_candidate_blocked_admin_jobs(self, candidate_token):
        r = requests.get(f"{API}/admin/jobs", headers=h(candidate_token))
        assert r.status_code == 403

    def test_candidate_blocked_admin_users(self, candidate_token):
        r = requests.get(f"{API}/admin/users", headers=h(candidate_token))
        assert r.status_code == 403

    def test_recruiter_blocked_admin_metrics(self, recruiter_token):
        r = requests.get(f"{API}/admin/metrics", headers=h(recruiter_token))
        assert r.status_code == 403


# ============ APPROVAL FLOW ============
class TestApprovalFlow:
    @pytest.fixture(scope="class")
    def created_job(self, recruiter_token):
        r = requests.post(f"{API}/recruiter/jobs", headers=h(recruiter_token), json=_qa_job_payload())
        if r.status_code == 402:
            pytest.skip("Recruiter plan quota reached")
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["status"] == "pending_approval", f"Expected pending_approval, got {d['status']}"
        return d

    def test_candidate_cannot_see_pending(self, created_job, candidate_token):
        """Candidate /jobs listing must NOT include pending_approval jobs."""
        r = requests.get(f"{API}/jobs?limit=50", headers=h(candidate_token))
        assert r.status_code == 200
        ids = [j["id"] for j in r.json()["items"]]
        assert created_job["id"] not in ids

    def test_admin_metrics_has_pending_and_new_fields(self, created_job, admin_token):
        r = requests.get(f"{API}/admin/metrics", headers=h(admin_token))
        assert r.status_code == 200
        m = r.json()
        for k in ("pending_jobs", "rejected_jobs", "shortlisted", "active_candidates", "active_recruiters"):
            assert k in m, f"metrics missing {k}"
        assert m["pending_jobs"] >= 1

    def test_admin_jobs_pending_has_recruiter_fields(self, created_job, admin_token):
        r = requests.get(f"{API}/admin/jobs?status=pending_approval&limit=50", headers=h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        match = [j for j in items if j["id"] == created_job["id"]]
        assert match, "created pending job not in admin pending list"
        j = match[0]
        assert j.get("recruiter_name"), "recruiter_name missing"
        assert j.get("recruiter_email"), "recruiter_email missing"

    def test_admin_approve_publishes(self, created_job, admin_token, candidate_token):
        r = requests.post(f"{API}/admin/jobs/{created_job['id']}/moderate",
                          headers=h(admin_token), json={"action": "approve"})
        assert r.status_code == 200
        # Now candidate /jobs sees it
        time.sleep(0.5)
        lst = requests.get(f"{API}/jobs?limit=50", headers=h(candidate_token)).json()["items"]
        assert created_job["id"] in [j["id"] for j in lst]
        # Admin jobs?status=published includes it
        pub = requests.get(f"{API}/admin/jobs?status=published&limit=50", headers=h(admin_token)).json()["items"]
        assert created_job["id"] in [j["id"] for j in pub]

    def test_candidate_apply_enriched(self, created_job, candidate_token):
        r = requests.post(f"{API}/applications", headers=h(candidate_token),
                          json={"job_id": created_job["id"], "consent": True})
        assert r.status_code == 200, r.text
        app = r.json()
        assert app.get("recruiter_id"), "application missing recruiter_id"
        assert app.get("candidate_email"), "application missing candidate_email"
        assert app.get("read") is False
        pytest.CREATED_APP_ID = app["id"]

    def test_duplicate_apply_409(self, created_job, candidate_token):
        r = requests.post(f"{API}/applications", headers=h(candidate_token),
                          json={"job_id": created_job["id"], "consent": True})
        assert r.status_code == 409

    def test_recruiter_dashboard_has_app(self, recruiter_token):
        r = requests.get(f"{API}/recruiter/dashboard", headers=h(recruiter_token))
        assert r.status_code == 200
        d = r.json()
        assert d["metrics"]["total_applications"] >= 1
        app_id = getattr(pytest, "CREATED_APP_ID", None)
        if app_id:
            ids = [a["id"] for a in d.get("recent_applications", [])]
            assert app_id in ids, "application not in recent_applications"

    def test_move_to_shortlisted(self, recruiter_token, admin_token):
        app_id = getattr(pytest, "CREATED_APP_ID", None)
        if not app_id:
            pytest.skip("No application created")
        before = requests.get(f"{API}/admin/metrics", headers=h(admin_token)).json()["shortlisted"]
        r = requests.post(f"{API}/recruiter/applications/{app_id}/stage",
                          headers=h(recruiter_token), json={"stage": "shortlisted"})
        assert r.status_code == 200
        after = requests.get(f"{API}/admin/metrics", headers=h(admin_token)).json()["shortlisted"]
        assert after >= before + 1

    def test_admin_applications_stage_filter(self, admin_token):
        r = requests.get(f"{API}/admin/applications?stage=shortlisted", headers=h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert all(a["stage"] == "shortlisted" for a in items), "stage filter failed"
        if items:
            assert "recruiter_name" in items[0]

    def test_move_to_hired(self, recruiter_token, admin_token):
        app_id = getattr(pytest, "CREATED_APP_ID", None)
        if not app_id:
            pytest.skip("No application")
        before = requests.get(f"{API}/admin/metrics", headers=h(admin_token)).json()["hires"]
        r = requests.post(f"{API}/recruiter/applications/{app_id}/stage",
                          headers=h(recruiter_token), json={"stage": "hired"})
        assert r.status_code == 200
        after = requests.get(f"{API}/admin/metrics", headers=h(admin_token)).json()["hires"]
        assert after >= before + 1

    def test_candidate_notifications_include_submitted_and_stage(self, candidate_token):
        r = requests.get(f"{API}/notifications?limit=50", headers=h(candidate_token))
        assert r.status_code == 200
        types = [n.get("type", "") for n in r.json().get("items", [])]
        assert any("application" in t or "submitted" in t for t in types) or any(t.startswith("stage_") for t in types), f"no application/stage notifications; types={types[:10]}"


# ============ REJECT FLOW ============
class TestRejectFlow:
    @pytest.fixture(scope="class")
    def rejected_job(self, recruiter_token, admin_token):
        r = requests.post(f"{API}/recruiter/jobs", headers=h(recruiter_token), json=_qa_job_payload())
        if r.status_code == 402:
            pytest.skip("Plan quota reached")
        assert r.status_code in (200, 201), r.text
        job = r.json()
        assert job["status"] == "pending_approval"
        rj = requests.post(f"{API}/admin/jobs/{job['id']}/moderate", headers=h(admin_token),
                           json={"action": "reject", "note": "QA auto-rejected for regression test"})
        assert rj.status_code == 200
        return job

    def test_rejected_in_admin_rejected_list(self, rejected_job, admin_token):
        r = requests.get(f"{API}/admin/jobs?status=rejected&limit=50", headers=h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert rejected_job["id"] in [j["id"] for j in items]

    def test_rejected_not_visible_to_candidate(self, rejected_job, candidate_token):
        r = requests.get(f"{API}/jobs?limit=50", headers=h(candidate_token))
        assert rejected_job["id"] not in [j["id"] for j in r.json()["items"]]

    def test_rejected_visible_to_recruiter(self, rejected_job, recruiter_token):
        r = requests.get(f"{API}/recruiter/jobs", headers=h(recruiter_token))
        assert r.status_code == 200
        items = r.json().get("items") or r.json().get("jobs") or []
        found = [j for j in items if j["id"] == rejected_job["id"]]
        assert found, "recruiter cannot see own rejected job"
        assert found[0]["status"] == "rejected"


# ============ ADMIN USERS ENRICHED ============
class TestAdminUsersEnriched:
    def test_candidates_enriched(self, admin_token):
        r = requests.get(f"{API}/admin/users?role=candidate&limit=10", headers=h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert items, "no candidates found"
        cands = [u for u in items if u.get("role") == "candidate"]
        assert cands
        u = cands[0]
        for k in ("profile_completion", "has_resume", "applications_count"):
            assert k in u, f"candidate user missing {k}"

    def test_recruiters_enriched(self, admin_token):
        r = requests.get(f"{API}/admin/users?role=recruiter&limit=10", headers=h(admin_token))
        assert r.status_code == 200
        items = r.json()["items"]
        assert items, "no recruiters"
        u = [x for x in items if x.get("role") == "recruiter"][0]
        for k in ("company_name", "jobs_posted", "jobs_published", "applications_received"):
            assert k in u, f"recruiter user missing {k}"
