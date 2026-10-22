"""
FastAPI application setup and route registration.
"""
import os
import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .routes import messages_sender, sms_inbound

# Create FastAPI app
app = FastAPI(
    title="Alloy Dispatcher API",
    description="Alloy platform API: communications dispatch and inbound SMS",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers.
#
# The payment executor router is GONE (Payments V1 · W6-A2). `POST /admin/payments/run` was a
# second money writer beside canonical Payments, and its only caller was the Next.js proxy that
# W6-A1 deleted. Money is written through the registered action registry, never through this API.
app.include_router(messages_sender.router, prefix="/internal")
app.include_router(sms_inbound.router, prefix="/sms")

_GIT_SHA_RE = re.compile(r"^[0-9a-f]{7,40}$", re.I)
SERVICE_IDENTITY = "alloy-dispatcher"


def _running_revision() -> dict:
    """
    Authoritative Render revision identity (RENDER_GIT_*).
    Returns a dict with ok=False when identity is missing or untrustworthy —
    certification must fail closed rather than invent a SHA.
    """
    commit = (os.environ.get("RENDER_GIT_COMMIT") or "").strip()
    branch = (os.environ.get("RENDER_GIT_BRANCH") or "").strip()
    if not commit or not _GIT_SHA_RE.match(commit):
        return {
            "ok": False,
            "service": SERVICE_IDENTITY,
            "git_commit": None,
            "git_branch": branch or None,
            "error": "revision_identity_unavailable",
        }
    return {
        "ok": True,
        "service": SERVICE_IDENTITY,
        "git_commit": commit.lower(),
        "git_branch": branch or None,
    }


# Root and utility routes
@app.get("/")
def root():
    """
    Health check endpoint.

    Returns:
        Simple JSON response indicating the service is running.
    """
    return {"ok": True, "service": SERVICE_IDENTITY}


@app.get("/build-info")
def build_info():
    """
    Read-only running-deployment identity for certification.
    Uses Render-provided RENDER_GIT_COMMIT / RENDER_GIT_BRANCH only.
    """
    info = _running_revision()
    if not info["ok"]:
        raise HTTPException(status_code=503, detail=info)
    return info


@app.get("/contractors")
def get_contractors():
    """
    Get list of eligible contractors.

    Returns:
        JSON with count and list of contractors (filtered by tags:
        contractor_cleaning + job-pending-assignment)
    """
    # Retained shape; contractor fetch was removed with GHL retirement.
    return {"ok": True, "count": 0, "contractors": []}

