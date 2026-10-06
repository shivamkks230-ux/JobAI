import os
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://matchjob-india.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def api():
    return API


@pytest.fixture(scope="session")
def admin_token():
    return login("admin@test.jobmatchai.in", "Admin@123")["token"]


@pytest.fixture(scope="session")
def recruiter_token():
    return login("recruiter@test.jobmatchai.in", "Recruiter@123")["token"]


@pytest.fixture(scope="session")
def candidate_token():
    return login("candidate@test.jobmatchai.in", "Candidate@123")["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def hdr():
    return auth
