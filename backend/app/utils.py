"""
Utility functions and helpers.
"""
import re
import logging
import os
import urllib.parse
from typing import Optional

from .settings import GHL_API_KEY, GHL_API_VERSION, require_ghl_config

logger = logging.getLogger("alloy-dispatcher")


def _ghl_headers() -> dict[str, str]:
    """Build standard headers for GHL API requests."""
    require_ghl_config()
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
        raw: Raw square footage string from form (may include variations like
             "1501-2000", "Under 1500", "1,501-2,000 sq ft", etc.)
    
    Returns:
        Normalized string matching exact GHL picklist option, None if cannot map confidently
    """
    if not raw:
        return None
    
    # Strip whitespace and normalize case
    normalized = raw.strip()
    if not normalized:
        return None
    
    # Exact match first (fast path)
    ALLOWED_SQFT_VALUES = [
        "Under 1500 sq ft",
        "1,501–2,000 sq ft",
        "2,001–2,600 sq ft",
        "2,601–3,200 sq ft",
        "3,201–4,000 sq ft",
        "4,001–5,500 sq ft",
        "Over 5,500 sq ft",
    ]
    
    # Replace various dash types with en-dash –
    normalized_dash = normalized.replace("—", "–")  # em-dash to en-dash
    normalized_dash = normalized_dash.replace("-", "–")   # hyphen to en-dash
    
    if normalized_dash in ALLOWED_SQFT_VALUES:
        return normalized_dash
    
    # Try to map variations to exact values
    # Extract numbers and patterns
    lower = normalized.lower()
    
    # Handle "Under 1500" variations
    if "under" in lower and ("1500" in normalized or "1500" in normalized.replace(",", "")):
        return "Under 1500 sq ft"
    
    # Handle "Over 5,500" or "Over 5500" variations
    if "over" in lower and ("5500" in normalized.replace(",", "") or "5,500" in normalized):
        return "Over 5,500 sq ft"
    
    # Extract numeric ranges (handle with/without commas, with/without "sq ft")
    # Pattern: number-number or number,number-number,number
    digits_only = re.sub(r"\D", "", normalized)
    
    # Try to match ranges
    if len(digits_only) >= 6:
        # Try to parse as range (e.g., "15012000" -> 1501-2000)
        # Common patterns: 1501-2000, 2001-2600, 2601-3200, 3201-4000, 4001-5500
        try:
            # Try 4-digit start, 4-digit end
            if len(digits_only) == 8:
                start = int(digits_only[:4])
                end = int(digits_only[4:])
                
                # Map to exact ranges
                if start == 1501 and end == 2000:
                    return "1,501–2,000 sq ft"
                elif start == 2001 and end == 2600:
                    return "2,001–2,600 sq ft"
                elif start == 2601 and end == 3200:
                    return "2,601–3,200 sq ft"
                elif start == 3201 and end == 4000:
                    return "3,201–4,000 sq ft"
                elif start == 4001 and end == 5500:
                    return "4,001–5,500 sq ft"
        except ValueError:
            pass
    
    # Try pattern matching with common separators
    # Pattern: "1501-2000", "1,501-2,000", "1501–2000", etc.
    range_pattern = re.search(r"(\d{1,4}[,\d]*)\s*[–-]\s*(\d{1,4}[,\d]*)", normalized_dash)
    if range_pattern:
        start_str = range_pattern.group(1).replace(",", "")
        end_str = range_pattern.group(2).replace(",", "")
        try:
            start = int(start_str)
            end = int(end_str)
            
            if start == 1501 and end == 2000:
                return "1,501–2,000 sq ft"
            elif start == 2001 and end == 2600:
                return "2,001–2,600 sq ft"
            elif start == 2601 and end == 3200:
                return "2,601–3,200 sq ft"
            elif start == 3201 and end == 4000:
                return "3,201–4,000 sq ft"
            elif start == 4001 and end == 5500:
                return "4,001–5,500 sq ft"
        except ValueError:
            pass
    
    # If we can't map confidently, return None (will skip field)
    logger.warning(
        "normalize_square_footage_option: could not map input=%s to exact GHL picklist value",
        raw
    )
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
    
    Note: This function is deprecated. GHL_BOOKING_URL_CLEANING is no longer used.
    The booking flow now uses direct GHL widget embeds.
    
    Args:
        first_name: Contact first name
        last_name: Contact last name
        email: Contact email
        phone: Contact phone (E.164 format)
        contact_id: GHL contact ID
    
    Returns:
        None (deprecated - booking flow uses direct widget embeds)
    """
    # Deprecated: booking URL is no longer used
    logger.debug("build_booking_url: deprecated, returning None")
    return None
