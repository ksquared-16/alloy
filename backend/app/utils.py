"""
Shared helpers.

GoHighLevel retirement: this module was the GHL/LeadConnector utility belt —
API headers, custom-field env lookups, square-footage picklist normalization and
booking-URL construction. All of it went with the legacy cleaning product. Only
`normalize_phone` had a caller outside GHL, so only it remains.
"""
import re


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
