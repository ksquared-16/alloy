"""
GoHighLevel (GHL) API client functions.
All functions that interact with the GHL API are centralized here.
"""
import re
import time
import logging
import requests
from typing import Dict, Any, List, Optional

from .settings import (
    GHL_API_KEY,
    GHL_LOCATION_ID,
    CUSTOM_FIELD_IDS,
    INTERNAL_TO_GHL_FIELD_MAPPING,
    CONTACTS_URL,
    CONTACTS_SEARCH_URL,
    CONVERSATIONS_URL,
    JOBS_RECORDS_URL,
    JOBS_SEARCH_URL,
    OPPORTUNITIES_URL,
    CUSTOM_FIELDS_URL,
    LC_BASE_URL,
    CONTRACTOR_TAG_CLEANING,
    CONTRACTOR_TAG_PENDING,
    JOB_STATUS_ASSIGNED,
    SERVICE_TYPE_STANDARD,
    SERVICE_TYPE_DEEP,
    JOB_STORE,
    _custom_fields_cache,
    _custom_fields_cache_time,
    _custom_fields_cache_lock,
    CUSTOM_FIELDS_CACHE_TTL,
    GHL_STAGE_ID_PAYMENT_SUCCEEDED,
)
from .utils import _ghl_headers, normalize_phone

logger = logging.getLogger("alloy-dispatcher")


def search_contact_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    """
    Search for a contact by phone number using GHL Contacts Search API.
    
    Args:
        phone: Phone number (will be normalized to E.164)
    
    Returns:
        First matching contact dict if found, None otherwise
    """
    phone_normalized = normalize_phone(phone)
    if not phone_normalized:
        logger.warning("search_contact_by_phone: empty phone after normalization")
        return None
    
    contacts = _search_contact_by_phone_via_api(phone_normalized)
    if contacts:
        return contacts[0]
    return None


def _search_contact_by_phone_via_api(phone: str) -> List[Dict[str, Any]]:
    """
    Search for contacts by phone using POST /contacts/search endpoint with filters.

    Args:
        phone: Phone number to search for (will be trimmed and normalized)

    Returns:
        List of contact dicts found, empty list if none found or error occurred.
    """
    if not GHL_LOCATION_ID:
        logger.error("_search_contact_by_phone_via_api: GHL_LOCATION_ID not set")
        return []

    # Trim phone string
    phone_trimmed = phone.strip()
    
    # Normalize to digits only for candidate generation
    digits = re.sub(r"\D", "", phone_trimmed)
    
    if not digits:
        logger.debug("_search_contact_by_phone_via_api: no digits found in phone=%s", phone)
        return []

    # Generate phone candidates in order of preference
    candidates = []
    
    # 1. Prefer "+<digits>" format (e.g., +16022904816)
    if not phone_trimmed.startswith("+"):
        candidates.append("+" + digits)
    else:
        candidates.append(phone_trimmed)
    
    # 2. Try raw digits as fallback
    candidates.append(digits)
    
    # 3. If 10 digits, also try +1<digits>
    if len(digits) == 10:
        candidates.append("+1" + digits)

    # Try each candidate until one matches
    for candidate in candidates:
        # Build request body with locationId in body and filters array
        body = {
            "locationId": GHL_LOCATION_ID.strip(),
            "page": 1,
            "pageLimit": 20,
            "filters": [
                {"field": "phone", "operator": "eq", "value": candidate}
            ],
        }

        try:
            resp = requests.post(
                CONTACTS_SEARCH_URL, headers=_ghl_headers(), json=body, timeout=10
            )
        except Exception as e:
            logger.error("_search_contact_by_phone_via_api: exception for candidate=%s: %s", candidate, e)
            continue

        if not resp.ok:
            logger.debug("_search_contact_by_phone_via_api: search failed for candidate=%s (%s): %s", candidate, resp.status_code, resp.text)
            continue

        try:
            data = resp.json()
        except Exception:
            logger.error("_search_contact_by_phone_via_api: failed to parse JSON response for candidate=%s", candidate)
            continue

        # Extract contacts from response
        contacts = data.get("contacts", [])
        if not contacts and isinstance(data, list):
            contacts = data

        if contacts:
            logger.info("_search_contact_by_phone_via_api: found %d contacts using candidate=%s", len(contacts), candidate)
            return contacts

    logger.debug("_search_contact_by_phone_via_api: no contacts found for phone=%s after trying %d candidates", phone, len(candidates))
    return []


def search_contact_by_email(email: str) -> Optional[Dict[str, Any]]:
    """
    Search for a contact by email using GHL Contacts Search API.
    
    Args:
        email: Email address (will be trimmed and lowercased)
    
    Returns:
        First matching contact dict if found, None otherwise
    """
    if not GHL_LOCATION_ID:
        logger.warning("search_contact_by_email: GHL_LOCATION_ID not set")
        return None
    
    email_trimmed = email.strip().lower()
    if not email_trimmed:
        logger.warning("search_contact_by_email: empty email after normalization")
        return None
    
    # Build request body with locationId in body and filters array
    body = {
        "locationId": GHL_LOCATION_ID.strip(),
        "page": 1,
        "pageLimit": 20,
        "filters": [
            {"field": "email", "operator": "eq", "value": email_trimmed}
        ],
    }
    
    try:
        resp = requests.post(
            CONTACTS_SEARCH_URL, headers=_ghl_headers(), json=body, timeout=10
        )
    except Exception as e:
        logger.error("search_contact_by_email: exception: %s", e)
        return None
    
    if not resp.ok:
        logger.debug("search_contact_by_email: search failed (%s): %s", resp.status_code, resp.text)
        return None
    
    try:
        data = resp.json()
    except Exception:
        logger.error("search_contact_by_email: failed to parse JSON response")
        return None
    
    # Extract contacts from response
    contacts = data.get("contacts", [])
    if not contacts and isinstance(data, list):
        contacts = data
    
    if contacts:
        logger.info("search_contact_by_email: found %d contacts using email=%s", len(contacts), email_trimmed)
        return contacts[0]
    
    logger.debug("search_contact_by_email: no contacts found for email=%s", email_trimmed)
    return None


def fetch_contractors() -> List[Dict[str, Any]]:
    """
    Fetch contacts from GHL contacts API for the location.
    
    Returns all contacts from GHL (no filtering applied here).
    Eligibility filtering is handled in dispatch.py.

    Returns:
        List of contact dicts with keys: id, name, phone, tags, contact_source
    """
    if not GHL_LOCATION_ID:
        logger.error("GHL_LOCATION_ID is not set; cannot fetch contractors.")
        return []

    params = {
        "locationId": GHL_LOCATION_ID,
        "limit": 50,
    }
    
    # Debug logging: endpoint and params
    logger.info("contractor_fetch_debug: calling GHL endpoint=%s locationId=%s params=%s", 
                CONTACTS_URL, GHL_LOCATION_ID, params)
    
    try:
        resp = requests.get(CONTACTS_URL, headers=_ghl_headers(), params=params, timeout=10)
    except Exception as e:
        logger.error("contractor_fetch_debug: GHL contact fetch exception: %s", e)
        return []

    # Debug logging: HTTP status
    logger.info("contractor_fetch_debug: HTTP status_code=%d", resp.status_code)
    
    if not resp.ok:
        logger.error("contractor_fetch_debug: GHL contact fetch failed (%s): %s", resp.status_code, resp.text)
        return []

    data = resp.json()
    contacts = data.get("contacts", [])
    
    # Debug logging: total contacts returned from API
    total_contacts_from_api = len(contacts)
    logger.info("contractor_fetch_debug: total contacts returned from GHL API=%d", total_contacts_from_api)
    
    # Debug logging: first 3 contacts with IDs and tags
    if total_contacts_from_api > 0:
        sample_contacts = contacts[:3]
        for idx, c in enumerate(sample_contacts):
            contact_id = c.get("id", "unknown")
            contact_tags = c.get("tags", [])
            logger.info("contractor_fetch_debug: sample contact[%d] id=%s tags=%s", 
                       idx, contact_id, contact_tags)
    
    # Return all contacts (only basic validation: must have an id)
    contractors: List[Dict[str, Any]] = []
    for c in contacts:
        contact_id = c.get("id")
        if not contact_id:
            continue  # Skip contacts without an ID
        
        contractors.append(
            {
                "id": contact_id,
                "name": c.get("contactName")
                or f"{c.get('firstName', '')} {c.get('lastName', '')}".strip(),
                "phone": c.get("phone"),
                "tags": c.get("tags") or [],
                "contact_source": c.get("source") or "",
            }
        )

    logger.info("contractor_fetch_debug: total contacts returned by fetch_contractors()=%d (from API=%d)", 
                len(contractors), total_contacts_from_api)
    return contractors


