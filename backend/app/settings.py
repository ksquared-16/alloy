"""
Application settings, environment variables, and constants.
"""
import logging
import os
import threading
from pathlib import Path
from typing import Dict, Any, Optional

from dotenv import load_dotenv

# Backend root: .../backend/.env (not cwd — stable under uvicorn reload / any launch dir)
env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("alloy-dispatcher")

# Environment variables
GHL_API_KEY = os.getenv("GHL_API_KEY", "").strip()
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID", "").strip()


def ghl_configured() -> bool:
    """True when both GHL credentials are present (API calls may proceed)."""
    return bool(GHL_API_KEY and GHL_LOCATION_ID)


def require_ghl_config() -> None:
    """
    Enforce GHL env for code paths that call the LeadConnector API.
    Do not call at import time — allows the app to boot for Stripe-only / health checks.
    """
    if not GHL_API_KEY:
        raise ValueError("GHL_API_KEY is required for this operation but is not set")
    if not GHL_LOCATION_ID:
        raise ValueError("GHL_LOCATION_ID is required for this operation but is not set")


if not ghl_configured():
    logger.warning(
        "GHL_API_KEY and/or GHL_LOCATION_ID not set. GoHighLevel API calls will fail until both are configured."
    )

# GHL Custom Field IDs (for contact custom fields)
# These are loaded from environment variables. If not set, the field will be skipped.
CUSTOM_FIELD_IDS = {
    "estimated_price": os.getenv("GHL_CF_ESTIMATED_PRICE", "").strip(),
    "price_breakdown": os.getenv("GHL_CF_PRICE_BREAKDOWN", "").strip(),
    "recurring_price": os.getenv("GHL_CF_RECURRING_PRICE", "").strip(),
    "service_type": os.getenv("GHL_CF_SERVICE_TYPE", "").strip(),
    "home_type": os.getenv("GHL_CF_HOME_TYPE", "").strip(),
    "cleaning_frequency": os.getenv("GHL_CF_CLEANING_FREQUENCY", "").strip(),
    "approximate_square_footage": os.getenv("GHL_CF_APPROXIMATE_SQUARE_FOOTAGE", "").strip() or os.getenv("GHL_CF_SQUARE_FOOTAGE", "").strip(),  # Support both names
    "square_footage": os.getenv("GHL_CF_SQUARE_FOOTAGE", "").strip() or os.getenv("GHL_CF_APPROXIMATE_SQUARE_FOOTAGE", "").strip(),  # Alias for square_footage key
    "bedrooms": os.getenv("GHL_CF_BEDROOMS", "").strip(),
    "bathrooms": os.getenv("GHL_CF_BATHROOMS", "").strip(),
    "street_address": os.getenv("GHL_CF_STREET_ADDRESS", "").strip(),
    "access_method": os.getenv("GHL_CF_ACCESS_METHOD", "").strip(),
    "access_notes": os.getenv("GHL_CF_ACCESS_NOTES", "").strip(),
    "extras_add_ons": os.getenv("GHL_CF_EXTRAS_ADD_ONS", "").strip(),
    "addons__frequency": os.getenv("GHL_CF_ADDONS_FREQUENCY", "").strip(),
    "estimate_photos": os.getenv("GHL_CF_QUOTE_ESTIMATE_PHOTOS", "").strip(),
    "preferred_service_date": os.getenv("GHL_CF_PREFERRED_SERVICE_DATE", "").strip(),
    "stripe_customer_id": os.getenv("GHL_STRIPE_CUSTOMER_ID", "").strip(),
}

# Required custom field env vars for /leads/cleaning
REQUIRED_CUSTOM_FIELD_ENV_VARS = {
    "cleaning_frequency": "GHL_CF_CLEANING_FREQUENCY",
    "square_footage": "GHL_CF_SQUARE_FOOTAGE",  # Also accepts GHL_CF_APPROXIMATE_SQUARE_FOOTAGE
}

