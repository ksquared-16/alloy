"""
PostgREST access for the backend's Communications capabilities.

── WHY THIS FILE IS NOW SMALL (Payments V1 · W6-A2) ──────────────────────────────────────────────

It held 44 functions and 2,668 lines, and 41 of them existed for one endpoint: the development-era
payment executor `POST /admin/payments/run`. That endpoint inserted a Payment row BEFORE provider
execution, resolved a legacy `payment_statuses` row, worked at job/customer grain, and confirmed a
Stripe PaymentIntent outside any canonical collection attempt — a second money writer beside the
one W1–W3 built.

`backend/main.py` recorded that it was "called only by the authenticated Next.js proxy", and W6-A1
deleted that proxy. So the executor had no caller at all, and with it went the closure it existed
for: the Stripe customer linking, the job/opportunity/contact upserts left over from the retired
GoHighLevel product, the legacy payment status lookups, and the job payment-allocation machinery.

Canonical Payments owns every one of those capabilities now: a registered action, then a collection
attempt, then the provider adapter, then canonical posting, then the Payment, then the allocation.

WHAT REMAINS is what the Communications and inbound-SMS paths actually import — measured, not
guessed: thirteen call sites reach `_get_base_url` and `_get_headers`, and five reach
`normalize_phone`. Nothing else in the backend referenced anything else in this module.

Note that `stripe` is no longer imported here at all. The backend does not touch Stripe: the
canonical webhook is `web/app/api/stripe/webhook/route.ts`.
"""
import re
from typing import Dict, Optional

from .settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


def _get_base_url() -> str:
    """Get PostgREST base URL from SUPABASE_URL."""
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL is not configured")
    base_url = SUPABASE_URL.rstrip("/")
    return f"{base_url}/rest/v1"


def _get_headers() -> Dict[str, str]:
    """Get PostgREST request headers with service role key."""
    if not SUPABASE_SERVICE_ROLE_KEY:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY is not configured")
    return {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    """
    Normalize phone number to E.164 format.

    Args:
        phone: Phone number (may include spaces, dashes, parentheses, etc.)

    Returns:
        Normalized phone in E.164 format (e.g., +16022904816) or None if empty/invalid
        - If 10 digits, assumes US and prefixes +1
        - If 11 digits starting with 1, prefixes +
        - Preserves leading + if provided
        - Strips all non-digit characters except leading +
    """
    if not phone:
        return None

    phone_trimmed = phone.strip()
    if not phone_trimmed:
        return None

    # Extract digits
    digits = re.sub(r"\D", "", phone_trimmed)

    if not digits:
        return phone_trimmed  # Return original if no digits found

    # If already starts with +, preserve it
    if phone_trimmed.startswith("+"):
        return "+" + digits

    # If 10 digits, assume US and prefix +1
    if len(digits) == 10:
        return "+1" + digits

    # If 11 digits starting with 1, prefix +
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits

    # Otherwise, prefix with +
    return "+" + digits
