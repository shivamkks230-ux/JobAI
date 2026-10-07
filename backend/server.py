import logging
import time

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from core import client, db
import storage
from seed import startup_seed
from routes_main import router as main_router
from routes_recruiter import router as recruiter_router
from routes_admin import router as admin_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)
auth_log = logging.getLogger("AUTH_DEBUG")

app = FastAPI(title="JobMatch AI API")


async def _health():
    try:
        await db.command("ping")
        return {"status": "ok"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "unreachable"})


# Public ingress only forwards /api/* to this service, so /api/health is the externally reachable probe.
app.add_api_route("/health", _health, methods=["GET"])
app.add_api_route("/api/health", _health, methods=["GET"])


@app.middleware("http")
async def auth_debug_logger(request: Request, call_next):
    """AUTH_DEBUG: method, path, status, duration only. Never logs bodies, tokens or passwords."""
    path = request.url.path
    if not (path.startswith("/api/auth") or path.endswith("/health")):
        return await call_next(request)
    t = time.time()
    try:
        response = await call_next(request)
    except Exception as e:
        auth_log.error("%s %s -> EXCEPTION %s (%.0fms)", request.method, path, type(e).__name__, (time.time() - t) * 1000)
        raise
    auth_log.info("%s %s -> %s (%.0fms) ua=%s", request.method, path, response.status_code, (time.time() - t) * 1000,
                  (request.headers.get("user-agent") or "")[:40])
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """Return 400 with a readable message instead of FastAPI's raw 422 list."""
    err = exc.errors()[0] if exc.errors() else {}
    field = str(err.get("loc", ["", "field"])[-1]).replace("_", " ")
    msg = err.get("msg", "Invalid value").replace("Value error, ", "")
    if field == "email":
        msg = "Please enter a valid email address."
    elif field == "password" and "at least" in msg:
        msg = "Password must be at least 8 characters."
    else:
        msg = f"{field.capitalize()}: {msg}"
    return JSONResponse(status_code=400, content={"detail": msg})


app.include_router(main_router)
app.include_router(recruiter_router)
app.include_router(admin_router)

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
async def on_startup():
    await startup_seed()
    try:
        await run_in_threadpool(storage.init_storage)
    except Exception as e:
        logger.error("Storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
