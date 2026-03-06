"""
FastAPI application setup and route registration.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import leads, dispatch, quote, debug, webhooks, stripe, discounts, messages_sender, sms_inbound
from .ghl_client import fetch_contractors

# Create FastAPI app
app = FastAPI(
    title="Alloy Dispatcher API",
    description="API for dispatching cleaning jobs and managing leads",
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

# Register routers
app.include_router(leads.router)
app.include_router(dispatch.router)
app.include_router(quote.router)
app.include_router(debug.router)
app.include_router(webhooks.router)
app.include_router(stripe.router)
app.include_router(discounts.router)
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