# Log missing custom field IDs at startup
missing_cf_ids = [key for key, value in CUSTOM_FIELD_IDS.items() if not value]
if missing_cf_ids:
    logger.warning(
        "Missing GHL custom field ID environment variables: %s. "
        "Custom fields for these keys will be skipped. "
        "Set: %s",
        ", ".join(missing_cf_ids),
        ", ".join(f"GHL_CF_{key.upper().replace('__', '_')}" for key in missing_cf_ids)
    )

# GHL API endpoints
LC_BASE_URL = "https://services.leadconnectorhq.com"
CONTACTS_URL = f"{LC_BASE_URL}/contacts/"
CONTACTS_SEARCH_URL = f"{LC_BASE_URL}/contacts/search"
CONVERSATIONS_URL = f"{LC_BASE_URL}/conversations/messages"
JOBS_RECORDS_URL = f"{LC_BASE_URL}/objects/custom_objects.jobs/records"
JOBS_SEARCH_URL = f"{LC_BASE_URL}/objects/custom_objects.jobs/records/search"
OPPORTUNITIES_URL = f"{LC_BASE_URL}/opportunities/"
CUSTOM_FIELDS_URL = f"{LC_BASE_URL}/customFields"

# Dynamic custom field resolution cache
_custom_fields_cache: Optional[Dict[str, str]] = None
_custom_fields_cache_time: float = 0
_custom_fields_cache_lock = threading.Lock()
CUSTOM_FIELDS_CACHE_TTL = 6 * 60 * 60  # 6 hours in seconds

# Mapping from our internal keys to expected GHL fieldKey/names
# This allows us to resolve custom fields dynamically without env vars
INTERNAL_TO_GHL_FIELD_MAPPING = {
    "service_type": ["service_type", "Service Type"],
    "preferred_service_date": ["preferred_service_date", "Preferred Service Date"],
    "home_type": ["home_type", "Home Type"],
    "cleaning_frequency": ["cleaning_frequency", "Cleaning Frequency"],
    "extras_add_ons": ["extras_add_ons", "Extras Add Ons", "Add Ons"],
    "addons__frequency": ["addons_frequency", "Addons Frequency", "Add-ons Frequency"],
    "approximate_square_footage": ["approximate_square_footage", "Approximate Square Footage", "Square Footage"],
    "street_address": ["street_address", "Street Address"],
    "estimate_photos": ["quote_estimate_photos", "Quote Estimate Photos", "Estimate Photos"],
}

# GHL API version header
GHL_API_VERSION = "2021-07-28"

# Contractor filtering tags
CONTRACTOR_TAG_CLEANING = "contractor_cleaning"
CONTRACTOR_TAG_PENDING = "job-pending-assignment"

# Job status values (used in GHL Jobs custom object)
JOB_STATUS_ASSIGNED = "contractor_assigned"

# Service type defaults
SERVICE_TYPE_STANDARD = "Standard Home Cleaning"
SERVICE_TYPE_DEEP = "Deep Cleaning"

# Photo upload limits
MAX_PHOTOS = 4
MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5MB per photo
MAX_TOTAL_PHOTO_BYTES = 20 * 1024 * 1024  # 20MB total

# In-memory job store: { job_id (appointmentId): job_summary_dict }
# Note: In production, consider using Redis or a database for persistence
JOB_STORE: Dict[str, Dict[str, Any]] = {}

# In-memory offer code store: { code (5-digit string): offer_dict }
# offer_dict contains: opportunity_id, job_id, customer_contact_id, expires_at, sent_to_contractor_ids
# Note: In production, consider using Redis or a database for persistence
OFFER_STORE: Dict[str, Dict[str, Any]] = {}

# GHL Booking URL for cleaning appointments (deprecated - no longer used)
# The booking flow now uses direct GHL widget embeds
# GHL_BOOKING_URL_CLEANING = os.getenv("GHL_BOOKING_URL_CLEANING", "").strip()

# Stripe settings
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
GHL_WORKFLOW_SECRET = os.getenv("GHL_WORKFLOW_SECRET", "").strip()