def send_conversation_sms(contact_id: str, message: str) -> None:
    """
    Send an SMS via GHL Conversations API.

    Args:
        contact_id: GHL contact ID of the recipient
        message: SMS message text to send

    Note:
        GHL requires the contact to have a phone number on file.
    """
    if not GHL_LOCATION_ID:
        logger.error("GHL_LOCATION_ID is not set; cannot send SMS.")
        return

    payload = {
        "locationId": GHL_LOCATION_ID,
        "contactId": contact_id,
        "type": "SMS",
        "message": message,
    }
    logger.info("Sending SMS via Conversations API: %s", payload)
    try:
        resp = requests.post(CONVERSATIONS_URL, headers=_ghl_headers(), json=payload, timeout=10)
        if resp.status_code == 201:
            logger.info("SMS send OK (201): %s", resp.text)
        else:
            logger.error("SMS send failed (%s): %s", resp.status_code, resp.text)
    except Exception as e:
        logger.error("SMS send exception: %s", e)


def create_or_update_contact_in_ghl(
    name: str,
    email: str,
    phone: str,
    custom_fields: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """
    Create or update a contact in GHL.

    Args:
        name: Full name of the contact
        email: Email address
        phone: Phone number
        custom_fields: Optional dict of custom field values to set

    Returns:
        GHL contact ID if successful, None otherwise
    """
    if not GHL_LOCATION_ID:
        logger.error("GHL_LOCATION_ID is not set; cannot create/update contact.")
        return None

    # Split name into first/last (simple heuristic)
    name_parts = name.strip().split(maxsplit=1)
    first_name = name_parts[0] if name_parts else ""
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    payload = {
        "locationId": GHL_LOCATION_ID,
        "firstName": first_name,
        "lastName": last_name,
        "email": email,
        "phone": phone,
        "source": "Website Lead",
    }

    if custom_fields:
        payload.update(custom_fields)

    try:
        resp = requests.post(CONTACTS_URL, headers=_ghl_headers(), json=payload, timeout=10)
        if resp.ok:
            data = resp.json()
            contact_id = data.get("contact", {}).get("id")
            logger.info("Created/updated contact in GHL: %s", contact_id)
            return contact_id
        else:
            logger.error("Failed to create/update contact in GHL (%s): %s", resp.status_code, resp.text)
            return None
    except Exception as e:
        logger.error("Exception creating/updating contact in GHL: %s", e)
        return None


def get_custom_fields_map(force_refresh: bool = False) -> Dict[str, str]:
    """
    Fetch custom fields from GHL API and build a mapping of fieldKey/name -> id.
    Results are cached in memory with TTL to avoid repeated API calls.
    
    Returns:
        Dict mapping fieldKey (or normalized name) -> custom field id
        Example: {"quote_estimate_photos": "abc123", "Service Type": "def456"}
    """
    global _custom_fields_cache, _custom_fields_cache_time
    
    current_time = time.time()
    
    # Check cache validity
    with _custom_fields_cache_lock:
        if (
            not force_refresh
            and _custom_fields_cache is not None
            and (current_time - _custom_fields_cache_time) < CUSTOM_FIELDS_CACHE_TTL
        ):
            return _custom_fields_cache
    
    if not GHL_LOCATION_ID:
        logger.warning("get_custom_fields_map: GHL_LOCATION_ID not set, cannot fetch custom fields")
        return {}
    
    url = f"{CUSTOM_FIELDS_URL}?locationId={GHL_LOCATION_ID}"
    headers = _ghl_headers()
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if not resp.ok:
            logger.error(
                "get_custom_fields_map: failed to fetch custom fields (%s): %s",
                resp.status_code,
                resp.text[:200]
            )
            # Return empty dict on error, but don't cache it
            return {}
        
        data = resp.json()
        # GHL API may return customFields as a list or nested in a response object
        custom_fields_list = data.get("customFields", [])
        if not custom_fields_list and isinstance(data, list):
            custom_fields_list = data
        elif not custom_fields_list and isinstance(data, dict):
            # Try other possible keys
            custom_fields_list = data.get("fields", []) or data.get("data", [])
        
        if not isinstance(custom_fields_list, list):
            logger.warning("get_custom_fields_map: unexpected response format, customFields is not a list")
            return {}
        
        # Build mapping: fieldKey -> id and name -> id
        mapping: Dict[str, str] = {}
        for field in custom_fields_list:
            field_id = field.get("id")
            if not field_id:
                continue
            
            # Map by fieldKey (if present)
            field_key = field.get("fieldKey")
            if field_key:
                mapping[field_key] = field_id
            
            # Map by name (normalized: lowercase, spaces to underscores)
            field_name = field.get("name")
            if field_name:
                # Store original name
                mapping[field_name] = field_id
                # Also store normalized versions for flexible matching
                normalized = field_name.lower().replace(" ", "_").replace("-", "_")
                mapping[normalized] = field_id
        
        # Cache the result
        with _custom_fields_cache_lock:
            _custom_fields_cache = mapping
            _custom_fields_cache_time = current_time
        
        logger.info(
            "get_custom_fields_map: fetched and cached %d custom fields from GHL API",
            len(mapping)
        )
        return mapping
        
    except Exception as e:
        logger.error("get_custom_fields_map: exception fetching custom fields: %s", e, exc_info=True)
        return {}


def resolve_custom_field_id(internal_key: str) -> Optional[str]:
    """
    Resolve a custom field ID for an internal key.
    
    First tries env var (backward compatible), then tries dynamic lookup via GHL API.
    
    Args:
        internal_key: Our internal field key (e.g., "estimate_photos")
    
    Returns:
        Custom field ID if found, None otherwise
    """
    # First, try env var (backward compatible)
    env_var_id = CUSTOM_FIELD_IDS.get(internal_key)
    if env_var_id:
        return env_var_id
    
    # Get the expected GHL fieldKey/names for this internal key
    expected_keys = INTERNAL_TO_GHL_FIELD_MAPPING.get(internal_key, [])
    if not expected_keys:
        # If no mapping defined, try the internal key itself
        expected_keys = [internal_key]
    
    # Fetch custom fields map from GHL API
    ghl_fields_map = get_custom_fields_map()
    if not ghl_fields_map:
        return None
    
    # Try each expected key/name
    for expected_key in expected_keys:
        # Try exact match first
        field_id = ghl_fields_map.get(expected_key)
        if field_id:
            logger.info(
                "resolved custom field id via api key=%s fieldKey=%s id=%s",
                internal_key,
                expected_key,
                field_id
            )
            return field_id
        
        # Try normalized version (lowercase, spaces/underscores)
        normalized = expected_key.lower().replace(" ", "_").replace("-", "_")
        field_id = ghl_fields_map.get(normalized)
        if field_id:
            logger.info(
                "resolved custom field id via api key=%s fieldKey=%s (normalized) id=%s",
                internal_key,
                normalized,
                field_id
            )
            return field_id
    
    return None


def build_custom_fields_from_env(payload_values: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Build custom fields array from payload values using env var IDs.
    
    Args:
        payload_values: Dict mapping field keys to values
    
    Returns:
        List of custom field dicts in format: [{"id": "...", "value": "..."}]
        Only includes fields where env var ID is configured.
    """
    custom_fields: List[Dict[str, Any]] = []
    included_field_keys = []
    skipped_field_keys = []
    
    for field_key, field_value in payload_values.items():
        if field_value is None or field_value == "":
            continue
        
        # Get field ID from CUSTOM_FIELD_IDS mapping
        field_id = CUSTOM_FIELD_IDS.get(field_key)
        
        if not field_id:
            skipped_field_keys.append(field_key)
            logger.warning(
                "build_custom_fields_from_env: skipping field_key=%s (no env var ID configured)",
                field_key
            )
            continue
        
        # Handle array values (e.g., extras_add_ons) by converting to comma-separated string
        if isinstance(field_value, list):
            field_value = ", ".join(str(v) for v in field_value if v)
        
        custom_fields.append({
            "id": field_id,
            "value": str(field_value)
        })
        included_field_keys.append(field_key)
    
    if included_field_keys:
        logger.info(
            "build_custom_fields_from_env: customFields_included=%s skipped=%s",
            included_field_keys,
            skipped_field_keys if skipped_field_keys else []
        )
    
    return custom_fields


def build_custom_fields_array(field_mapping: Dict[str, str]) -> List[Dict[str, Any]]:
    """
    Build a GHL customFields array from a field mapping dict.
    Uses env var IDs only (no key-based mapping).

    Args:
        field_mapping: Dict mapping field keys (e.g., "service_type") to values (e.g., "Standard Cleaning")

    Returns:
        List of custom field dicts in format: [{"id": "...", "value": "..."}]
        Only includes fields where the custom field ID is configured (non-empty).
    """
    return build_custom_fields_from_env(field_mapping)


def resolve_or_create_contact_canonical(
    first_name: str,
    last_name: str,
    email: str,
    phone: str,
    postal_code: Optional[str] = None,
    custom_field_mapping: Optional[Dict[str, str]] = None,
    estimated_price: Optional[str] = None,
    price_breakdown: Optional[str] = None,
    recurring_price: Optional[str] = None,
) -> tuple[Optional[str], str]:
    """
    Canonical contact resolution: email-first, then phone, then create.
    Handles duplicate contact errors by recovering with existing contact ID.
    
    Args:
        first_name: Contact first name
        last_name: Contact last name
        email: Contact email (required for email-first search)
        phone: Contact phone number (will be normalized to E.164)
        postal_code: Optional postal code
        custom_field_mapping: Optional dict mapping field keys to values for custom fields
        estimated_price: Optional estimated price value
        price_breakdown: Optional price breakdown text
        recurring_price: Optional recurring price value
    
    Returns:
        Tuple of (contact_id, resolution_path) where resolution_path is one of:
        - "email_search": Found by email
        - "phone_search": Found by phone (email search didn't find)
        - "created": Created new contact
        - "duplicate_recovered": Duplicate error recovered, updated existing contact
        Returns (None, "error") on failure
    """
    phone_normalized = normalize_phone(phone)
    email_normalized = email.strip().lower() if email else ""
    
    # Step 1: Search by email first (GHL dedupe is enforced on email)
    contact = None
    contact_id = None
    resolution_path = None
    
    if email_normalized:
        contact = search_contact_by_email(email_normalized)
        if contact:
            contact_id = contact.get("id")
            resolution_path = "email_search"
            logger.info(
                "resolve_or_create_contact_canonical: found by email contact_id=%s email=%s",
                contact_id,
                email_normalized[:10] + "***"
            )
    
    # Step 2: Fallback to phone search if email didn't find
    if not contact and phone_normalized:
        contact = search_contact_by_phone(phone_normalized)
        if contact:
            contact_id = contact.get("id")
            resolution_path = "phone_search"
            logger.info(
                "resolve_or_create_contact_canonical: found by phone contact_id=%s phone=%s",
                contact_id,
                phone_normalized[:4] + "***"
            )
    
    # Step 3: Update existing contact if found
    if contact_id:
        updated_id = update_contact_in_ghl(
            contact_id=contact_id,
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone_normalized,
            postal_code=postal_code,
            custom_field_mapping=custom_field_mapping,
            estimated_price=estimated_price,
            price_breakdown=price_breakdown,
            recurring_price=recurring_price,
        )
        if updated_id:
            logger.info(
                "resolve_or_create_contact_canonical: updated contact_id=%s resolution_path=%s email=%s phone=%s",
                updated_id,
                resolution_path,
                email_normalized[:10] + "***" if email_normalized else "None",
                phone_normalized[:4] + "***" if phone_normalized else "None"
            )
            return (updated_id, resolution_path)
    
    # Step 4: Create new contact if not found
    # Build payload for create attempt
    try:
        # Build payload for create attempt
        payload: Dict[str, Any] = {
            "locationId": GHL_LOCATION_ID,
            "firstName": first_name.strip(),
            "lastName": last_name.strip(),
            "email": email.strip(),
            "phone": phone_normalized,
            "source": "Website Lead - Cleaning Quote",
            "tags": ["lead"],
        }
        if postal_code and postal_code.strip():
            payload["postalCode"] = postal_code.strip()
        
        custom_field_values = dict(custom_field_mapping) if custom_field_mapping else {}
        if estimated_price:
            custom_field_values["estimated_price"] = estimated_price
        if price_breakdown:
            custom_field_values["price_breakdown"] = price_breakdown
        if recurring_price:
            custom_field_values["recurring_price"] = recurring_price
        
        custom_fields = build_custom_fields_from_env(custom_field_values)
        if custom_fields:
            payload["customFields"] = custom_fields
        
        resp = requests.post(CONTACTS_URL, headers=_ghl_headers(), json=payload, timeout=10)
        
        if resp.ok:
            data = resp.json()
            contact_id = data.get("contact", {}).get("id")
            resolution_path = "created"
            logger.info(
                "resolve_or_create_contact_canonical: created contact_id=%s resolution_path=%s email=%s phone=%s",
                contact_id,
                resolution_path,
                email_normalized[:10] + "***" if email_normalized else "None",
                phone_normalized[:4] + "***" if phone_normalized else "None"
            )
            return (contact_id, resolution_path)
        
        # Step 5: Handle duplicate error recovery (400 with contactId in meta)
        if resp.status_code == 400:
            try:
                error_data = resp.json()
                meta = error_data.get("meta", {})
                existing_contact_id = meta.get("contactId")
                
                if existing_contact_id:
                    # Recover by updating the existing contact
                    logger.warning(
                        "resolve_or_create_contact_canonical: duplicate contact error, recovering with contact_id=%s email=%s phone=%s",
                        existing_contact_id,
                        email_normalized[:10] + "***" if email_normalized else "None",
                        phone_normalized[:4] + "***" if phone_normalized else "None"
                    )
                    
                    updated_id = update_contact_in_ghl(
                        contact_id=existing_contact_id,
                        first_name=first_name,
                        last_name=last_name,
                        email=email,
                        phone=phone_normalized,
                        postal_code=postal_code,
                        custom_field_mapping=custom_field_mapping,
                        estimated_price=estimated_price,
                        price_breakdown=price_breakdown,
                        recurring_price=recurring_price,
                    )
                    
                    if updated_id:
                        resolution_path = "duplicate_recovered"
                        logger.info(
                            "resolve_or_create_contact_canonical: duplicate recovered contact_id=%s resolution_path=%s email=%s phone=%s",
                            updated_id,
                            resolution_path,
                            email_normalized[:10] + "***" if email_normalized else "None",
                            phone_normalized[:4] + "***" if phone_normalized else "None"
                        )
                        return (updated_id, resolution_path)
            except Exception:
                pass
        
        logger.error(
            "resolve_or_create_contact_canonical: failed to create contact (%s): %s",
            resp.status_code,
            resp.text[:200]
        )
    except Exception as e:
        logger.error(
            "resolve_or_create_contact_canonical: exception: %s",
            e,
            exc_info=True
        )
    
    return (None, "error")


def create_contact_in_ghl(
    first_name: str,
    last_name: str,
    email: str,
    phone: str,
    postal_code: Optional[str] = None,
    custom_field_mapping: Optional[Dict[str, str]] = None,
    estimated_price: Optional[str] = None,
    price_breakdown: Optional[str] = None,
    recurring_price: Optional[str] = None,
) -> Optional[str]:
    """
    Create a new contact in GHL.

    Args:
        first_name: Contact first name
        last_name: Contact last name
        email: Contact email
        phone: Contact phone number (will be normalized to E.164)
        postal_code: Optional postal code
        custom_field_mapping: Optional dict mapping field keys to values for custom fields
        estimated_price: Optional estimated price value
        price_breakdown: Optional price breakdown text
        recurring_price: Optional recurring price value

    Returns:
        GHL contact ID if successful, None otherwise
    """
    if not GHL_LOCATION_ID:
        logger.error("create_contact_in_ghl: GHL_LOCATION_ID not set")
        return None

    payload: Dict[str, Any] = {
        "locationId": GHL_LOCATION_ID,
        "firstName": first_name.strip(),
        "lastName": last_name.strip(),
        "email": email.strip(),
        "phone": normalize_phone(phone),
        "source": "Website Lead - Cleaning Quote",
        "tags": ["lead"],  # Add lead tag on creation
    }
    
    if postal_code and postal_code.strip():
        payload["postalCode"] = postal_code.strip()
    
    # Build custom fields from mapping and pricing fields
    custom_field_values = dict(custom_field_mapping) if custom_field_mapping else {}
    if estimated_price:
        custom_field_values["estimated_price"] = estimated_price
    if price_breakdown:
        custom_field_values["price_breakdown"] = price_breakdown
    if recurring_price:
        custom_field_values["recurring_price"] = recurring_price
    
    custom_fields = build_custom_fields_from_env(custom_field_values)
    if custom_fields:
        payload["customFields"] = custom_fields
    
    # Log payload before sending (excluding sensitive data)
    # Extract CF IDs for key fields
    estimated_price_cf_id = None
    cleaning_frequency_cf_id = None
    square_footage_cf_id = None
    
    for cf in custom_fields:
        cf_id = str(cf.get("id", ""))
        # Match by checking if the field value exists in custom_field_values
        if custom_field_values.get("estimated_price"):
            # Find estimated_price CF by checking if we have the value
            if any("estimated_price" in str(cf.get("id", "")).lower() for _ in [1]):
                estimated_price_cf_id = cf_id if not estimated_price_cf_id else estimated_price_cf_id
        if custom_field_values.get("cleaning_frequency"):
            if any("cleaning_frequency" in str(cf.get("id", "")).lower() for _ in [1]):
                cleaning_frequency_cf_id = cf_id if not cleaning_frequency_cf_id else cleaning_frequency_cf_id
        if custom_field_values.get("square_footage") or custom_field_values.get("approximate_square_footage"):
            if any("square" in str(cf.get("id", "")).lower() or "sqft" in str(cf.get("id", "")).lower() for _ in [1]):
                square_footage_cf_id = cf_id if not square_footage_cf_id else square_footage_cf_id
    
    # Build list of included field keys for logging
    included_keys = list(custom_field_values.keys())
    
    logger.info(
        "contact_upsert_payload: core={firstName=%s, lastName=%s, email=%s, phone=%s, postalCode=%s} customFields_count=%d estimated_price_cf_id=%s cleaning_frequency_cf_id=%s square_footage_cf_id=%s customFields_included=%s",
        first_name[:10] + "..." if len(first_name) > 10 else first_name,
        last_name[:10] + "..." if len(last_name) > 10 else last_name,
        email[:20] + "..." if len(email) > 20 else email,
        phone[:4] + "***" if len(phone) > 4 else phone,
        postal_code or "None",
        len(custom_fields),
        estimated_price_cf_id[:8] + "..." if estimated_price_cf_id and len(str(estimated_price_cf_id)) > 8 else (estimated_price_cf_id or "None"),
        cleaning_frequency_cf_id[:8] + "..." if cleaning_frequency_cf_id and len(str(cleaning_frequency_cf_id)) > 8 else (cleaning_frequency_cf_id or "None"),
        square_footage_cf_id[:8] + "..." if square_footage_cf_id and len(str(square_footage_cf_id)) > 8 else (square_footage_cf_id or "None"),
        included_keys
    )

    try:
        resp = requests.post(CONTACTS_URL, headers=_ghl_headers(), json=payload, timeout=10)
        if resp.ok:
            data = resp.json()
            contact_id = data.get("contact", {}).get("id")
            logger.info("create_contact_in_ghl: created contact_id=%s", contact_id)
            return contact_id
        else:
            logger.error("create_contact_in_ghl: failed (%s): %s", resp.status_code, resp.text)
            return None
    except Exception as e:
        logger.error("create_contact_in_ghl: exception: %s", e, exc_info=True)
        return None


def upsert_contact(
    first_name: str,
    last_name: str,
    email: str,
    phone: str,
    postal_code: Optional[str] = None,
    custom_field_mapping: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Upsert a contact in GHL: search by phone, update if exists, create if not.
    
    Args:
        first_name: Contact first name
        last_name: Contact last name
        email: Contact email
        phone: Contact phone number (will be normalized to E.164)
        postal_code: Optional postal code
        custom_field_mapping: Optional dict mapping field keys to values for custom fields
    
    Returns:
        Dict with keys:
        - "status": "ok" or "error"
        - "action": "updated" or "created" (if status is "ok")
        - "contactId": GHL contact ID (if status is "ok")
        - "phone": Normalized phone number (if status is "ok")
        - "message": Error message (if status is "error")
    """
    phone_normalized = normalize_phone(phone)
    if not phone_normalized:
        return {
            "status": "error",
            "message": "Invalid phone number provided",
        }
    
    logger.info("upsert_contact: searching for contact with phone=%s", phone_normalized[:4] + "***" + phone_normalized[-2:])
    
    # Search for existing contact
    existing_contact = search_contact_by_phone(phone_normalized)
    
    if existing_contact:
        contact_id = existing_contact.get("id")
        logger.info("upsert_contact: found existing contact_id=%s, will update", contact_id)
        
        # Update existing contact
        updated_id = update_contact_in_ghl(
            contact_id=contact_id,
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone_normalized,
            postal_code=postal_code,
            custom_field_mapping=custom_field_mapping,
        )
        
        if updated_id:
            logger.info("upsert_contact: successfully updated contact_id=%s", updated_id)
            # Add lead tag to updated contact
            ensure_contact_has_tag(updated_id, "lead")
            return {
                "status": "ok",
                "action": "updated",
                "contactId": updated_id,
                "phone": phone_normalized,
            }
        else:
            logger.error("upsert_contact: failed to update contact_id=%s", contact_id)
            return {
                "status": "error",
                "message": "Failed to update existing contact",
            }
    else:
        logger.info("upsert_contact: no existing contact found, will create")
        
        # Create new contact
        contact_id = create_contact_in_ghl(
            first_name=first_name,
            last_name=last_name,
            email=email,
            phone=phone_normalized,
            postal_code=postal_code,
            custom_field_mapping=custom_field_mapping,
        )
        
        if contact_id:
            logger.info("upsert_contact: successfully created contact_id=%s", contact_id)
            # Tag is already added during creation, but ensure it's there as a safety check
            ensure_contact_has_tag(contact_id, "lead")
            return {
                "status": "ok",
                "action": "created",
                "contactId": contact_id,
                "phone": phone_normalized,
            }
        else:
            logger.error("upsert_contact: failed to create contact")
            return {
                "status": "error",
                "message": "Failed to create new contact",
            }


def strip_update_disallowed_fields(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove fields that are not allowed in PUT /contacts/{id} update requests.
    
    Args:
        payload: Update payload dict
    
    Returns:
        Payload with disallowed fields removed
    """
    cleaned = dict(payload)
    # locationId is not allowed in PUT requests (only in POST create/search)
    cleaned.pop("locationId", None)
    cleaned.pop("location_id", None)
    return cleaned


def get_contact_by_id(contact_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch a contact by ID from GHL.
    
    Args:
        contact_id: GHL contact ID
    
    Returns:
        Contact dict if found, None if not found or error
    """
    if not contact_id:
        logger.warning("get_contact_by_id: invalid contact_id")
        return None
    
    try:
        resp = requests.get(
            f"{CONTACTS_URL}{contact_id}",
            headers=_ghl_headers(),
            params={"locationId": GHL_LOCATION_ID},
            timeout=10
        )
        
        if resp.status_code == 404 or resp.status_code == 400:
            logger.debug("get_contact_by_id: contact_id=%s not found (%s)", contact_id, resp.status_code)
            return None
        
        if not resp.ok:
            logger.error("get_contact_by_id: failed to fetch contact_id=%s (%s): %s", 
                        contact_id, resp.status_code, resp.text)
            return None
        
        data = resp.json()
        contact = data.get("contact", {})
        if contact:
            logger.debug("get_contact_by_id: found contact_id=%s", contact_id)
            return contact
        
        return None
    except Exception as e:
        logger.error("get_contact_by_id: exception for contact_id=%s: %s", contact_id, e, exc_info=True)
        return None


def get_opportunity_by_id(opportunity_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetch an opportunity by ID from GHL.
    
    Args:
        opportunity_id: GHL opportunity ID
    
    Returns:
        Opportunity dict if found, None if not found or error
    """
    if not opportunity_id:
        logger.warning("get_opportunity_by_id: invalid opportunity_id")
        return None
    
    if not GHL_LOCATION_ID:
        logger.error("get_opportunity_by_id: GHL_LOCATION_ID not set")
        return None
    
    try:
        resp = requests.get(
            f"{OPPORTUNITIES_URL}{opportunity_id}",
            headers=_ghl_headers(),
            params={"locationId": GHL_LOCATION_ID},
            timeout=10
        )
        
        if resp.status_code == 404 or resp.status_code == 400:
            logger.debug("get_opportunity_by_id: opportunity_id=%s not found (%s)", opportunity_id, resp.status_code)
            return None
        
        if not resp.ok:
            logger.error("get_opportunity_by_id: failed to fetch opportunity_id=%s (%s): %s", 
                        opportunity_id, resp.status_code, resp.text)
            return None
        
        data = resp.json()
        opportunity = data.get("opportunity", {})
        if opportunity:
            logger.debug("get_opportunity_by_id: found opportunity_id=%s", opportunity_id)
            return opportunity
        
        return None
    except Exception as e:
        logger.error("get_opportunity_by_id: exception for opportunity_id=%s: %s", opportunity_id, e, exc_info=True)
        return None


def update_opportunity_stage(opportunity_id: str, pipeline_stage_id: str) -> bool:
    """
    Update an opportunity's pipeline stage in GHL.
    
    Args:
        opportunity_id: GHL opportunity ID
        pipeline_stage_id: GHL pipeline stage ID to set
    
    Returns:
        True if update was successful, False otherwise
    """
    if not opportunity_id or not pipeline_stage_id:
        logger.warning("update_opportunity_stage: invalid parameters (opportunity_id=%s, pipeline_stage_id=%s)", opportunity_id, pipeline_stage_id)
        return False
    
    if not GHL_LOCATION_ID:
        logger.error("update_opportunity_stage: GHL_LOCATION_ID not set")
        return False
    
    try:
        url = f"{OPPORTUNITIES_URL}{opportunity_id}"
        payload = {
            "pipelineStageId": pipeline_stage_id,
        }
        params = {"locationId": GHL_LOCATION_ID}
        
        resp = requests.put(url, headers=_ghl_headers(), params=params, json=payload, timeout=10)
        
        if resp.ok:
            logger.info("update_opportunity_stage: updated opportunity_id=%s to stage_id=%s", opportunity_id, pipeline_stage_id)
            return True
        else:
            logger.error("update_opportunity_stage: failed (%s) for opportunity_id=%s stage_id=%s: %s", 
                        resp.status_code, opportunity_id, pipeline_stage_id, resp.text[:200])
            return False
    except Exception as e:
        logger.error("update_opportunity_stage: exception for opportunity_id=%s stage_id=%s: %s", 
                    opportunity_id, pipeline_stage_id, e, exc_info=True)
        return False


def add_tag_to_contact(contact_id: str, tag: str) -> bool:
    """
    Add a tag to a contact in GHL.
    
    This is an alias for ensure_contact_has_tag for clarity.
    Does NOT include locationId in PUT payload.
    
    Args:
        contact_id: GHL contact ID
        tag: Tag name to add (e.g., "card_on_file:collected")
    
    Returns:
        True if tag was added or already present, False if update failed
    """
    return ensure_contact_has_tag(contact_id, tag)


def ensure_contact_has_tag(contact_id: str, tag: str) -> bool:
    """
    Ensure a contact has a specific tag, adding it if missing.
    
    Args:
        contact_id: GHL contact ID
        tag: Tag name to ensure (e.g., "lead")
    
    Returns:
        True if tag was added or already present, False if update failed
    """
    if not contact_id or not tag:
        logger.warning("ensure_contact_has_tag: invalid contact_id or tag")
        return False
    
    try:
        # Fetch existing contact to get current tags
        resp = requests.get(
            f"{CONTACTS_URL}{contact_id}",
            headers=_ghl_headers(),
            params={"locationId": GHL_LOCATION_ID},
            timeout=10
        )
        
        if not resp.ok:
            logger.error("ensure_contact_has_tag: failed to fetch contact_id=%s (%s): %s", 
                        contact_id, resp.status_code, resp.text)
            return False
        
        data = resp.json()
        contact = data.get("contact", {})
        current_tags = contact.get("tags", [])
        
        # If tag already present, no action needed
        if tag in current_tags:
            logger.info("ensure_contact_has_tag: contact_id=%s already has tag=%s, skipping", contact_id, tag)
            return True
        
        # Add tag to existing tags (preserve all existing tags)
        updated_tags = list(current_tags) if current_tags else []
        updated_tags.append(tag)
        
        # Update contact with new tags array
        update_payload = {
            "tags": updated_tags
        }
        # Remove any disallowed fields
        update_payload = strip_update_disallowed_fields(update_payload)
        
        update_resp = requests.put(
            f"{CONTACTS_URL}{contact_id}",
            headers=_ghl_headers(),
            json=update_payload,
            timeout=10
        )
        
        if update_resp.ok:
            logger.info("ensure_contact_has_tag: added tag=%s to contact_id=%s", tag, contact_id)
            return True
        else:
            logger.error("ensure_contact_has_tag: failed to update tags for contact_id=%s (%s): %s", 
                        contact_id, update_resp.status_code, update_resp.text)
            return False
            
    except Exception as e:
        logger.error("ensure_contact_has_tag: exception for contact_id=%s: %s", contact_id, e, exc_info=True)
        return False


def upload_photo_to_ghl(file_content: bytes, filename: str, content_type: str = "image/jpeg") -> Optional[str]:
    """
    Upload a photo file to GoHighLevel Media API.
    
    Args:
        file_content: Binary file content
        filename: Original filename
        content_type: MIME type (default: image/jpeg)
    
    Returns:
        fileUrl from GHL response if successful, None otherwise
    """
    if not GHL_LOCATION_ID:
        logger.error("upload_photo_to_ghl: GHL_LOCATION_ID not configured")
        return None
    
    url = f"{LC_BASE_URL}/medias/upload-file"
    headers = {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Version": "2021-07-28",
    }
    
    # GHL Media API expects multipart/form-data with:
    # - file: the file content
    # - locationId: the location ID
    files = {
        "file": (filename, file_content, content_type)
    }
    data = {
        "locationId": GHL_LOCATION_ID
    }
    
    try:
        resp = requests.post(url, headers=headers, files=files, data=data, timeout=30)
        if resp.ok:
            result = resp.json()
            file_url = result.get("fileUrl") or result.get("url")
            if file_url:
                logger.info("upload_photo_to_ghl: uploaded %s, fileUrl=%s", filename, file_url[:50] + "..." if len(file_url) > 50 else file_url)
                return file_url
            else:
                logger.warning("upload_photo_to_ghl: no fileUrl in response: %s", resp.text[:200])
                return None
        else:
            logger.error("upload_photo_to_ghl: failed (%s): %s", resp.status_code, resp.text[:200])
            return None
    except Exception as e:
        logger.error("upload_photo_to_ghl: exception: %s", e)
        return None


def create_contact_note(contact_id: str, title: str, body: str) -> bool:
    """
    Create a note for a contact in GoHighLevel.
    
    Args:
        contact_id: GHL contact ID
        title: Note title (used for logging only, not sent to API)
        body: Note body/content
    
    Returns:
        True if note was created successfully, False otherwise
    """
    if not contact_id or not body:
        logger.warning("create_contact_note: invalid parameters (contact_id=%s)", contact_id)
        return False
    
    if not GHL_LOCATION_ID:
        logger.error("create_contact_note: GHL_LOCATION_ID not configured")
        return False
    
    url = f"{LC_BASE_URL}/contacts/{contact_id}/notes"
    headers = {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Version": "2021-07-28",
        "Content-Type": "application/json",
    }
    
    # GHL API only accepts "body" field for note creation
    payload = {
        "body": body,
    }
    
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=10)
        if resp.ok:
            logger.info("create_contact_note: created note for contact_id=%s, title=%s", contact_id, title)
            return True
        else:
            logger.error("create_contact_note: failed (%s): %s", resp.status_code, resp.text[:200])
            return False
    except Exception as e:
        logger.error("create_contact_note: exception: %s", e)
        return False


def update_contact_in_ghl(
    contact_id: str,
    first_name: Optional[str] = None,
    last_name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    postal_code: Optional[str] = None,
    custom_field_mapping: Optional[Dict[str, str]] = None,
    estimated_price: Optional[str] = None,
    price_breakdown: Optional[str] = None,
    recurring_price: Optional[str] = None,
) -> Optional[str]:
    """
    Update an existing contact in GHL.
    
    Only includes fields in the payload if they are non-empty (does not wipe fields with blanks).
    Does NOT include locationId in the update payload (not allowed in PUT requests).

    Args:
        contact_id: GHL contact ID to update
        first_name: Optional first name to update (only included if non-empty)
        last_name: Optional last name to update (only included if non-empty)
        email: Optional email to update (only included if non-empty)
        phone: Optional phone to update (will be normalized, only included if non-empty)
        postal_code: Optional postal code to update (only included if non-empty)
        custom_field_mapping: Optional dict mapping field keys to values for custom fields
        estimated_price: Optional estimated price value
        price_breakdown: Optional price breakdown text
        recurring_price: Optional recurring price value

    Returns:
        GHL contact ID if successful, None otherwise
    """
    payload: Dict[str, Any] = {}
    
    # Only include non-empty fields (don't wipe existing data)
    if first_name and first_name.strip():
        payload["firstName"] = first_name.strip()
    if last_name and last_name.strip():
        payload["lastName"] = last_name.strip()
    if email and email.strip():
        payload["email"] = email.strip()
    if phone and phone.strip():
        payload["phone"] = normalize_phone(phone)
    if postal_code and postal_code.strip():
        payload["postalCode"] = postal_code.strip()
    
    # Build custom fields from mapping and pricing fields
    custom_field_values = dict(custom_field_mapping) if custom_field_mapping else {}
    if estimated_price:
        custom_field_values["estimated_price"] = estimated_price
    if price_breakdown:
        custom_field_values["price_breakdown"] = price_breakdown
    if recurring_price:
        custom_field_values["recurring_price"] = recurring_price
    
    custom_fields = build_custom_fields_from_env(custom_field_values)
    if custom_fields:
        payload["customFields"] = custom_fields
    
    # Log payload before sending (excluding sensitive data)
    # Extract CF IDs for key fields by matching field keys to custom field IDs
    estimated_price_cf_id = None
    cleaning_frequency_cf_id = None
    square_footage_cf_id = None
    
    # Map field keys to their CF IDs
    field_key_to_cf_id = {}
    for field_key, field_value in custom_field_values.items():
        cf_id = CUSTOM_FIELD_IDS.get(field_key)
        if cf_id:
            field_key_to_cf_id[field_key] = cf_id
    
    # Find CF IDs in the custom_fields array
    for cf in custom_fields:
        cf_id = str(cf.get("id", ""))
        # Match by comparing CF ID to our known IDs
        if field_key_to_cf_id.get("estimated_price") == cf_id:
            estimated_price_cf_id = cf_id
        if field_key_to_cf_id.get("cleaning_frequency") == cf_id:
            cleaning_frequency_cf_id = cf_id
        if field_key_to_cf_id.get("square_footage") == cf_id or field_key_to_cf_id.get("approximate_square_footage") == cf_id:
            square_footage_cf_id = cf_id
    
    # Build list of included field keys for logging
    included_keys = list(custom_field_values.keys())
    
    logger.info(
        "contact_upsert_payload: core={contact_id=%s, firstName=%s, lastName=%s, email=%s, phone=%s, postalCode=%s} customFields_count=%d estimated_price_cf_id=%s cleaning_frequency_cf_id=%s square_footage_cf_id=%s customFields_included=%s",
        contact_id[:8] + "..." if len(contact_id) > 8 else contact_id,
        first_name[:10] + "..." if first_name and len(first_name) > 10 else (first_name or "None"),
        last_name[:10] + "..." if last_name and len(last_name) > 10 else (last_name or "None"),
        email[:20] + "..." if email and len(email) > 20 else (email or "None"),
        phone[:4] + "***" if phone and len(phone) > 4 else (phone or "None"),
        postal_code or "None",
        len(custom_fields),
        estimated_price_cf_id[:8] + "..." if estimated_price_cf_id and len(str(estimated_price_cf_id)) > 8 else (estimated_price_cf_id or "None"),
        cleaning_frequency_cf_id[:8] + "..." if cleaning_frequency_cf_id and len(str(cleaning_frequency_cf_id)) > 8 else (cleaning_frequency_cf_id or "None"),
        square_footage_cf_id[:8] + "..." if square_footage_cf_id and len(str(square_footage_cf_id)) > 8 else (square_footage_cf_id or "None"),
        included_keys
    )
    
    # Remove any disallowed fields (e.g., locationId)
    payload = strip_update_disallowed_fields(payload)
    
    # If payload is empty after stripping, nothing to update
    if not payload:
        logger.warning("update_contact_in_ghl: no fields to update for contact_id=%s", contact_id)
        return contact_id  # Return existing ID if nothing to update

    try:
        resp = requests.put(
            f"{CONTACTS_URL}{contact_id}",
            headers=_ghl_headers(),
            json=payload,
            timeout=10
        )
        if resp.ok:
            data = resp.json()
            updated_contact_id = data.get("contact", {}).get("id") or contact_id
            logger.info("update_contact_in_ghl: updated contact_id=%s", updated_contact_id)
            return updated_contact_id
        else:
            logger.error("update_contact_in_ghl: failed (%s): %s", resp.status_code, resp.text)
            return None
    except Exception as e:
        logger.error("update_contact_in_ghl: exception: %s", e, exc_info=True)
        return None


def update_contact_custom_field(contact_id: str, field_key: str, field_value: str) -> bool:
    """
    Update a single custom field for a GHL contact.
    
    Args:
        contact_id: GHL contact ID
        field_key: Internal field key (e.g., "stripe_customer_id")
        field_value: Value to set
    
    Returns:
        True if update was successful, False otherwise
    """
    if not contact_id or not field_key or not field_value:
        logger.warning("update_contact_custom_field: invalid parameters")
        return False
    
    cf_id = CUSTOM_FIELD_IDS.get(field_key)
    if not cf_id:
        logger.warning("update_contact_custom_field: no custom field ID for key=%s", field_key)
        return False
    
    # Build custom fields array with single field
    custom_fields = [{"id": cf_id, "value": field_value}]
    
    payload = {
        "customFields": custom_fields
    }
    
    # Remove any disallowed fields
    payload = strip_update_disallowed_fields(payload)
    
    try:
        resp = requests.put(
            f"{CONTACTS_URL}{contact_id}",
            headers=_ghl_headers(),
            json=payload,
            timeout=10
        )
        if resp.ok:
            logger.info("update_contact_custom_field: updated contact_id=%s field_key=%s", contact_id, field_key)
            return True
        else:
            logger.error("update_contact_custom_field: failed (%s): %s", resp.status_code, resp.text)
            return False
    except Exception as e:
        logger.error("update_contact_custom_field: exception: %s", e, exc_info=True)
        return False


def build_job_summary(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build a normalized job summary dict from the GHL appointment / calendar payload.

    Args:
        payload: Raw webhook payload from GHL appointment booking

    Returns:
        Dict with keys: job_id, customer_name, contact_id, service_type, estimated_price,
        start_time, start_time_iso, end_time, access_method, access_notes, postal_code,
        full_address, price_breakdown

    Price parsing logic:
        - Primary source: "Estimated Price (Contact)" field (numeric)
        - Fallback: Parse from "Price Breakdown (Contact)" text (looks for "Total: $XXX")

    Service type detection:
        - Default: "Standard Home Cleaning"
        - If "Deep" appears in price breakdown: "Deep Cleaning"
    """
    calendar = payload.get("calendar") or {}
    contact_id = payload.get("contact_id")
    full_name = payload.get("full_name") or (
        (payload.get("first_name") or "") + " " + (payload.get("last_name") or "")
    ).strip()

    # Try to get fields from custom_objects.jobs first, then fall back to top-level payload
    custom_objects = payload.get("custom_objects", {})
    jobs_obj = custom_objects.get("jobs", {}) if isinstance(custom_objects, dict) else {}
    
    # Customer name - prefer custom_objects.jobs.customer_name
    customer_name = (
        jobs_obj.get("customer_name")
        or payload.get("customer_name")
        or full_name
        or "Unknown"
    ).strip() if isinstance(jobs_obj.get("customer_name") or payload.get("customer_name") or full_name, str) else (full_name or "Unknown")

    price_breakdown = (
        jobs_obj.get("price_breakdown")
        or payload.get("Price Breakdown (Contact)")
        or payload.get("price_breakdown")
        or ""
    )

    # 1) Try direct numeric value from "Estimated Price (Contact)"
    estimated_price = 0.0
    est_raw = (
        jobs_obj.get("estimated_price")
        or payload.get("Estimated Price (Contact)")
        or payload.get("Estimated Price")
        or payload.get("estimated_price")
    )
    if est_raw:
        try:
            est_str = str(est_raw).replace("$", "").replace(",", "").strip()
            estimated_price = float(est_str)
        except Exception as e:
            logger.warning("Failed to parse estimated_price='%s': %s", est_raw, e)

    # 2) Fallback: parse from breakdown text if still zero
    if estimated_price <= 0 and price_breakdown:
        for line in price_breakdown.splitlines():
            if "Total" in line:
                try:
                    part = line.split(":", 1)[-1].strip().replace("$", "")
                    estimated_price = float(part)
                    break
                except Exception:
                    pass

    # Service type - prefer custom_objects.jobs.service_type
    service_type = (
        jobs_obj.get("service_type")
        or payload.get("service_type")
        or SERVICE_TYPE_STANDARD
    )
    if "Deep" in price_breakdown or "Deep" in str(service_type):
        service_type = SERVICE_TYPE_DEEP

    # Start time - prefer custom_objects.jobs.start_time_iso, then calendar.startTime
    start_time_iso = (
        jobs_obj.get("start_time_iso")
        or calendar.get("startTime")
        or payload.get("start_time_iso")
        or ""
    )
    start_time = (
        calendar.get("startTime")
        or jobs_obj.get("start_time")
        or payload.get("start_time")
        or "TBD"
    )

    # Full address - prefer custom_objects.jobs.full_address
    full_address = (
        jobs_obj.get("full_address")
        or payload.get("full_address")
        or payload.get("address")
        or ""
    )

    # Postal code - prefer custom_objects.jobs.postal_code
    postal_code = (
        jobs_obj.get("postal_code")
        or payload.get("postal_code")
        or payload.get("postalCode")
        or payload.get("zip")
        or ""
    )

    # Home access fields – try custom_objects.jobs first, then multiple possible label variants
    access_method = (
        jobs_obj.get("how_will_your_cleaner_get_into_your_home")
        or jobs_obj.get("access_method")
        or payload.get("How Will Your Cleaner Get Into Your Home")
        or payload.get("How will your cleaner get into your home")
        or payload.get("How Will Your Cleaner Get Into Your Home?")
        or payload.get("How will your cleaner get into your home?")
        or payload.get("access_method")
        or "Not specified"
    )

    access_notes = (
        jobs_obj.get("access_notes_for_your_cleaner")
        or jobs_obj.get("access_notes")
        or payload.get("Access Notes For Your Cleaner")
        or payload.get("Access notes for your cleaner")
        or payload.get("Access notes for your cleaner?")
        or payload.get("access_notes")
        or ""
    )

    job_summary = {
        "job_id": calendar.get("appointmentId") or payload.get("appointmentId"),
        "customer_name": customer_name,
        "contact_id": contact_id,
        "service_type": service_type,
        "estimated_price": estimated_price,
        "start_time": start_time,
        "start_time_iso": start_time_iso,
        "end_time": calendar.get("endTime") or payload.get("endTime") or "",
        "access_method": access_method,
        "access_notes": access_notes,
        "postal_code": postal_code,
        "full_address": full_address,
        "price_breakdown": price_breakdown,
    }
    
    # Debug log: show which required keys are present
    required_keys = ["job_id", "customer_name", "contact_id", "service_type", "start_time", 
                     "full_address", "postal_code", "estimated_price", "price_breakdown", 
                     "access_method", "access_notes"]
    present_keys = [key for key in required_keys if job_summary.get(key) and job_summary.get(key) != ""]
    logger.info("build_job_summary: present keys=%s, missing keys=%s", 
               present_keys, [k for k in required_keys if k not in present_keys])
    
    return job_summary


def find_job_record_id(external_job_id: str) -> Optional[str]:
    """
    Lookup the Jobs custom object record id using external_job_id.

    Args:
        external_job_id: The appointment ID (used as external_job_id in GHL)

    Returns:
        GHL Jobs custom object record ID if found, None otherwise

    Uses POST /objects/custom_objects.jobs/records/search to find the record.
    """
    if not external_job_id:
        return None
    if not GHL_LOCATION_ID:
        logger.error("find_job_record_id: GHL_LOCATION_ID not set")
        return None

    body = {
        "locationId": GHL_LOCATION_ID,
        "page": 1,
        "pageLimit": 1,
        "filters": [
            {
                "group": "AND",
                "filters": [
                    {
                        "group": "AND",
                        "filters": [
                            {
                                "field": "properties.external_job_id",
                                "operator": "eq",
                                "value": external_job_id,
                            }
                        ],
                    }
                ],
            }
        ],
    }

    try:
        logger.info("Searching job record id for external_job_id=%s", external_job_id)
        resp = requests.post(
            JOBS_SEARCH_URL, headers=_ghl_headers(), json=body, timeout=10
        )
    except Exception as e:
        logger.error("find_job_record_id: exception: %s", e)
        return None

    if not resp.ok:
        logger.error(
            "find_job_record_id: search failed (%s): %s",
            resp.status_code,
            resp.text,
        )
        return None

    data = resp.json()
    records = data.get("records") or data.get("customObjectRecords") or []
    if not records:
        logger.error(
            "find_job_record_id: no records found for external_job_id=%s",
            external_job_id,
        )
        return None

    record_id = records[0].get("id")
    logger.info(
        "find_job_record_id: found record_id=%s for external_job_id=%s",
        record_id,
        external_job_id,
    )
    return record_id


def find_contact_by_phone(phone: str) -> Optional[str]:
    """
    Find a GHL contact by phone number, trying multiple format variations.

    Args:
        phone: Phone number (may include +, spaces, dashes, parentheses, etc.)

    Returns:
        GHL contact ID if found, None otherwise.
        If multiple contacts found, returns the most recently updated one.

    Process:
        1. Calls _search_contact_by_phone_via_api which handles candidate generation
        2. Returns the most recently updated contact when found
    """
    if not GHL_LOCATION_ID:
        logger.error("find_contact_by_phone: GHL_LOCATION_ID not set")
        return None

    # _search_contact_by_phone_via_api handles candidate generation internally
    contacts = _search_contact_by_phone_via_api(phone)

    if contacts:
        # If multiple, pick the most recently updated
        if len(contacts) > 1:
            contacts.sort(key=lambda c: c.get("updatedAt", ""), reverse=True)
            logger.info("find_contact_by_phone: found %d contacts, using most recent", len(contacts))

        contact_id = contacts[0].get("id")
        logger.info("find_contact_by_phone: found contact_id=%s for phone=%s", contact_id, phone)
        return contact_id

    logger.info("find_contact_by_phone: no contacts found for phone=%s", phone)
    return None


def find_contact_record_by_phone(phone: str) -> Optional[Dict[str, Any]]:
    """
    Find a GHL contact record by phone number, returning the full contact dict.

    Args:
        phone: Phone number (may include +, spaces, dashes, parentheses, etc.)

    Returns:
        Full contact dict if found, None otherwise.
        If multiple contacts found, returns the most recently updated one.
        The contact dict includes opportunities[] and customFields.
    """
    if not GHL_LOCATION_ID:
        logger.error("find_contact_record_by_phone: GHL_LOCATION_ID not set")
        return None

    # _search_contact_by_phone_via_api returns full contact objects
    contacts = _search_contact_by_phone_via_api(phone)

    if contacts:
        # If multiple, pick the most recently updated
        if len(contacts) > 1:
            contacts.sort(key=lambda c: c.get("updatedAt", ""), reverse=True)
            logger.info("find_contact_record_by_phone: found %d contacts, using most recent", len(contacts))

        contact = contacts[0]
        logger.info("find_contact_record_by_phone: found contact_id=%s for phone=%s", contact.get("id"), phone)
        return contact

    logger.info("find_contact_record_by_phone: no contacts found for phone=%s", phone)
    return None


def find_latest_opportunity_for_contact(contact_id: str) -> Optional[Dict[str, Any]]:
    """
    Find the most recent opportunity for a contact.

    Args:
        contact_id: GHL contact ID

    Returns:
        Opportunity dict with estimated_price and price_breakdown if found, None otherwise.
        Returns the most recent open opportunity, or most recent overall if none open.
    """
    if not GHL_LOCATION_ID:
        logger.error("find_latest_opportunity_for_contact: GHL_LOCATION_ID not set")
        return None

    params = {
        "locationId": GHL_LOCATION_ID,
        "contactId": contact_id,
        "limit": 50,
    }

    try:
        resp = requests.get(OPPORTUNITIES_URL, headers=_ghl_headers(), params=params, timeout=10)
    except Exception as e:
        logger.error("find_latest_opportunity_for_contact: exception: %s", e)
        return None

    if not resp.ok:
        logger.error(
            "find_latest_opportunity_for_contact: search failed (%s): %s",
            resp.status_code,
            resp.text,
        )
        return None

    data = resp.json()
    opportunities = data.get("opportunities", [])

    if not opportunities:
        logger.info("find_latest_opportunity_for_contact: no opportunities found for contact_id=%s", contact_id)
        return None

    # Sort by updatedAt descending (most recent first)
    opportunities.sort(key=lambda o: o.get("updatedAt", ""), reverse=True)

    # Prefer open opportunities, but fall back to most recent overall
    open_opps = [o for o in opportunities if o.get("status") not in ["won", "lost", "abandoned"]]
    if open_opps:
        opportunity = open_opps[0]
    else:
        opportunity = opportunities[0]

    logger.info(
        "find_latest_opportunity_for_contact: found opportunity id=%s for contact_id=%s",
        opportunity.get("id"),
        contact_id,
    )
    return opportunity


def upsert_job_assignment_to_ghl(job_id: str, contractor_id: str, contractor_name: str) -> None:
    """
    Update assignment details into the Jobs custom object in GHL.

    Args:
        job_id: External job ID (appointment ID)
        contractor_id: GHL contact ID of the assigned contractor
        contractor_name: Name of the assigned contractor

    Process:
        1. Find record id via /objects/custom_objects.jobs/records/search using external_job_id
        2. PUT /objects/custom_objects.jobs/records/{id}?locationId=...
           with properties:
             - contractor_assigned_id
             - contractor_assigned_name
             - job_status (set to "contractor_assigned")
             - how_will_your_cleaner_get_into_your_home
             - access_notes_for_your_cleaner
    """
    if not job_id or not contractor_id:
        logger.warning(
            "upsert_job_assignment_to_ghl: missing job_id or contractor_id, skipping. "
            "job_id=%s contractor_id=%s",
            job_id,
            contractor_id,
        )
        return
    if not GHL_LOCATION_ID:
        logger.error("upsert_job_assignment_to_ghl: GHL_LOCATION_ID not set")
        return

    record_id = find_job_record_id(job_id)
    if not record_id:
        logger.error(
            "upsert_job_assignment_to_ghl: could not find job record for external_job_id=%s",
            job_id,
        )
        return

    # Pull the in-memory job to get access info (if available)
    job = JOB_STORE.get(job_id, {})

    payload = {
        "properties": {
            "external_job_id": job_id,
            "contractor_assigned_id": contractor_id,
            "contractor_assigned_name": contractor_name,
            "job_status": JOB_STATUS_ASSIGNED,
            # These keys must match the Unique Key of your Job custom fields in GHL
            "how_will_your_cleaner_get_into_your_home": job.get("access_method", ""),
            "access_notes_for_your_cleaner": job.get("access_notes", ""),
        }
    }
    params = {"locationId": GHL_LOCATION_ID}

    logger.info(
        "Updating Jobs object on assignment via %s/%s with params %s and payload: %s",
        JOBS_RECORDS_URL,
        record_id,
        params,
        payload,
    )

    try:
        resp = requests.put(
            f"{JOBS_RECORDS_URL}/{record_id}",
            headers=_ghl_headers(),
            params=params,
            json=payload,
            timeout=10,
        )
    except Exception as e:
        logger.error("Jobs object assignment upsert exception: %s", e)
        return

    if resp.ok:
        logger.info("Jobs object assignment upsert OK: %s", resp.text)
    else:
        logger.error(
            "Jobs object assignment upsert failed (%s): %s",
            resp.status_code,
            resp.text,
        )

