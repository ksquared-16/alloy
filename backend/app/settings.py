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
# NO STRIPE, AND NO PAYMENT EXECUTOR (Payments V1 · W6-A2)
# ---------------------------------------------------------------------------
#
# This module used to read STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET and REFUSE TO BOOT without
# them, plus a dedicated PAYMENT_EXECUTOR_SECRET for `POST /admin/payments/run`.
#
# All three are gone with that endpoint. The backend now serves Communications dispatch and inbound
# SMS, and neither touches Stripe — the canonical webhook is `web/app/api/stripe/webhook/route.ts`
# and money is written through the registered action registry.
#
# Removing the boot check is part of the repair rather than incidental to it: a service that refuses
# to start for a credential it never uses is a false dependency, and three backend tests had already
# begun setting STRIPE_WEBHOOK_SECRET to a placeholder purely to get past it.

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

# Public base URL for Twilio status callbacks (optional; empty disables absolute callback URLs).
PUBLIC_TWILIO_STATUS_CALLBACK_BASE = os.getenv("PUBLIC_TWILIO_STATUS_CALLBACK_BASE", "").strip()