# Dedicated credential for the payment executor (POST /admin/payments/run),
# called only by the authenticated Next.js proxy.
#
# Deliberately NOT reusing GHL_WORKFLOW_SECRET: that secret is shared with an
# external automation platform, and a card-charging executor must not be
# reachable with a credential that leaves our infrastructure.
#
# Server-only. Never exposed to the browser (no NEXT_PUBLIC_ prefix anywhere).
PAYMENT_EXECUTOR_SECRET = os.getenv("PAYMENT_EXECUTOR_SECRET", "").strip()


def payment_executor_configured() -> bool:
    """True when the payment executor can authenticate. When false it fails closed."""
    return bool(PAYMENT_EXECUTOR_SECRET)


def ghl_workflow_configured() -> bool:
    """True when GHL workflow webhook secret is set (POST /stripe/charge can authenticate)."""
    return bool(GHL_WORKFLOW_SECRET)


def require_ghl_workflow_secret() -> None:
    """Raise if workflow charge / GHL automation secret is missing. Call at runtime, not import time."""
    if not GHL_WORKFLOW_SECRET:
        raise ValueError("GHL_WORKFLOW_SECRET is required for this operation but is not set")


# Fail fast if required Stripe env vars are missing
if not STRIPE_SECRET_KEY:
    raise ValueError("STRIPE_SECRET_KEY environment variable is required but not set")
if not STRIPE_WEBHOOK_SECRET:
    raise ValueError("STRIPE_WEBHOOK_SECRET environment variable is required but not set")

if not ghl_workflow_configured():
    logger.warning(
        "GHL_WORKFLOW_SECRET not set. POST /stripe/charge will return 503 until configured."
    )

# GHL Opportunity Stage IDs
GHL_STAGE_ID_PAYMENT_SUCCEEDED = os.getenv("GHL_STAGE_ID_PAYMENT_SUCCEEDED", "").strip()
GHL_STAGE_ID_ASSIGNED = os.getenv("GHL_STAGE_ID_ASSIGNED", "fe23b7dc-9557-4f8a-841c-829b14b0b711").strip()

# GHL Jobs Custom Object Field Keys
JOBS_OFFER_CODE_FIELD_KEY = os.getenv("JOBS_OFFER_CODE_FIELD_KEY", "offer_code").strip()
JOBS_OFFER_EXPIRES_AT_FIELD_KEY = os.getenv("JOBS_OFFER_EXPIRES_AT_FIELD_KEY", "offer_expires_at").strip()
JOBS_OPPORTUNITY_ID_FIELD_KEY = os.getenv("JOBS_OPPORTUNITY_ID_FIELD_KEY", "opportunity_id").strip()

# GHL Opportunity Custom Field IDs
OPP_ASSIGNED_CONTRACTOR_FIELD_ID = os.getenv("OPP_ASSIGNED_CONTRACTOR_FIELD_ID", "").strip()
OPP_CONTRACTOR_PAY_AMOUNT = os.getenv("OPP_CONTRACTOR_PAY_AMOUNT", "").strip()
OPP_RECURRING_CONTRACTOR_PAY_AMOUNT = os.getenv("OPP_RECURRING_CONTRACTOR_PAY_AMOUNT", "").strip()

# GHL Jobs Custom Object Field Keys (for contractor pay)
JOBS_CONTRACTOR_PAY_AMOUNT_FIELD_KEY = os.getenv("JOBS_CONTRACTOR_PAY_AMOUNT_FIELD_KEY", "contractor_pay_amount").strip()
JOBS_RECURRING_CONTRACTOR_PAY_AMOUNT_FIELD_KEY = os.getenv("JOBS_RECURRING_CONTRACTOR_PAY_AMOUNT_FIELD_KEY", "recurring_contractor_pay_amount").strip()

# Supabase settings (for system of record)
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

# Supabase is optional for now (graceful degradation if not configured)
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    logger.warning(
        "SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY not set. "
        "Supabase writes will be skipped. Set these env vars to enable Supabase-first writes."
    )

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

# Internal cron token for POST /internal/messages/process
INTERNAL_CRON_TOKEN = os.getenv("INTERNAL_CRON_TOKEN")

