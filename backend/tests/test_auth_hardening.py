"""Iteration 2 — auth hardening tests (health, password rules, 422->400, session)."""
import os
import uuid
import requests

API = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://matchjob-india.preview.emergentagent.com").rstrip("/") + "/api"


class TestHealth:
    def test_health_ok_shape(self):
        r = requests.get(f"{API}/health", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("status") == "ok"


class TestRegisterValidation:
    """Password: 8+ chars with letter + number. 422 -> 400 conversion."""

    def test_invalid_email_400(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": "not-an-email", "password": "Passw0rd1", "name": "X"
        })
        assert r.status_code == 400, r.text

    def test_password_short_400(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_pwshort_{uuid.uuid4().hex[:8]}@example.com",
            "password": "short", "name": "Short Pw"
        })
        assert r.status_code == 400, r.text

    def test_password_no_digit_400(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_pwnodig_{uuid.uuid4().hex[:8]}@example.com",
            "password": "abcdefghij", "name": "No Digit"
        })
        assert r.status_code == 400, r.text

    def test_missing_fields_400(self):
        r = requests.post(f"{API}/auth/register", json={"email": "x@example.com"})
        assert r.status_code == 400, r.text

    def test_role_admin_forbidden_400(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": f"TEST_admin_{uuid.uuid4().hex[:8]}@example.com",
            "password": "Passw0rd1", "name": "Try Admin", "role": "admin"
        })
        assert r.status_code == 400, r.text

    def test_valid_registration_candidate(self):
        email = f"TEST_candnew_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "Passw0rd1", "name": "Cand New"
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "candidate"
        assert d.get("token")
        # cleanup
        tok = d["token"]
        requests.delete(f"{API}/account", headers={"Authorization": f"Bearer {tok}"})

    def test_duplicate_registration_409(self):
        r = requests.post(f"{API}/auth/register", json={
            "email": "candidate@test.jobmatchai.in",
            "password": "Passw0rd1", "name": "Dup"
        })
        assert r.status_code == 409, r.text


class TestLogin:
    def test_login_wrong_password_401(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "candidate@test.jobmatchai.in", "password": "WrongPw1"
        })
        assert r.status_code == 401

    def test_login_unknown_user_401(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": f"unknown_{uuid.uuid4().hex[:6]}@example.com", "password": "Passw0rd1"
        })
        assert r.status_code == 401

    def test_login_valid_200(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": "candidate@test.jobmatchai.in", "password": "Candidate@123"
        })
        assert r.status_code == 200
        assert "token" in r.json()


class TestSession:
    def test_invalid_session_id_401(self):
        r = requests.post(f"{API}/auth/session", json={"session_id": "not-a-real-session"})
        assert r.status_code == 401, r.text
