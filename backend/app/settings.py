"""
Application settings, environment variables, and constants.
"""
import os
import logging
import threading
from typing import Dict, Any, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("alloy-dispatcher")

# Environment variables
GHL_API_KEY = os.getenv("GHL_API_KEY", "").strip()
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID", "").strip()

# Fail fast if required env vars are missing
if not GHL_API_KEY:
    raise ValueError("GHL_API_KEY environment variable is required but not set")
if not GHL_LOCATION_ID:
    raise ValueError("GHL_LOCATION_ID environment variable is required but not set")

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

# Fail fast if required Stripe env vars are missing
if not STRIPE_SECRET_KEY:
    raise ValueError("STRIPE_SECRET_KEY environment variable is required but not set")
if not STRIPE_WEBHOOK_SECRET:
    raise ValueError("STRIPE_WEBHOOK_SECRET environment variable is required but not set")
if not GHL_WORKFLOW_SECRET:
    raise ValueError("GHL_WORKFLOW_SECRET environment variable is required but not set")

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

# GHL Jobs Custom Object Field Keys (for contractor pay)
JOBS_CONTRACTOR_PAY_AMOUNT_FIELD_KEY = os.getenv("JOBS_CONTRACTOR_PAY_AMOUNT_FIELD_KEY", "contractor_pay_amount").strip()

