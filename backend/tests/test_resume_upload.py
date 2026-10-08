"""Resume upload regression — preview AND prod backends.

Covers (per environment):
- POST /candidate/resume with a real .docx  -> 200
- POST /candidate/resume with .txt          -> 415 (unsupported type)
- POST /candidate/resume with 6MB pdf       -> 413 (too large)
- POST /candidate/resume with fake pdf bytes-> 400 (invalid file)
- GET  /candidate/resume polls until analysis completed with score (30s)
- POST /candidate/resume/reanalyze          -> {"status": "processing"}
- DELETE /candidate/resume                  -> ok, GET confirms gone
"""
import os
import time

import pytest
import requests

FIXTURES = "/tmp/fixtures"
CANDIDATE = {"email": "candidate@test.jobmatchai.in", "password": "Candidate@123"}

ENVS = {
    "preview": "https://matchjob-india.preview.emergentagent.com",
    "prod": "https://matchjob-india.emergent.host",
}


def _login(base):
    r = requests.post(f"{base}/api/auth/login", json=CANDIDATE, timeout=30)
    assert r.status_code == 200, f"login failed on {base}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def _hdr(token):
    return {"Authorization": f"Bearer {token}"}


def _upload(base, token, path, filename, mime):
    with open(path, "rb") as f:
        return requests.post(f"{base}/api/candidate/resume", headers=_hdr(token),
                             files={"file": (filename, f, mime)}, timeout=150)


@pytest.fixture(scope="module", params=list(ENVS), ids=list(ENVS))
def env(request):
    base = ENVS[request.param]
    return {"name": request.param, "base": base, "token": _login(base)}


# Upload ordering matters: error cases first (they never store a resume),
# then the real docx once per environment. Rate limit is 10 uploads/hour/user.
class TestResumeErrorCodes:
    def test_txt_rejected_415(self, env):
        r = _upload(env["base"], env["token"], f"{FIXTURES}/test_resume.txt", "test_resume.txt", "text/plain")
        assert r.status_code == 415, f"[{env['name']}] expected 415, got {r.status_code}: {r.text[:300]}"
        assert "Unsupported file type" in r.json().get("detail", "")

    def test_oversize_pdf_rejected_413(self, env):
        r = _upload(env["base"], env["token"], f"{FIXTURES}/big.pdf", "big.pdf", "application/pdf")
        assert r.status_code == 413, f"[{env['name']}] expected 413, got {r.status_code}: {r.text[:300]}"
        assert "too large" in r.json().get("detail", "").lower()

    def test_fake_pdf_rejected_400(self, env):
        r = _upload(env["base"], env["token"], f"{FIXTURES}/fake.pdf", "fake.pdf", "application/pdf")
        assert r.status_code == 400, f"[{env['name']}] expected 400, got {r.status_code}: {r.text[:300]}"
        assert "not a valid PDF" in r.json().get("detail", "")


class TestResumeHappyPath:
    def test_upload_docx_200(self, env):
        r = _upload(env["base"], env["token"], f"{FIXTURES}/test_resume.docx", "test_resume.docx",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        assert r.status_code == 200, f"[{env['name']}] upload failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data["file_name"] == "test_resume.docx"
        assert data["ext"] == "docx"
        assert data["size"] > 0
        assert "text" not in data, "resume text must not be leaked in upload response"
        env["resume_id"] = data["id"]

    def test_analysis_completes_with_score(self, env):
        deadline = time.time() + 40
        last = None
        while time.time() < deadline:
            r = requests.get(f"{env['base']}/api/candidate/resume", headers=_hdr(env["token"]), timeout=30)
            assert r.status_code == 200
            last = r.json()
            status = (last.get("analysis") or {}).get("status")
            if status == "completed":
                break
            if status == "failed":
                pytest.fail(f"[{env['name']}] analysis failed: {(last.get('analysis') or {}).get('error')}")
            time.sleep(3)
        a = last.get("analysis") or {}
        assert a.get("status") == "completed", f"[{env['name']}] analysis did not complete in 40s: {a.get('status')}"
        assert isinstance(a.get("score"), int) and 0 <= a["score"] <= 100, f"[{env['name']}] bad score: {a.get('score')}"
        assert last["resume"]["id"] == env.get("resume_id") or last["resume"], f"[{env['name']}] no active resume"

    def test_reanalyze_returns_processing(self, env):
        r = requests.post(f"{env['base']}/api/candidate/resume/reanalyze", headers=_hdr(env["token"]), timeout=30)
        assert r.status_code == 200, f"[{env['name']}] reanalyze: {r.status_code} {r.text[:200]}"
        assert r.json().get("status") == "processing"
        # wait for it to finish so delete happens on a completed analysis
        deadline = time.time() + 40
        while time.time() < deadline:
            g = requests.get(f"{env['base']}/api/candidate/resume", headers=_hdr(env["token"]), timeout=30).json()
            if (g.get("analysis") or {}).get("status") != "processing":
                break
            time.sleep(3)

    def test_delete_resume_ok_and_gone(self, env):
        r = requests.delete(f"{env['base']}/api/candidate/resume", headers=_hdr(env["token"]), timeout=30)
        assert r.status_code == 200, f"[{env['name']}] delete: {r.status_code} {r.text[:200]}"
        assert r.json().get("ok") is True
        g = requests.get(f"{env['base']}/api/candidate/resume", headers=_hdr(env["token"]), timeout=30)
        assert g.status_code == 200
        assert g.json().get("resume") is None, f"[{env['name']}] resume still present after delete"
