"""
FastAPI application setup and route registration.
"""
from fastapi import FastAPI
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

# Root and utility routes
@app.get("/")
def root():
    """
    Health check endpoint.

    Returns:
        Simple JSON response indicating the service is running.
    """
    return {"ok": True, "service": "alloy-dispatcher"}


@app.get("/contractors")
def get_contractors():
    """
    Get list of eligible contractors.

    Returns:
        JSON with count and list of contractors (filtered by tags:
        contractor_cleaning + job-pending-assignment)
    """
    contractors = fetch_contractors()
    return {"ok": True, "count": len(contractors), "contractors": contractors}

