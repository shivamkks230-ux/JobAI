import logging

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware

from core import client
import storage
from seed import startup_seed
from routes_main import router as main_router
from routes_recruiter import router as recruiter_router
from routes_admin import router as admin_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="JobMatch AI API")


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "JobMatch AI"}


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
