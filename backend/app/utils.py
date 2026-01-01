"""
Utility functions and helpers.
"""
import re
import logging
import os
import urllib.parse
from typing import Optional

from .settings import GHL_API_KEY, GHL_API_VERSION, GHL_BOOKING_URL_CLEANING

logger = logging.getLogger("alloy-dispatcher")


def _ghl_headers() -> dict[str, str]:
    """Build standard headers for GHL API requests."""
    return {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Version": GHL_API_VERSION,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def normalize_phone(phone: str) -> str:
    """
    Normalize phone number to E.164 format.
    
    Args:
        phone: Phone number (may include spaces, dashes, parentheses, etc.)
    
    Returns:
        Normalized phone in E.164 format (e.g., +16022904816)
        - If 10 digits, assumes US and prefixes +1
        - If already starts with +, keeps it
        - Strips all non-digit characters except leading +
    """
    if not phone:
        return ""
    
    phone_trimmed = phone.strip()
    digits = re.sub(r"\D", "", phone_trimmed)
    
    if not digits:
        return phone_trimmed
    
    # If already starts with +, preserve it
    if phone_trimmed.startswith("+"):
        # Extract digits after +
        if len(digits) >= 10:
            return "+" + digits
        return phone_trimmed
    
    # If 10 digits, assume US and prefix +1
    if len(digits) == 10:
        return "+1" + digits
    
    # Otherwise, prefix with +
    return "+" + digits


def get_cf_id(env_name: str) -> Optional[str]:
    """
    Get custom field ID from environment variable.
    
    Args:
        env_name: Environment variable name (e.g., "GHL_CF_ESTIMATED_PRICE")
    
    Returns:
        Custom field ID string if set, None otherwise
    """
    value = os.getenv(env_name, "").strip()
    return value if value else None


def normalize_square_footage_option(raw: Optional[str]) -> Optional[str]:
    """
    Normalize square footage option to match GHL dropdown values exactly.
    
    Allowed values (must match exactly):
    - Under 1500 sq ft
    - 1,501–2,000 sq ft
    - 2,001–2,600 sq ft
    - 2,601–3,200 sq ft
    - 3,201–4,000 sq ft
    - 4,001–5,500 sq ft
    - Over 5,500 sq ft
    
    Args:
        raw: Raw square footage string from form
    
    Returns:
        Normalized string if valid, None otherwise
    """
    if not raw:
        return None
    
    # Strip whitespace
    normalized = raw.strip()
    if not normalized:
        return None
    
    # Replace various dash types with en-dash –
    # Handle: - (hyphen), — (em-dash), – (en-dash)
    normalized = normalized.replace("—", "–")  # em-dash to en-dash
    normalized = normalized.replace("-", "–")   # hyphen to en-dash
    
    # Preserve commas and "sq ft" suffix (already present in allowed values)
    # No guessing ranges - must match exactly
    
    # Validate against allowed values
    ALLOWED_SQFT_VALUES = [
        "Under 1500 sq ft",
        "1,501–2,000 sq ft",
        "2,001–2,600 sq ft",
        "2,601–3,200 sq ft",
        "3,201–4,000 sq ft",
        "4,001–5,500 sq ft",
        "Over 5,500 sq ft",
    ]
    
    if normalized in ALLOWED_SQFT_VALUES:
        return normalized
    
    # Not a valid value
    return None


def build_booking_url(
    first_name: str,
    last_name: str,
    email: str,
    phone: str,
    contact_id: str,
) -> Optional[str]:
    """
    Build GHL booking URL with prefill parameters.
    
    Args:
        first_name: Contact first name
        last_name: Contact last name
        email: Contact email
        phone: Contact phone (E.164 format)
        contact_id: GHL contact ID
    
    Returns:
        Booking URL with prefill params, or None if GHL_BOOKING_URL_CLEANING not configured
    """
    if not GHL_BOOKING_URL_CLEANING:
        logger.warning("build_booking_url: GHL_BOOKING_URL_CLEANING not configured")
        return None
    
    # Build query params for prefill
    params = {
        "first_name": first_name,
        "last_name": last_name,
        "email": email,
        "phone": phone,
        "lead_contact_id": contact_id,
        "lead_phone": phone,
    }
    
    # Encode params
    query_string = urllib.parse.urlencode(params)
    booking_url = f"{GHL_BOOKING_URL_CLEANING}?{query_string}"
    
    logger.info(
        "build_booking_url: built booking_url for contact_id=%s phone=%s",
        contact_id,
        phone[:4] + "***" if len(phone) > 4 else "***"
    )
    
    return booking_url
