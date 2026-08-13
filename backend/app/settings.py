"""
Application settings, environment variables, and constants.

GoHighLevel retirement: every GHL_* variable, the LeadConnector API constants,
the cleaning custom-field catalogue, contractor tags, service types, photo
limits, and the in-memory JOB_STORE / OFFER_STORE were removed with the legacy
cleaning product. Alloy no longer reads any GHL environment variable.
"""
import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

# Backend root: .../backend/.env (not cwd — stable under uvicorn reload / any launch dir)
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("alloy-dispatcher")

# ---------------------------------------------------------------------------
# Stripe
# ---------------------------------------------------------------------------

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()

# Fail fast if required Stripe env vars are missing
if not STRIPE_SECRET_KEY:
    raise ValueError("STRIPE_SECRET_KEY environment variable is required but not set")
if not STRIPE_WEBHOOK_SECRET:
    raise ValueError("STRIPE_WEBHOOK_SECRET environment variable is required but not set")

# Dedicated credential for the payment executor (POST /admin/payments/run),
# called only by the authenticated Next.js proxy.
#
# This is deliberately its own secret: a card-charging executor must not be
# reachable with a credential shared with anything else.
#
# Server-only. Never exposed to the browser (no NEXT_PUBLIC_ prefix anywhere).
PAYMENT_EXECUTOR_SECRET = os.getenv("PAYMENT_EXECUTOR_SECRET", "").strip()


def payment_executor_configured() -> bool:
    """True when the payment executor can authenticate. When false it fails closed."""
    return bool(PAYMENT_EXECUTOR_SECRET)


if not payment_executor_configured():
    logger.warning(
        "PAYMENT_EXECUTOR_SECRET not set. POST /admin/payments/run will return 503 until configured."
    )

# ---------------------------------------------------------------------------
# Supabase (system of record)
# ---------------------------------------------------------------------------

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

# Supabase is optional for now (graceful degradation if not configured)
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    logger.warning(
        "SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY not set. "
        "Supabase writes will be skipped. Set these env vars to enable Supabase-first writes."
    )

# ---------------------------------------------------------------------------
# Communications
# ---------------------------------------------------------------------------

# Twilio (for message sender / SMS). None if env not set; app must still boot.
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_MESSAGING_SERVICE_SID = os.getenv("TWILIO_MESSAGING_SERVICE_SID")

# Inbound SMS webhook (Card 24). Default: enabled when unset (backward compatible).
_COMM_SMS_IN = os.getenv("COMMUNICATIONS_SMS_INBOUND_ENABLED", "").strip().lower()
COMMUNICATIONS_SMS_INBOUND_ENABLED = _COMM_SMS_IN not in ("0", "false", "no", "off")

# Optional: public base URL Twilio uses in webhook config (scheme+host, no path).
# If unset, inbound signature validation uses the request URL as seen by the app
# (set behind reverse proxies when Host/public URL differs from internal URL).
COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL = os.getenv(
    "COMMUNICATIONS_TWILIO_INBOUND_VALIDATION_BASE_URL", ""
).strip()

# Public origin Twilio can reach for the per-message statusCallback (scheme+host,
# no path). Unset means no statusCallback is attached and delivery receipts fall
# back to the Messaging Service console configuration — which is why the sender
# treats it as optional rather than refusing to send.
#
# Referenced by services/communication_message_sender.py but never defined here.
# app/server.py imports that module at load, so the ImportError took the whole
# backend down — payments and message dispatch as much as inbound SMS — for
# anyone starting it from source.
PUBLIC_TWILIO_STATUS_CALLBACK_BASE = os.getenv("PUBLIC_TWILIO_STATUS_CALLBACK_BASE", "").strip()

# Internal cron token for POST /internal/messages/process
INTERNAL_CRON_TOKEN = os.getenv("INTERNAL_CRON_TOKEN")
