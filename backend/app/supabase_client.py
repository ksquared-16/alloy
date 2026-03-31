"""
Supabase database client for backend operations.
Uses service role key to bypass RLS.
"""
import logging
import os
import re
from datetime import datetime, timezone
from typing import Dict, Optional, Any, Tuple, List
import requests
from .settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
import stripe

# Initialize Stripe if secret key is available
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

logger = logging.getLogger("alloy-dispatcher")

# PostgREST response / repr size cap for insert_payment diagnostics (full body up to this length).
_PAYMENTS_INSERT_LOG_BODY_MAX = 4000


def _trunc_log_body(text: str, max_len: int = _PAYMENTS_INSERT_LOG_BODY_MAX) -> str:
    if not text:
        return ""
    if len(text) <= max_len:
        return text
    return f"{text[:max_len]}... [truncated, {len(text)} total chars]"


def stripe_error_is_no_such_customer(err: BaseException) -> bool:
    """
    True when Stripe indicates the customer id does not exist in this account/mode
    (e.g. LIVE cus_ copied into staging with TEST keys).
    """
    msg = str(err).lower()
    if "no such customer" in msg:
        return True
    code = getattr(err, "code", None)
    param = getattr(err, "param", None)
    if code == "resource_missing" and param == "customer":
        return True
    return False


def clear_stripe_customer_id_for_supabase_customer(supa_customer_id: str) -> None:
    """Set customers.stripe_customer_id to null for the given Supabase customer UUID."""
    if not supa_customer_id or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return
    base_url = _get_base_url()
    headers = _get_headers()
    clear_url = f"{base_url}/customers?id=eq.{supa_customer_id}"
    try:
        requests.patch(clear_url, headers=headers, json={"stripe_customer_id": None}, timeout=30)
    except Exception as clear_err:
        logger.warning("clear_stripe_customer_id_for_supabase_customer: patch failed: %s", clear_err)


def lookup_supabase_customer_id_by_stripe_customer_id(stripe_customer_id: str) -> Optional[str]:
    """Return public.customers.id for a row with this stripe_customer_id, if any."""
    if not stripe_customer_id or not str(stripe_customer_id).startswith("cus_"):
        return None
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    customers_url = f"{base_url}/customers"
    params = {
        "select": "id",
        "stripe_customer_id": f"eq.{stripe_customer_id}",
        "limit": "1",
    }
    try:
        response = requests.get(customers_url, headers=headers, params=params, timeout=30)
        if response.ok:
            data = response.json()
            if data and len(data) > 0 and isinstance(data[0], dict):
                rid = data[0].get("id")
                return str(rid) if rid else None
    except Exception as e:
        logger.warning("lookup_supabase_customer_id_by_stripe_customer_id: %s", e)
    return None


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


def _effective_public_org_id(explicit: Optional[str] = None) -> Optional[str]:
    """
    Org id for public booking flows (contacts / customers require org_id NOT NULL).
    explicit: optional override (e.g. from API request); else ALLOY_PUBLIC_ORG_ID env.
    """
    if explicit is not None and isinstance(explicit, str) and explicit.strip():
        return explicit.strip()
    v = os.getenv("ALLOY_PUBLIC_ORG_ID")
    if v is not None and str(v).strip():
        return str(v).strip()
    return None


def find_contact_by_email(email: str) -> Optional[Dict]:
    """Find contact by email (case-insensitive)."""
    base_url = _get_base_url()
    url = f"{base_url}/contacts"
    email_lower = email.strip().lower()
    
    params = {
        "select": "id,first_name,last_name,phone,email,customer_id",
        "email": f"ilike.{email_lower}",
        "limit": "1",
    }
    
    try:
        response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
        if response.ok:
            data = response.json()
            if data and len(data) > 0:
                return data[0]
    except Exception as e:
        logger.debug(f"Error searching contact by email: {e}")
    
    return None

def find_contact_by_phone(phone: str) -> Optional[Dict]:
    """Find contact by phone (exact match)."""
    base_url = _get_base_url()
    url = f"{base_url}/contacts"
    phone_clean = phone.strip()
    
    params = {
        "select": "id,first_name,last_name,phone,email,customer_id",
        "phone": f"eq.{phone_clean}",
        "limit": "1",
    }
    
    try:
        response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
        if response.ok:
            data = response.json()
            if data and len(data) > 0:
                return data[0]
    except Exception as e:
        logger.debug(f"Error searching contact by phone: {e}")
    
    return None


def find_contact_by_id(contact_id: str) -> Optional[Dict]:
    """Fetch a contact by UUID. Returns full row or None."""
    if not contact_id or not contact_id.strip():
        return None
    base_url = _get_base_url()
    url = f"{base_url}/contacts"
    params = {"id": f"eq.{contact_id.strip()}", "select": "*", "limit": "1"}
    try:
        response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
        if response.ok:
            data = response.json()
            if data and len(data) > 0:
                return data[0]
    except Exception as e:
        logger.debug("Error fetching contact by id: %s", e)
    return None


def _normalize_uuid_fields(payload: Dict[str, Any], uuid_keys: Optional[List[str]] = None) -> Dict[str, Any]:
    """Convert empty string to None for UUID/FK fields. Returns a copy."""
    keys = uuid_keys or ("customer_id", "org_id", "primary_contact_id", "vendor_id", "vertical_id")
    out = dict(payload)
    for k in keys:
        if k in out and out[k] == "":
            out[k] = None
    return out


def resolve_or_create_contact_and_customer(
    email: Optional[str] = None,
    phone: Optional[str] = None,
    name: Optional[str] = None,
    contact_id: Optional[str] = None,
    customer_id: Optional[str] = None,
    booking_attempt_id: Optional[str] = None,
    public_org_id: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str], str]:
    """
    Resolve or create Supabase contact and ensure customer exists (idempotent).
    Used by /stripe/setup-intent so flow never requires a pre-existing contact.

    If contact_id is provided: fetch contact by id; if found use it and
    customer_id = customer_id param or contact.customer_id; skip create.
    resolution_path "contact_no_customer" when contact has no linked customer.

    Steps otherwise:
    1. Normalize email (case-insensitive) and phone (E.164).
    2. Find contact by email, then by phone.
    3. If not found, create contact (POST contacts).
    4. Ensure contact has customer_id; if not, create customer and set
       contacts.customer_id and customers.primary_contact_id.
    5. Return (supa_contact_id, supa_customer_id, resolution_path).

    resolution_path: "quote_id" | "found_by_email" | "found_by_phone" | "created" | "missing" | "contact_no_customer" | "missing_org"

    public_org_id:
        Optional UUID string for org scoping. When set, used before ALLOY_PUBLIC_ORG_ID env.
        Required for any contact or customer INSERT (NOT NULL in DB).

    Returns:
        (contact_id, customer_id, resolution_path); (None, None, "missing") if no email/phone.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("resolve_or_create_contact_and_customer: Supabase not configured")
        return None, None, "missing"

    effective_org_id = _effective_public_org_id(public_org_id)
    logger.info(
        "resolve_or_create_contact_and_customer: org_context booking_attempt_id=%s effective_org_id_present=%s",
        booking_attempt_id or "None",
        effective_org_id is not None,
    )

    # Quote-ID shortcut: use existing contact when contact_id provided. If contact has no customer, create one (Pass 1 lifecycle).
    if contact_id and contact_id.strip():
        existing = find_contact_by_id(contact_id.strip())
        if existing:
            cid = existing.get("id")
            cust_id = (customer_id and customer_id.strip()) or existing.get("customer_id")
            if cust_id:
                logger.info(
                    "resolve_or_create_contact_and_customer: quote_id shortcut booking_attempt_id=%s supa_contact_id=%s supa_customer_id=%s",
                    booking_attempt_id or "None",
                    (cid[:8] + "***") if cid and len(cid) > 8 else cid,
                    (cust_id[:8] + "***") if cust_id and len(cust_id) > 8 else cust_id,
                )
                return cid, cust_id, "quote_id"
            # Contact has no customer: create and link (payment/confirm path; customer not created at quote-start).
            _email = existing.get("email") or (email.strip().lower() if (email and isinstance(email, str)) else None)
            _phone = existing.get("phone") or (normalize_phone(phone) if phone else None)
            _name = name or (
                ((existing.get("first_name") or "") + " " + (existing.get("last_name") or "")).strip()
                or existing.get("email")
                or existing.get("phone")
                or "New Customer"
            )
            # Use ensure_customer_for_contact logic inline so we have correct name/email/phone from contact
            customer_name = _name if _name else (_email or _phone or "New Customer")
            customer_payload = {
                "name": customer_name,
                "primary_contact_id": cid,
                "status": "active",
            }
            if not effective_org_id:
                logger.error(
                    "resolve_or_create_contact_and_customer: missing org_id for customer insert (set ALLOY_PUBLIC_ORG_ID or pass public_org_id) booking_attempt_id=%s",
                    booking_attempt_id or "None",
                )
                return None, None, "missing_org"
            customer_payload["org_id"] = effective_org_id
            customer_payload = _normalize_uuid_fields(customer_payload)
            try:
                create_resp = requests.post(f"{_get_base_url()}/customers", headers=_get_headers(), json=customer_payload, timeout=30)
                if create_resp.ok:
                    customer_data = create_resp.json()
                    new_cust_id = None
                    if isinstance(customer_data, list) and len(customer_data) > 0:
                        new_cust_id = customer_data[0].get("id")
                    elif isinstance(customer_data, dict):
                        new_cust_id = customer_data.get("id")
                    if new_cust_id:
                        patch_resp = requests.patch(
                            f"{_get_base_url()}/contacts?id=eq.{cid}",
                            headers=_get_headers(),
                            json={"customer_id": new_cust_id},
                            timeout=30,
                        )
                        if patch_resp.ok:
                            logger.info(
                                "resolve_or_create_contact_and_customer: created customer for quote contact supa_customer_id=%s supa_contact_id=%s",
                                (new_cust_id[:8] + "***") if len(new_cust_id) > 8 else new_cust_id,
                                (cid[:8] + "***") if cid and len(cid) > 8 else cid,
                            )
                            return cid, new_cust_id, "quote_id_created_customer"
                # Fallback: return missing so caller can retry with email/phone
            except Exception as e:
                logger.warning("resolve_or_create_contact_and_customer: exception creating customer for quote contact: %s", e)
            return None, None, "contact_no_customer"

    normalized_email = email.strip().lower() if (email and isinstance(email, str)) else None
    normalized_phone = normalize_phone(phone) if phone else None
    if not normalized_email and not normalized_phone:
        logger.warning("resolve_or_create_contact_and_customer: no email or phone provided")
        return None, None, "missing"

    base_url = _get_base_url()
    headers = _get_headers()

    def ensure_customer_for_contact(contact_row: Dict, resolution_path: str) -> Tuple[Optional[str], Optional[str], str]:
        contact_id = contact_row.get("id")
        existing_customer_id = contact_row.get("customer_id")
        if existing_customer_id:
            return contact_id, existing_customer_id, resolution_path
        if not effective_org_id:
            logger.error(
                "resolve_or_create_contact_and_customer: missing org_id for customer insert booking_attempt_id=%s contact_id=%s",
                booking_attempt_id or "None",
                (contact_id[:8] + "***") if contact_id and len(str(contact_id)) > 8 else contact_id,
            )
            return contact_id, None, "missing_org"
        first_name = contact_row.get("first_name", "") or ""
        last_name = contact_row.get("last_name", "") or ""
        customer_name = (first_name + " " + last_name).strip() if (first_name or last_name) else name
        if not customer_name:
            customer_name = normalized_email or normalized_phone or "New Customer"
        customer_payload = {
            "name": customer_name,
            "primary_contact_id": contact_id,
            "status": "active",
            "org_id": effective_org_id,
        }
        customer_payload = _normalize_uuid_fields(customer_payload)
        try:
            create_resp = requests.post(f"{base_url}/customers", headers=headers, json=customer_payload, timeout=30)
            if not create_resp.ok:
                try:
                    error_body = create_resp.text
                except Exception:
                    error_body = ""
                logger.error(
                    "resolve_or_create_contact_and_customer: supabase customer insert failed status=%s error_body=%s payload_keys=%s contact_id=%s",
                    create_resp.status_code,
                    error_body[:500] if error_body else "",
                    list(customer_payload.keys()),
                    contact_id[:8] + "***" if contact_id and len(contact_id) > 8 else contact_id,
                )
                return contact_id, None, resolution_path
            customer_data = create_resp.json()
            new_customer_id = None
            if isinstance(customer_data, list) and len(customer_data) > 0:
                new_customer_id = customer_data[0].get("id")
            elif isinstance(customer_data, dict):
                new_customer_id = customer_data.get("id")
            if new_customer_id:
                patch_resp = requests.patch(
                    f"{base_url}/contacts?id=eq.{contact_id}",
                    headers=headers,
                    json={"customer_id": new_customer_id},
                    timeout=30,
                )
                if patch_resp.ok:
                    logger.info(
                        "resolve_or_create_contact_and_customer: created customer and linked contact supa_customer_id=%s supa_contact_id=%s",
                        new_customer_id[:8] + "***" if len(new_customer_id) > 8 else new_customer_id,
                        contact_id[:8] + "***" if len(contact_id) > 8 else contact_id,
                    )
                    return contact_id, new_customer_id, resolution_path
                logger.warning("resolve_or_create_contact_and_customer: failed to set contact.customer_id")
            return contact_id, None, resolution_path
        except Exception as e:
            logger.warning("resolve_or_create_contact_and_customer: exception creating customer: %s", e)
            return contact_id, None, resolution_path

    contact = None
    resolution_path = None

    if normalized_email:
        contact = find_contact_by_email(normalized_email)
        if contact:
            resolution_path = "found_by_email"
    if not contact and normalized_phone:
        contact = find_contact_by_phone(normalized_phone)
        if contact:
            resolution_path = "found_by_phone"

    if contact:
        contact_id, customer_id, path = ensure_customer_for_contact(contact, resolution_path)
        logger.info(
            "resolve_or_create_contact_and_customer: resolution_path=%s supa_contact_id=%s supa_customer_id=%s",
            path,
            contact_id[:8] + "***" if contact_id and len(contact_id) > 8 else contact_id or "None",
            customer_id[:8] + "***" if customer_id and len(customer_id) > 8 else customer_id or "None",
        )
        return contact_id, customer_id, path

    first_name, last_name = "", ""
    if name and isinstance(name, str):
        parts = name.strip().split(None, 1)
        first_name = parts[0] if parts else ""
        last_name = parts[1] if len(parts) > 1 else ""
    contact_payload = {"first_name": first_name, "last_name": last_name}
    if normalized_email:
        contact_payload["email"] = normalized_email
    if normalized_phone:
        contact_payload["phone"] = normalized_phone
    if not effective_org_id:
        logger.error(
            "resolve_or_create_contact_and_customer: missing org_id for contact insert booking_attempt_id=%s payload_keys=%s",
            booking_attempt_id or "None",
            list(contact_payload.keys()),
        )
        return None, None, "missing_org"
    contact_payload["org_id"] = effective_org_id
    contact_payload["contact_type"] = contact_payload.get("contact_type") or "lead"
    contact_payload["status"] = contact_payload.get("status") or "active"
    contact_payload = _normalize_uuid_fields(contact_payload)
    try:
        create_contact_resp = requests.post(f"{base_url}/contacts", headers=headers, json=contact_payload, timeout=30)
        if not create_contact_resp.ok:
            try:
                error_body = create_contact_resp.text
            except Exception:
                error_body = ""
            logger.error(
                "resolve_or_create_contact_and_customer: supabase contact insert failed status=%s error_body=%s payload_keys=%s booking_attempt_id=%s",
                create_contact_resp.status_code,
                error_body[:500] if error_body else "",
                list(contact_payload.keys()),
                booking_attempt_id or "None",
            )
            return None, None, "created"
        contact_data = create_contact_resp.json()
        new_contact_id = None
        if isinstance(contact_data, list) and len(contact_data) > 0:
            new_contact_id = contact_data[0].get("id")
        elif isinstance(contact_data, dict):
            new_contact_id = contact_data.get("id")
        if not new_contact_id:
            return None, None, "created"
        new_contact_row = contact_data[0] if isinstance(contact_data, list) else contact_data
        contact_id, customer_id, _ = ensure_customer_for_contact(
            {"id": new_contact_id, "customer_id": None, "first_name": first_name, "last_name": last_name},
            "created",
        )
        logger.info(
            "resolve_or_create_contact_and_customer: resolution_path=created supa_contact_id=%s supa_customer_id=%s",
            contact_id[:8] + "***" if contact_id and len(contact_id) > 8 else contact_id or "None",
            customer_id[:8] + "***" if customer_id and len(customer_id) > 8 else customer_id or "None",
        )
        return contact_id, customer_id, "created"
    except Exception as e:
        logger.warning("resolve_or_create_contact_and_customer: exception creating contact: %s", e)
        return None, None, "created"


def upsert_contact(contact_payload: Dict, internal_id: Optional[str] = None) -> Dict:
    """
    Upsert a contact into the contacts table.
    
    Args:
        contact_payload: Contact data dictionary
        internal_id: Optional existing contact UUID (if provided, performs PATCH update)
    
    Returns:
        Contact dict with 'id' field
    """
    # Mask PII for logging
    email_masked = (contact_payload.get("email") or "")[:3] + "***" if contact_payload.get("email") else None
    phone_masked = (contact_payload.get("phone") or "")[:4] + "***" if contact_payload.get("phone") else None
    
    logger.info(
        "SUPA_WRITE_ATTEMPT entity=contact action=upsert email=%s phone=%s internal_id=%s",
        email_masked,
        phone_masked,
        internal_id
    )
    
    base_url = _get_base_url()
    
    # If no internal_id provided, try dedupe fallback
    if not internal_id:
        email = contact_payload.get("email")
        phone = contact_payload.get("phone")
        
        if email:
            existing = find_contact_by_email(email)
            if existing:
                internal_id = existing.get("id")
        
        if not internal_id and phone:
            existing = find_contact_by_phone(phone)
            if existing:
                internal_id = existing.get("id")
    
    url = f"{base_url}/contacts"
    
    if internal_id:
        # PATCH update
        url = f"{url}?id=eq.{internal_id}"
        method = "PATCH"
    else:
        # POST insert
        method = "POST"
    
    try:
        if method == "PATCH":
            response = requests.patch(url, headers=_get_headers(), json=contact_payload, timeout=30)
        else:
            response = requests.post(url, headers=_get_headers(), json=contact_payload, timeout=30)
        
        if response.ok:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                result = data[0]
            elif isinstance(data, dict):
                result = data
            else:
                raise ValueError("Unexpected response format")
            
            logger.info(
                "SUPA_WRITE_SUCCESS entity=contact action=upsert contact_id=%s email=%s phone=%s",
                result.get("id"),
                email_masked,
                phone_masked
            )
            return result
        else:
            error_text = response.text[:500]
            logger.error(
                "SUPA_WRITE_FAILED entity=contact action=upsert status=%d error=%s email=%s phone=%s",
                response.status_code,
                error_text,
                email_masked,
                phone_masked,
                exc_info=True
            )
            raise RuntimeError(f"Failed to upsert contact: {response.status_code} {error_text}")
    except Exception as e:
        logger.error(
            "SUPA_WRITE_FAILED entity=contact action=upsert error=%s email=%s phone=%s",
            str(e),
            email_masked,
            phone_masked,
            exc_info=True
        )
        raise

def find_external_mapping(source: str, entity_type: str, external_id: str, internal_table: str = "contacts") -> Optional[Dict]:
    """
    Find an external mapping record.
    
    Args:
        source: Source system (e.g., 'ghl')
        entity_type: Entity type (e.g., 'contact', 'opportunity', 'job')
        external_id: External system ID
        internal_table: Internal Supabase table name
    
    Returns:
        Mapping dict with 'internal_id' field, or None if not found
    """
    base_url = _get_base_url()
    url = f"{base_url}/external_mappings"
    
    params = {
        "select": "internal_id",
        "source": f"eq.{source}",
        "entity_type": f"eq.{entity_type}",
        "external_id": f"eq.{external_id}",
        "internal_table": f"eq.{internal_table}",
        "limit": "1",
    }
    
    try:
        response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
        if response.ok:
            data = response.json()
            if data and len(data) > 0:
                return data[0]
    except Exception as e:
        logger.debug(f"Error searching external mapping: {e}")
    
    return None

def upsert_external_mapping(
    source: str,
    entity_type: str,
    external_id: str,
    internal_id: str,
    internal_table: str = "contacts",
    raw: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Upsert an external mapping record (idempotent).
    
    Args:
        source: Source system (e.g., 'ghl')
        entity_type: Entity type (e.g., 'contact', 'opportunity', 'job')
        external_id: External system ID
        internal_id: Internal Supabase UUID
        internal_table: Internal Supabase table name
        raw: Optional raw JSON data from external system
    
    Returns:
        Dict with 'status' ('created'|'updated'|'already_exists') and 'mapping' (dict with 'id' field)
    """
    logger.info(
        "SUPA_MAPPING_UPSERT_ATTEMPT source=%s entity_type=%s external_id=%s internal_id=%s internal_table=%s",
        source,
        entity_type,
        external_id[:8] + "***" if len(external_id) > 8 else external_id,
        internal_id[:8] + "***" if len(internal_id) > 8 else internal_id,
        internal_table
    )
    
    base_url = _get_base_url()
    url = f"{base_url}/external_mappings"
    
    payload = {
        "source": source,
        "entity_type": entity_type,
        "external_id": external_id,
        "internal_id": internal_id,
        "internal_table": internal_table,
    }
    
    if raw:
        payload["raw"] = raw
    
    # Use upsert via on_conflict (requires unique index)
    headers = _get_headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=representation"
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        
        # Handle 201 Created, 200 OK, 204 No Content
        if response.status_code in (200, 201):
            # Try to parse JSON, but handle empty body gracefully
            try:
                if response.text.strip():
                    data = response.json()
                    if isinstance(data, list) and len(data) > 0:
                        mapping = data[0]
                        status = "created" if response.status_code == 201 else "updated"
                        logger.info(
                            "SUPA_MAPPING_UPSERT_SUCCESS status=%s id=%s source=%s entity_type=%s external_id=%s",
                            status,
                            mapping.get("id"),
                            source,
                            entity_type,
                            external_id[:8] + "***" if len(external_id) > 8 else external_id
                        )
                        return {"status": status, "mapping": mapping}
                    elif isinstance(data, dict):
                        status = "created" if response.status_code == 201 else "updated"
                        logger.info(
                            "SUPA_MAPPING_UPSERT_SUCCESS status=%s id=%s source=%s entity_type=%s external_id=%s",
                            status,
                            data.get("id"),
                            source,
                            entity_type,
                            external_id[:8] + "***" if len(external_id) > 8 else external_id
                        )
                        return {"status": status, "mapping": data}
                else:
                    # Empty body - do a GET to fetch the existing mapping
                    logger.debug("SUPA_MAPPING_UPSERT: Empty response body, fetching existing mapping")
                    return _fetch_existing_mapping(base_url, headers, source, entity_type, external_id, internal_table)
            except ValueError as e:
                # JSONDecodeError - empty body or invalid JSON
                logger.debug("SUPA_MAPPING_UPSERT: JSON decode error (likely empty body), fetching existing mapping: %s", e)
                return _fetch_existing_mapping(base_url, headers, source, entity_type, external_id, internal_table)
        
        elif response.status_code == 204:
            # No Content - mapping already exists, fetch it
            logger.debug("SUPA_MAPPING_UPSERT: 204 No Content, fetching existing mapping")
            return _fetch_existing_mapping(base_url, headers, source, entity_type, external_id, internal_table)
        
        elif response.status_code == 409:
            # Conflict - duplicate key violation (already exists)
            logger.info(
                "SUPA_MAPPING_UPSERT: 409 Conflict (duplicate), fetching existing mapping source=%s entity_type=%s external_id=%s",
                source,
                entity_type,
                external_id[:8] + "***" if len(external_id) > 8 else external_id
            )
            return _fetch_existing_mapping(base_url, headers, source, entity_type, external_id, internal_table)
        
        else:
            # Other error status
            error_text = response.text[:500] if response.text else "No error message"
            logger.error(
                "SUPA_MAPPING_UPSERT_FAILED status_code=%d body=%s source=%s entity_type=%s external_id=%s",
                response.status_code,
                error_text,
                source,
                entity_type,
                external_id[:8] + "***" if len(external_id) > 8 else external_id
            )
            raise RuntimeError(f"Failed to upsert external mapping: {response.status_code} {error_text}")
            
    except requests.exceptions.RequestException as e:
        logger.error(
            "SUPA_MAPPING_UPSERT_FAILED error=%s source=%s entity_type=%s external_id=%s",
            str(e),
            source,
            entity_type,
            external_id[:8] + "***" if len(external_id) > 8 else external_id,
            exc_info=True
        )
        raise
    except Exception as e:
        logger.error(
            "SUPA_MAPPING_UPSERT_FAILED error=%s source=%s entity_type=%s external_id=%s",
            str(e),
            source,
            entity_type,
            external_id[:8] + "***" if len(external_id) > 8 else external_id,
            exc_info=True
        )
        raise


def _fetch_existing_mapping(
    base_url: str,
    headers: Dict[str, str],
    source: str,
    entity_type: str,
    external_id: str,
    internal_table: str
) -> Dict[str, Any]:
    """Fetch existing mapping after 409/204/empty body."""
    url = f"{base_url}/external_mappings"
    params = {
        "select": "*",
        "source": f"eq.{source}",
        "entity_type": f"eq.{entity_type}",
        "external_id": f"eq.{external_id}",
        "internal_table": f"eq.{internal_table}",
        "limit": "1",
    }
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=30)
        if response.ok:
            data = response.json()
            if data and len(data) > 0:
                mapping = data[0]
                logger.info(
                    "SUPA_MAPPING_UPSERT_SUCCESS status=already_exists id=%s source=%s entity_type=%s external_id=%s",
                    mapping.get("id"),
                    source,
                    entity_type,
                    external_id[:8] + "***" if len(external_id) > 8 else external_id
                )
                return {"status": "already_exists", "mapping": mapping}
        
        # If GET fails or returns empty, something is wrong
        logger.error(
            "SUPA_MAPPING_UPSERT_FAILED reason=fetch_after_conflict_failed source=%s entity_type=%s external_id=%s",
            source,
            entity_type,
            external_id[:8] + "***" if len(external_id) > 8 else external_id
        )
        raise RuntimeError(f"Failed to fetch existing mapping after conflict")
    except Exception as e:
        logger.error(
            "SUPA_MAPPING_UPSERT_FAILED reason=fetch_exception error=%s source=%s entity_type=%s external_id=%s",
            str(e),
            source,
            entity_type,
            external_id[:8] + "***" if len(external_id) > 8 else external_id,
            exc_info=True
        )
        raise

def get_vertical_id_by_slug(slug: str) -> Optional[str]:
    """
    Get vertical ID by slug.
    
    Args:
        slug: Vertical slug (e.g., 'cleaning', 'gutters')
    
    Returns:
        Vertical UUID if found, None otherwise
    """
    base_url = _get_base_url()
    url = f"{base_url}/verticals"
    
    params = {
        "select": "id",
        "slug": f"eq.{slug}",
        "limit": "1",
    }
    
    try:
        response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
        if response.ok:
            data = response.json()
            if data and len(data) > 0:
                return data[0].get("id")
    except Exception as e:
        logger.debug(f"Error searching vertical by slug: {e}")
    
    return None

def find_or_create_opportunity(
    opportunity_payload: Dict,
    ghl_opportunity_id: Optional[str] = None,
    supabase_contact_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Find or create an opportunity (idempotent).
    
    Deduplication strategy:
    1. If ghl_opportunity_id provided: check external_mappings first
    2. If not found and supabase_contact_id provided: check recent opportunities (10 min window)
    3. Otherwise: create new
    
    Returns:
        Dict with 'status' ('found'|'created') and 'opportunity' (dict with 'id')
    """
    base_url = _get_base_url()
    headers = _get_headers()
    
    # Strategy 1: Check external_mappings if ghl_opportunity_id provided
    if ghl_opportunity_id:
        mapping = find_external_mapping("ghl", "opportunity", ghl_opportunity_id, "opportunities")
        if mapping:
            existing_opp_id = mapping.get("internal_id")
            if existing_opp_id:
                # Fetch the opportunity
                opp_url = f"{base_url}/opportunities"
                opp_params = {
                    "select": "*",
                    "id": f"eq.{existing_opp_id}",
                    "limit": "1",
                }
                try:
                    opp_response = requests.get(opp_url, headers=headers, params=opp_params, timeout=30)
                    if opp_response.ok:
                        opp_data = opp_response.json()
                        if opp_data and len(opp_data) > 0:
                            logger.info(
                                "SUPA_OPP_RESOLVE path=mapping opportunity_id=%s ghl_opportunity_id=%s",
                                existing_opp_id,
                                ghl_opportunity_id[:8] + "***" if len(ghl_opportunity_id) > 8 else ghl_opportunity_id
                            )
                            return {"status": "found", "opportunity": opp_data[0]}
                except Exception as e:
                    logger.warning("SUPA_OPP_RESOLVE: Failed to fetch mapped opportunity: %s", e)
    
    # Strategy 2: Check recent opportunities for same contact (10 minute window)
    if supabase_contact_id:
        from datetime import datetime, timedelta
        from zoneinfo import ZoneInfo
        
        # Calculate 10 minutes ago in UTC
        ten_min_ago = (datetime.now(ZoneInfo("UTC")) - timedelta(minutes=10)).isoformat()
        
        opp_url = f"{base_url}/opportunities"
        opp_params = {
            "select": "*",
            "primary_contact_id": f"eq.{supabase_contact_id}",
            "status": "in.(open,new,lead)",
            "created_at": f"gte.{ten_min_ago}",
            "order": "created_at.desc",
            "limit": "1",
        }
        
        try:
            opp_response = requests.get(opp_url, headers=headers, params=opp_params, timeout=30)
            if opp_response.ok:
                opp_data = opp_response.json()
                if opp_data and len(opp_data) > 0:
                    existing_opp = opp_data[0]
                    logger.info(
                        "SUPA_OPP_RESOLVE path=recent_contact_window opportunity_id=%s contact_id=%s",
                        existing_opp.get("id"),
                        supabase_contact_id[:8] + "***" if len(supabase_contact_id) > 8 else supabase_contact_id
                    )
                    return {"status": "found", "opportunity": existing_opp}
        except Exception as e:
            logger.warning("SUPA_OPP_RESOLVE: Failed to check recent opportunities: %s", e)
    
    # Strategy 3: Create new opportunity
    return create_opportunity(opportunity_payload)


def create_opportunity(opportunity_payload: Dict) -> Dict:
    """
    Create an opportunity in Supabase.
    
    Args:
        opportunity_payload: Opportunity data dictionary
    
    Returns:
        Opportunity dict with 'id' field
    """
    base_url = _get_base_url()
    url = f"{base_url}/opportunities"
    
    logger.info(
        "SUPA_WRITE_ATTEMPT entity=opportunity action=create primary_contact_id=%s",
        opportunity_payload.get("primary_contact_id")
    )
    
    try:
        response = requests.post(url, headers=_get_headers(), json=opportunity_payload, timeout=30)
        if response.ok:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                result = data[0]
            elif isinstance(data, dict):
                result = data
            else:
                raise ValueError("Unexpected response format")
            
            logger.info(
                "SUPA_WRITE_SUCCESS entity=opportunity action=create opportunity_id=%s primary_contact_id=%s",
                result.get("id"),
                result.get("primary_contact_id")
            )
            return result
        else:
            error_text = response.text[:500]
            logger.error(
                "SUPA_WRITE_FAILED entity=opportunity action=create status=%d error=%s",
                response.status_code,
                error_text,
                exc_info=True
            )
            raise RuntimeError(f"Failed to create opportunity: {response.status_code} {error_text}")
    except Exception as e:
        logger.error(
            "SUPA_WRITE_FAILED entity=opportunity action=create error=%s",
            str(e),
            exc_info=True
        )
        raise

def upsert_job(job_payload: Dict, internal_id: Optional[str] = None) -> Dict:
    """
    Upsert a job in Supabase.
    
    Args:
        job_payload: Job data dictionary
        internal_id: Optional existing job UUID (if provided, performs PATCH update)
    
    Returns:
        Job dict with 'id' field
    """
    base_url = _get_base_url()
    url = f"{base_url}/jobs"
    
    logger.info(
        "SUPA_WRITE_ATTEMPT entity=job action=upsert opportunity_id=%s internal_id=%s",
        job_payload.get("opportunity_id"),
        internal_id
    )
    
    if internal_id:
        url = f"{url}?id=eq.{internal_id}"
        method = "PATCH"
    else:
        method = "POST"
    
    try:
        if method == "PATCH":
            response = requests.patch(url, headers=_get_headers(), json=job_payload, timeout=30)
        else:
            response = requests.post(url, headers=_get_headers(), json=job_payload, timeout=30)
        
        if response.ok:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                result = data[0]
            elif isinstance(data, dict):
                result = data
            else:
                raise ValueError("Unexpected response format")
            
            logger.info(
                "SUPA_WRITE_SUCCESS entity=job action=upsert job_id=%s opportunity_id=%s",
                result.get("id"),
                result.get("opportunity_id")
            )
            return result
        else:
            error_text = response.text[:500]
            logger.error(
                "SUPA_WRITE_FAILED entity=job action=upsert status=%d error=%s",
                response.status_code,
                error_text,
                exc_info=True
            )
            raise RuntimeError(f"Failed to upsert job: {response.status_code} {error_text}")
    except Exception as e:
        logger.error(
            "SUPA_WRITE_FAILED entity=job action=upsert error=%s",
            str(e),
            exc_info=True
        )
        raise

def resolve_opportunity_id_from_ghl(ghl_opportunity_id: str) -> Optional[str]:
    """
    Resolve Supabase opportunity ID from GHL opportunity ID via external_mappings.
    
    Args:
        ghl_opportunity_id: GHL opportunity ID
    
    Returns:
        Supabase opportunity UUID if found, None otherwise
    """
    mapping = find_external_mapping("ghl", "opportunity", ghl_opportunity_id, "opportunities")
    if mapping:
        return mapping.get("internal_id")
    return None

def resolve_contact_id_from_ghl(ghl_contact_id: str) -> Optional[str]:
    """
    Resolve Supabase contact ID from GHL contact ID via external_mappings.
    
    Args:
        ghl_contact_id: GHL contact ID
    
    Returns:
        Supabase contact UUID if found, None otherwise
    """
    logger.info("SUPA_WRITE_ATTEMPT entity=contact action=resolve ghl_contact_id=%s", ghl_contact_id[:8] + "***" if len(ghl_contact_id) > 8 else ghl_contact_id)
    mapping = find_external_mapping("ghl", "contact", ghl_contact_id, "contacts")
    if mapping:
        internal_id = mapping.get("internal_id")
        logger.info("SUPA_WRITE_SUCCESS entity=contact action=resolve ghl_contact_id=%s internal_id=%s", ghl_contact_id[:8] + "***", internal_id)
        return internal_id
    logger.warning("SUPA_WRITE_FAILED entity=contact action=resolve ghl_contact_id=%s error=mapping_not_found", ghl_contact_id[:8] + "***")
    return None

def link_stripe_customer_to_supabase(
    stripe_customer_id: str,
    *,
    ghl_contact_id: Optional[str] = None,
    supabase_contact_id: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    setup_intent_id: Optional[str] = None,
    payment_method_id: Optional[str] = None,
    payment_method_brand: Optional[str] = None,
    payment_method_last4: Optional[str] = None,
    billing_address: Optional[Dict[str, Any]] = None,
    booking_attempt_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """
    Link Stripe customer to Supabase contact/customer.
    
    Resolves Supabase contact_id from supabase_contact_id (preferred), ghl_contact_id (via external_mappings), or email/phone fallback.
    Upserts customers row and updates contacts.customer_id.
    Updates address fields from Stripe billing_details if provided.
    
    Args:
        supabase_contact_id: Supabase contact UUID (preferred, direct lookup)
        ghl_contact_id: GHL contact ID (fallback, resolved via external_mappings)
        email: Email address (fallback)
        phone: Phone number (fallback)
        stripe_customer_id: Stripe customer ID (cus_...)
        setup_intent_id: Optional SetupIntent ID
        payment_method_id: Optional PaymentMethod ID
        payment_method_brand: Optional card brand (visa, mastercard, etc.)
        payment_method_last4: Optional last 4 digits
        billing_address: Optional Stripe billing_details.address dict
    
    Returns:
        Dict with 'contact_id', 'customer_id', 'stripe_customer_id' if successful, None if failed
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("SUPA_STRIPE_LINK_ATTEMPT: Supabase not configured, skipping")
        return None
    
    logger.info(
        "SUPA_STRIPE_LINK_ATTEMPT booking_attempt_id=%s ghl_contact_id=%s email=%s phone=%s stripe_customer_id=%s",
        booking_attempt_id or "None",
        ghl_contact_id[:8] + "***" if ghl_contact_id and len(ghl_contact_id) > 8 else ghl_contact_id or "None",
        email[:3] + "***" if email else "None",
        phone[:4] + "***" if phone else "None",
        stripe_customer_id[:8] + "***" if len(stripe_customer_id) > 8 else stripe_customer_id
    )
    
    try:
        base_url = _get_base_url()
        headers = _get_headers()
        
        # 1. Resolve Supabase contact_id using deterministic order
        resolved_supabase_contact_id = None
        contact_resolution_path = None
        
        # Priority 1: Direct Supabase contact UUID (preferred)
        if supabase_contact_id:
            # Validate it exists
            contact_url = f"{base_url}/contacts"
            contact_params = {
                "select": "id",
                "id": f"eq.{supabase_contact_id}",
                "limit": "1",
            }
            contact_check = requests.get(contact_url, headers=headers, params=contact_params, timeout=30)
            if contact_check.ok:
                contact_data = contact_check.json()
                if contact_data and len(contact_data) > 0:
                    resolved_supabase_contact_id = supabase_contact_id
                    contact_resolution_path = "direct_uuid"
                    logger.info(
                        "CONTACT_RESOLVE path=direct_uuid contact_id=%s",
                        resolved_supabase_contact_id[:8] + "***" if len(resolved_supabase_contact_id) > 8 else resolved_supabase_contact_id
                    )
        
        # Priority 2: GHL contact_id via external_mappings
        if not resolved_supabase_contact_id and ghl_contact_id:
            resolved_supabase_contact_id = resolve_contact_id_from_ghl(ghl_contact_id)
            if resolved_supabase_contact_id:
                contact_resolution_path = "mapping"
                logger.info(
                    "CONTACT_RESOLVE path=mapping contact_id=%s ghl_contact_id=%s",
                    resolved_supabase_contact_id[:8] + "***" if len(resolved_supabase_contact_id) > 8 else resolved_supabase_contact_id,
                    ghl_contact_id[:8] + "***" if len(ghl_contact_id) > 8 else ghl_contact_id
                )
        
        # Priority 3: Email lookup
        if not resolved_supabase_contact_id and email:
            contact = find_contact_by_email(email.strip().lower())
            if contact:
                resolved_supabase_contact_id = contact.get("id")
                contact_resolution_path = "email"
                logger.info(
                    "CONTACT_RESOLVE path=email contact_id=%s email=%s",
                    resolved_supabase_contact_id[:8] + "***" if len(resolved_supabase_contact_id) > 8 else resolved_supabase_contact_id,
                    email[:3] + "***"
                )
        
        # Priority 4: Phone lookup
        if not resolved_supabase_contact_id and phone:
            contact = find_contact_by_phone(phone.strip())
            if contact:
                resolved_supabase_contact_id = contact.get("id")
                contact_resolution_path = "phone"
                logger.info(
                    "CONTACT_RESOLVE path=phone contact_id=%s phone=%s",
                    resolved_supabase_contact_id[:8] + "***" if len(resolved_supabase_contact_id) > 8 else resolved_supabase_contact_id,
                    phone[:4] + "***"
                )
        
        if not resolved_supabase_contact_id:
            logger.warning(
                "SUPA_STRIPE_LINK_FAILED reason=contact_not_found booking_attempt_id=%s supabase_contact_id=%s ghl_contact_id=%s email=%s phone=%s",
                booking_attempt_id or "None",
                supabase_contact_id or "None",
                ghl_contact_id or "None",
                email[:3] + "***" if email else "None",
                phone[:4] + "***" if phone else "None"
            )
            return None
        
        # 2. Get contact details for customer name
        contact_url = f"{base_url}/contacts"
        contact_params = {
            "select": "id,first_name,last_name,email,phone,customer_id,address_line1,address_line2,city,state,postal_code,country,address_source",
            "id": f"eq.{resolved_supabase_contact_id}",
            "limit": "1",
        }
        
        contact_response = requests.get(contact_url, headers=headers, params=contact_params, timeout=30)
        if not contact_response.ok:
            logger.error(
                "SUPA_STRIPE_LINK_FAILED reason=contact_fetch_failed booking_attempt_id=%s contact_id=%s status=%d response=%s",
                booking_attempt_id or "None",
                resolved_supabase_contact_id,
                contact_response.status_code,
                contact_response.text[:200]
            )
            return None
        
        contact_data = contact_response.json()
        if not contact_data or len(contact_data) == 0:
            logger.error("SUPA_STRIPE_LINK_FAILED reason=contact_not_found booking_attempt_id=%s contact_id=%s", booking_attempt_id or "None", resolved_supabase_contact_id)
            return None
        
        contact_row = contact_data[0]
        existing_customer_id = contact_row.get("customer_id")
        
        # 3. Determine customer name
        first_name = contact_row.get("first_name", "")
        last_name = contact_row.get("last_name", "")
        customer_name = None
        if first_name or last_name:
            customer_name = f"{first_name} {last_name}".strip()
        elif contact_row.get("email"):
            customer_name = contact_row.get("email")
        elif contact_row.get("phone"):
            customer_name = contact_row.get("phone")
        
        # 4. Find or create customer
        customer_id = None
        
        # Option A: Contact already has customer_id
        if existing_customer_id:
            customer_id = existing_customer_id
            logger.info("SUPA_STRIPE_LINK_ATTEMPT: Using existing customer_id=%s from contact", customer_id)
        
        # Option B: Find by stripe_customer_id
        if not customer_id:
            customers_url = f"{base_url}/customers"
            customers_params = {
                "select": "id",
                "stripe_customer_id": f"eq.{stripe_customer_id}",
                "limit": "1",
            }
            
            customers_response = requests.get(customers_url, headers=headers, params=customers_params, timeout=30)
            if customers_response.ok:
                customers_data = customers_response.json()
                if customers_data and len(customers_data) > 0:
                    customer_id = customers_data[0].get("id")
                    customer_resolution_path = "stripe_customer_id"
                    logger.info(
                        "CUSTOMER_RESOLVE path=stripe_customer_id customer_id=%s stripe_customer_id=%s",
                        customer_id[:8] + "***" if len(customer_id) > 8 else customer_id,
                        stripe_customer_id[:8] + "***" if len(stripe_customer_id) > 8 else stripe_customer_id
                    )
        
        # Option C: Create new customer
        if not customer_id:
            # Customer payload: only valid columns (NO email/phone - those don't exist in customers table)
            customer_payload = {
                "stripe_customer_id": stripe_customer_id,
                "primary_contact_id": resolved_supabase_contact_id,
                "status": "active",
            }
            
            if customer_name:
                customer_payload["name"] = customer_name
            else:
                customer_payload["name"] = "New Customer"
            
            if setup_intent_id:
                customer_payload["setup_intent_id"] = setup_intent_id
            
            if payment_method_id:
                customer_payload["default_payment_method_id"] = payment_method_id
            
            if payment_method_brand:
                customer_payload["payment_method_brand"] = payment_method_brand
            
            if payment_method_last4:
                customer_payload["payment_method_last4"] = payment_method_last4
            
            customers_url = f"{base_url}/customers"
            customer_response = requests.post(customers_url, headers=headers, json=customer_payload, timeout=30)
            
            if customer_response.ok:
                customer_data = customer_response.json()
                if isinstance(customer_data, list) and len(customer_data) > 0:
                    customer_id = customer_data[0].get("id")
                elif isinstance(customer_data, dict):
                    customer_id = customer_data.get("id")
                customer_resolution_path = "created"
                logger.info(
                    "CUSTOMER_RESOLVE path=created customer_id=%s contact_id=%s stripe_customer_id=%s",
                    customer_id[:8] + "***" if len(customer_id) > 8 else customer_id,
                    resolved_supabase_contact_id[:8] + "***" if len(resolved_supabase_contact_id) > 8 else resolved_supabase_contact_id,
                    stripe_customer_id[:8] + "***" if len(stripe_customer_id) > 8 else stripe_customer_id
                )
            else:
                error_text = customer_response.text[:500]
                logger.error(
                    "SUPA_STRIPE_LINK_FAILED reason=customer_create_failed booking_attempt_id=%s contact_id=%s stripe_customer_id=%s status=%d error=%s payload_keys=%s",
                    booking_attempt_id or "None",
                    resolved_supabase_contact_id,
                    stripe_customer_id[:8] + "***",
                    customer_response.status_code,
                    error_text,
                    list(customer_payload.keys())
                )
                return None
        
        # 5. Update customer with payment method details if provided
        if customer_id and (payment_method_id or payment_method_brand or payment_method_last4):
            update_payload = {}
            if payment_method_id:
                update_payload["default_payment_method_id"] = payment_method_id
            if payment_method_brand:
                update_payload["payment_method_brand"] = payment_method_brand
            if payment_method_last4:
                update_payload["payment_method_last4"] = payment_method_last4
            if setup_intent_id:
                update_payload["setup_intent_id"] = setup_intent_id
            
            if update_payload:
                customers_url = f"{base_url}/customers?id=eq.{customer_id}"
                update_response = requests.patch(customers_url, headers=headers, json=update_payload, timeout=30)
                if not update_response.ok:
                    logger.warning(
                        "SUPA_STRIPE_LINK_ATTEMPT: Failed to update customer payment method details customer_id=%s status=%d",
                        customer_id,
                        update_response.status_code
                    )
        
        # 6. Update contact.customer_id if not already set
        if contact_row.get("customer_id") != customer_id:
            contact_update_payload = {"customer_id": customer_id}
            contact_update_url = f"{base_url}/contacts?id=eq.{resolved_supabase_contact_id}"
            contact_update_response = requests.patch(contact_update_url, headers=headers, json=contact_update_payload, timeout=30)
            if not contact_update_response.ok:
                logger.warning(
                    "SUPA_STRIPE_LINK_ATTEMPT: Failed to update contact.customer_id contact_id=%s customer_id=%s status=%d",
                    resolved_supabase_contact_id,
                    customer_id,
                    contact_update_response.status_code
                )
        
        # 7. Update address from Stripe billing_details if provided
        if billing_address:
            address_source = contact_row.get("address_source")
            # Only update if address_source is None or 'book', or if fields are missing
            should_update_address = (
                address_source is None or 
                address_source == "book" or
                not contact_row.get("address_line1")
            )
            
            if should_update_address:
                address_payload = {"address_source": "stripe"}
                
                if billing_address.get("line1"):
                    address_payload["address_line1"] = billing_address.get("line1")
                if billing_address.get("line2"):
                    address_payload["address_line2"] = billing_address.get("line2")
                if billing_address.get("city"):
                    address_payload["city"] = billing_address.get("city")
                if billing_address.get("state"):
                    address_payload["state"] = billing_address.get("state")
                if billing_address.get("postal_code"):
                    address_payload["postal_code"] = billing_address.get("postal_code")
                if billing_address.get("country"):
                    address_payload["country"] = billing_address.get("country")
                
                if len(address_payload) > 1:  # More than just address_source
                    address_update_url = f"{base_url}/contacts?id=eq.{resolved_supabase_contact_id}"
                    address_update_response = requests.patch(address_update_url, headers=headers, json=address_payload, timeout=30)
                    if address_update_response.ok:
                        logger.info(
                            "SUPA_STRIPE_LINK_ATTEMPT: Updated address from Stripe billing_details contact_id=%s",
                            resolved_supabase_contact_id
                        )
                    else:
                        logger.warning(
                            "SUPA_STRIPE_LINK_ATTEMPT: Failed to update address contact_id=%s status=%d",
                            resolved_supabase_contact_id,
                            address_update_response.status_code
                        )
        
        logger.info(
            "SUPA_STRIPE_LINK_SUCCESS booking_attempt_id=%s supa_contact_id=%s supa_customer_id=%s stripe_customer_id=%s payment_method_id=%s last4=%s brand=%s",
            booking_attempt_id or "None",
            resolved_supabase_contact_id[:8] + "***" if len(resolved_supabase_contact_id) > 8 else resolved_supabase_contact_id,
            customer_id[:8] + "***" if len(customer_id) > 8 else customer_id,
            stripe_customer_id[:8] + "***",
            payment_method_id[:8] + "***" if payment_method_id and len(payment_method_id) > 8 else payment_method_id or "None",
            payment_method_last4 or "None",
            payment_method_brand or "None"
        )
        
        return {
            "contact_id": resolved_supabase_contact_id,
            "customer_id": customer_id,
            "stripe_customer_id": stripe_customer_id,
        }
    
    except Exception as e:
        logger.error(
            "SUPA_STRIPE_LINK_FAILED reason=exception booking_attempt_id=%s ghl_contact_id=%s email=%s phone=%s stripe_customer_id=%s error=%s",
            booking_attempt_id or "None",
            ghl_contact_id or "None",
            email[:3] + "***" if email else "None",
            phone[:4] + "***" if phone else "None",
            stripe_customer_id[:8] + "***" if len(stripe_customer_id) > 8 else stripe_customer_id,
            str(e),
            exc_info=True
        )
        return None


def get_or_create_stripe_customer_for_customer(
    *,
    customer_id: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    name: Optional[str] = None,
) -> Optional[str]:
    """
    Get or create Stripe customer ID from Supabase customer record.
    Strictly Supabase-first: only reads from public.customers.stripe_customer_id.
    
    Args:
        customer_id: Supabase customer UUID (preferred)
        email: Email address (fallback if customer_id not provided)
        phone: Phone number (fallback if customer_id not provided)
        name: Customer name (used when creating new Stripe customer)
    
    Returns:
        Stripe customer ID (cus_...) if found or created, None if failed
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.warning("get_or_create_stripe_customer: Supabase not configured")
        return None
    
    base_url = _get_base_url()
    headers = _get_headers()
    
    # Step 1: Find Supabase customer row
    supa_customer_row = None
    
    if customer_id:
        # Lookup by customer_id (Supabase UUID)
        customers_url = f"{base_url}/customers"
        params = {
            "select": "id,stripe_customer_id,name,primary_contact_id",
            "id": f"eq.{customer_id}",
            "limit": "1",
        }
        try:
            response = requests.get(customers_url, headers=headers, params=params, timeout=30)
            if response.ok:
                data = response.json()
                if data and len(data) > 0:
                    supa_customer_row = data[0]
                    logger.info(
                        "get_or_create_stripe_customer: found customer by id supa_customer_id=%s stripe_customer_id=%s",
                        customer_id[:8] + "***" if len(customer_id) > 8 else customer_id,
                        supa_customer_row.get("stripe_customer_id")[:8] + "***" if supa_customer_row.get("stripe_customer_id") else "None"
                    )
        except Exception as e:
            logger.warning("get_or_create_stripe_customer: failed to lookup by customer_id: %s", e)
    
    # Fallback: lookup by email or phone via contact
    if not supa_customer_row:
        if email:
            # Find contact by email, then get customer_id
            contact = find_contact_by_email(email)
            if contact and contact.get("customer_id"):
                supa_customer_id_from_contact = contact.get("customer_id")
                customers_url = f"{base_url}/customers"
                params = {
                    "select": "id,stripe_customer_id,name,primary_contact_id",
                    "id": f"eq.{supa_customer_id_from_contact}",
                    "limit": "1",
                }
                try:
                    response = requests.get(customers_url, headers=headers, params=params, timeout=30)
                    if response.ok:
                        data = response.json()
                        if data and len(data) > 0:
                            supa_customer_row = data[0]
                            logger.info(
                                "get_or_create_stripe_customer: found customer via contact email supa_customer_id=%s",
                                supa_customer_id_from_contact[:8] + "***" if len(supa_customer_id_from_contact) > 8 else supa_customer_id_from_contact
                            )
                except Exception as e:
                    logger.warning("get_or_create_stripe_customer: failed to lookup customer via email: %s", e)
        
        if not supa_customer_row and phone:
            # Find contact by phone, then get customer_id
            contact = find_contact_by_phone(phone)
            if contact and contact.get("customer_id"):
                supa_customer_id_from_contact = contact.get("customer_id")
                customers_url = f"{base_url}/customers"
                params = {
                    "select": "id,stripe_customer_id,name,primary_contact_id",
                    "id": f"eq.{supa_customer_id_from_contact}",
                    "limit": "1",
                }
                try:
                    response = requests.get(customers_url, headers=headers, params=params, timeout=30)
                    if response.ok:
                        data = response.json()
                        if data and len(data) > 0:
                            supa_customer_row = data[0]
                            logger.info(
                                "get_or_create_stripe_customer: found customer via contact phone supa_customer_id=%s",
                                supa_customer_id_from_contact[:8] + "***" if len(supa_customer_id_from_contact) > 8 else supa_customer_id_from_contact
                            )
                except Exception as e:
                    logger.warning("get_or_create_stripe_customer: failed to lookup customer via phone: %s", e)
    
    # Step 2: Check if customer has stripe_customer_id (validate it exists in current Stripe mode)
    if supa_customer_row:
        existing_stripe_customer_id = supa_customer_row.get("stripe_customer_id")
        if existing_stripe_customer_id and existing_stripe_customer_id.startswith("cus_"):
            try:
                stripe.Customer.retrieve(existing_stripe_customer_id)
                logger.info(
                    "get_or_create_stripe_customer: found existing stripe_customer_id source=supa supa_customer_id=%s stripe_customer_id=%s",
                    supa_customer_row.get("id")[:8] + "***" if supa_customer_row.get("id") else "None",
                    existing_stripe_customer_id[:8] + "***"
                )
                return existing_stripe_customer_id
            except stripe.error.StripeError as e:
                if not stripe_error_is_no_such_customer(e):
                    logger.warning(
                        "get_or_create_stripe_customer: Stripe error validating customer (not clearing; not auto-creating) supa_customer_id=%s error=%s",
                        supa_customer_row.get("id")[:8] + "***" if supa_customer_row.get("id") else "None",
                        str(e),
                    )
                    return None
                logger.warning(
                    "get_or_create_stripe_customer: existing stripe_customer_id invalid in current Stripe env (clearing) supa_customer_id=%s error=%s",
                    supa_customer_row.get("id")[:8] + "***" if supa_customer_row.get("id") else "None",
                    str(e),
                )
                supa_customer_id_to_clear = supa_customer_row.get("id")
                if supa_customer_id_to_clear:
                    clear_stripe_customer_id_for_supabase_customer(supa_customer_id_to_clear)
                supa_customer_row["stripe_customer_id"] = None

    # Backfill email/phone from primary contact when missing (quote path may only send contact/customer ids)
    if supa_customer_row and (not email or not phone):
        pcid = supa_customer_row.get("primary_contact_id")
        if pcid:
            c = find_contact_by_id(str(pcid))
            if c:
                if not email and c.get("email"):
                    email = str(c.get("email")).strip().lower()
                if not phone and c.get("phone"):
                    phone = normalize_phone(str(c.get("phone")))

    # Step 3: Create new Stripe customer (if we have email/phone)
    if not email and not phone:
        logger.warning("get_or_create_stripe_customer: cannot create Stripe customer - missing email and phone")
        return None
    
    try:
        # Get name from supa_customer_row if available
        customer_name = name
        if not customer_name and supa_customer_row:
            customer_name = supa_customer_row.get("name")
        if not customer_name:
            # Try to get from contact
            if email:
                contact = find_contact_by_email(email)
                if contact:
                    first_name = contact.get("first_name", "")
                    last_name = contact.get("last_name", "")
                    if first_name or last_name:
                        customer_name = f"{first_name} {last_name}".strip()
            if not customer_name and phone:
                contact = find_contact_by_phone(phone)
                if contact:
                    first_name = contact.get("first_name", "")
                    last_name = contact.get("last_name", "")
                    if first_name or last_name:
                        customer_name = f"{first_name} {last_name}".strip()
        
        # Create Stripe customer
        stripe_customer = stripe.Customer.create(
            email=email,
            phone=phone,
            name=customer_name,
            metadata={
                "supabase_customer_id": supa_customer_row.get("id") if supa_customer_row else None,
            }
        )
        stripe_customer_id = stripe_customer.id
        logger.info(
            "get_or_create_stripe_customer: created new Stripe customer source=supa stripe_customer_id=%s",
            stripe_customer_id[:8] + "***"
        )
        
        # Step 4: Save stripe_customer_id to Supabase
        if supa_customer_row:
            # Update existing customer
            supa_customer_id_to_update = supa_customer_row.get("id")
            customers_url = f"{base_url}/customers?id=eq.{supa_customer_id_to_update}"
            update_payload = {"stripe_customer_id": stripe_customer_id}
            try:
                update_response = requests.patch(customers_url, headers=headers, json=update_payload, timeout=30)
                if update_response.ok:
                    logger.info(
                        "get_or_create_stripe_customer: saved stripe_customer_id to Supabase supa_customer_id=%s stripe_customer_id=%s",
                        supa_customer_id_to_update[:8] + "***" if len(supa_customer_id_to_update) > 8 else supa_customer_id_to_update,
                        stripe_customer_id[:8] + "***"
                    )
                else:
                    logger.warning(
                        "get_or_create_stripe_customer: failed to save stripe_customer_id to Supabase supa_customer_id=%s status=%d",
                        supa_customer_id_to_update[:8] + "***" if len(supa_customer_id_to_update) > 8 else supa_customer_id_to_update,
                        update_response.status_code
                    )
            except Exception as e:
                logger.warning("get_or_create_stripe_customer: exception saving stripe_customer_id: %s", e)
        else:
            # Create new customer row in Supabase
            # First, find or create contact (required for customer creation)
            contact_id = None
            if email:
                contact = find_contact_by_email(email)
                if contact:
                    contact_id = contact.get("id")
            
            if not contact_id and phone:
                contact = find_contact_by_phone(phone)
                if contact:
                    contact_id = contact.get("id")
            
            # If no contact found, we cannot create customer (contact is required)
            if not contact_id:
                logger.warning(
                    "get_or_create_stripe_customer: cannot create customer - no contact found for email=%s phone=%s",
                    email[:10] + "***" if email else "None",
                    phone[:4] + "***" if phone else "None"
                )
                return stripe_customer_id  # Return Stripe customer ID even if we can't save it
            
            # Customer payload: only valid columns (NO email/phone - those don't exist in customers table)
            customer_payload = {
                "stripe_customer_id": stripe_customer_id,
                "primary_contact_id": contact_id,
                "status": "active",
            }
            if customer_name:
                customer_payload["name"] = customer_name
            else:
                # Fallback name from contact
                if contact:
                    first_name = contact.get("first_name", "")
                    last_name = contact.get("last_name", "")
                    if first_name or last_name:
                        customer_payload["name"] = f"{first_name} {last_name}".strip()
                    elif email:
                        customer_payload["name"] = email
                    elif phone:
                        customer_payload["name"] = phone
                    else:
                        customer_payload["name"] = "New Customer"
            
            customers_url = f"{base_url}/customers"
            try:
                create_response = requests.post(customers_url, headers=headers, json=customer_payload, timeout=30)
                if create_response.ok:
                    customer_data = create_response.json()
                    new_customer_id = None
                    if isinstance(customer_data, list) and len(customer_data) > 0:
                        new_customer_id = customer_data[0].get("id")
                    elif isinstance(customer_data, dict):
                        new_customer_id = customer_data.get("id")
                    
                    if new_customer_id and contact_id:
                        # Link contact to customer
                        contacts_url = f"{base_url}/contacts?id=eq.{contact_id}"
                        contact_update = {"customer_id": new_customer_id}
                        try:
                            requests.patch(contacts_url, headers=headers, json=contact_update, timeout=30)
                            logger.info(
                                "get_or_create_stripe_customer: created new customer and linked contact supa_customer_id=%s supa_contact_id=%s",
                                new_customer_id[:8] + "***" if len(new_customer_id) > 8 else new_customer_id,
                                contact_id[:8] + "***" if len(contact_id) > 8 else contact_id
                            )
                        except Exception as e:
                            logger.warning("get_or_create_stripe_customer: failed to link contact to customer: %s", e)
                else:
                    error_text = create_response.text[:500]
                    logger.error(
                        "get_or_create_stripe_customer: failed to create customer in Supabase status=%d error=%s payload_keys=%s",
                        create_response.status_code,
                        error_text,
                        list(customer_payload.keys())
                    )
            except Exception as e:
                logger.warning("get_or_create_stripe_customer: exception creating customer: %s", e)
        
        return stripe_customer_id
        
    except Exception as e:
        logger.error(
            "get_or_create_stripe_customer: failed to create Stripe customer: %s",
            str(e),
            exc_info=True
        )
        return None


# Lookup column in payment_statuses for resolving pending/paid/failed (use 'code' or 'name' if your table differs)
PAYMENT_STATUS_LOOKUP_COLUMN = "key"


def _payment_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _legacy_status_key_for_canonical(status: str) -> str:
    s = (status or "").strip().lower()
    if s == "posted":
        return "paid"
    return s or "pending"


def get_payment_row_by_id(payment_id: str) -> Optional[Dict[str, Any]]:
    """Load payments row fields needed for allocations and Stripe sync."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not payment_id:
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/payments"
        params = {
            "id": f"eq.{payment_id}",
            "select": "id,org_id,job_id,amount_cents,customer_id,status,provider_payment_id,processor_transaction_id",
            "limit": "1",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if not resp.ok:
            return None
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            return data[0]
        return None
    except Exception as e:
        logger.warning("get_payment_row_by_id: exception %s", e)
        return None


def sum_active_allocations_for_payment(payment_id: str, org_id: str) -> int:
    total = 0
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return 0
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/payment_allocations"
        params = {
            "payment_id": f"eq.{payment_id}",
            "org_id": f"eq.{org_id}",
            "status": "eq.active",
            "select": "allocated_amount_cents",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            return 0
        data = resp.json()
        if not isinstance(data, list):
            return 0
        for row in data:
            if isinstance(row, dict):
                v = row.get("allocated_amount_cents")
                try:
                    total += int(v)
                except (TypeError, ValueError):
                    pass
        return total
    except Exception as e:
        logger.warning("sum_active_allocations_for_payment: exception %s", e)
        return 0


def _get_active_job_allocation(
    payment_id: str, org_id: str, job_id: str
) -> Optional[Dict[str, Any]]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/payment_allocations"
        params = {
            "payment_id": f"eq.{payment_id}",
            "org_id": f"eq.{org_id}",
            "target_entity_type": "eq.job",
            "target_entity_id": f"eq.{job_id}",
            "status": "eq.active",
            "select": "id,allocated_amount_cents",
            "limit": "5",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if not resp.ok:
            return None
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            return data[0]
        return None
    except Exception as e:
        logger.warning("_get_active_job_allocation: exception %s", e)
        return None


def _list_job_service_charges(org_id: str, job_id: str) -> List[Dict[str, Any]]:
    """All service charges for a job (newest first). Service role / PostgREST."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not org_id or not job_id:
        return []
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/charges"
        params = {
            "org_id": f"eq.{org_id}",
            "job_id": f"eq.{job_id}",
            "charge_type": "eq.service",
            "select": "id,status,metadata,created_at",
            "order": "created_at.desc",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if not resp.ok:
            logger.warning(
                "_list_job_service_charges: GET failed status=%s body=%s",
                resp.status_code,
                _trunc_log_body(resp.text or ""),
            )
            return []
        data = resp.json()
        if not isinstance(data, list):
            return []
        return [r for r in data if isinstance(r, dict)]
    except Exception as e:
        logger.warning("_list_job_service_charges: exception %s", e)
        return []


def resolve_primary_service_charge_id(org_id: str, job_id: str) -> Optional[str]:
    """
    Primary service charge for payment allocation: prefer metadata.primary_service_charge,
    else lowest sort key among draft / partially_paid / posted / paid (void excluded).
    """
    rows = _list_job_service_charges(org_id, job_id)
    if not rows:
        return None
    non_void = [r for r in rows if str(r.get("status") or "").lower() != "void"]
    if not non_void:
        return None
    primary_rows = [
        r
        for r in non_void
        if isinstance(r.get("metadata"), dict)
        and (r.get("metadata") or {}).get("primary_service_charge") is True
    ]
    if primary_rows:
        primary_rows.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
        rid = primary_rows[0].get("id")
        return str(rid) if rid else None
    status_order = {"draft": 0, "partially_paid": 1, "posted": 2, "paid": 3}
    non_void.sort(
        key=lambda r: (
            status_order.get(str(r.get("status") or "").lower(), 99),
            str(r.get("created_at") or ""),
        )
    )
    rid = non_void[0].get("id")
    return str(rid) if rid else None


def ensure_charge_posted_for_allocation(charge_id: str) -> bool:
    """If charge is still draft, transition to posted and set posted_at before allocating payment."""
    if not charge_id or not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return False
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/charges"
        params = {"id": f"eq.{charge_id}", "select": "id,status", "limit": "1"}
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if not resp.ok:
            logger.warning(
                "ensure_charge_posted_for_allocation: GET charge failed status=%s",
                resp.status_code,
            )
            return False
        data = resp.json()
        if not isinstance(data, list) or len(data) < 1 or not isinstance(data[0], dict):
            return False
        st = str(data[0].get("status") or "").lower()
        if st != "draft":
            return True
        now = _payment_iso_now()
        headers_write = {**headers, "Prefer": "return=minimal"}
        patch_url = f"{base_url}/charges?id=eq.{charge_id}"
        pr = requests.patch(
            patch_url,
            headers=headers_write,
            json={"status": "posted", "posted_at": now, "updated_at": now},
            timeout=30,
        )
        if not pr.ok:
            logger.error(
                "ensure_charge_posted_for_allocation: PATCH failed status=%s body=%s",
                pr.status_code,
                _trunc_log_body(pr.text or ""),
            )
            return False
        return True
    except Exception as e:
        logger.exception("ensure_charge_posted_for_allocation: exception %s", e)
        return False


def ensure_job_payment_allocation(
    payment_id: str,
    org_id: str,
    job_id: str,
    requested_amount_cents: int,
) -> bool:
    """
    V1: single job target, active allocation, idempotent upsert.
    Enforces job org matches payment org and sum(active allocations) <= payment.amount_cents.
    """
    if not job_id or not org_id or not payment_id:
        logger.warning("ensure_job_payment_allocation: missing job_id/org_id/payment_id")
        return False
    row = get_payment_row_by_id(payment_id)
    if not row:
        logger.warning("ensure_job_payment_allocation: payment not found id=%s", payment_id[:8] + "***")
        return False
    if str(row.get("org_id") or "") != str(org_id):
        logger.error("ensure_job_payment_allocation: org mismatch payment vs arg")
        return False
    job = get_job_by_id(job_id)
    if not job:
        logger.warning("ensure_job_payment_allocation: job not found job_id=%s", job_id[:8] + "***")
        return False
    if str(job.get("org_id") or "") != str(org_id):
        logger.error("ensure_job_payment_allocation: job org does not match payment org")
        return False

    try:
        payment_amount = int(row.get("amount_cents") or 0)
    except (TypeError, ValueError):
        payment_amount = 0
    if payment_amount < 1:
        return False

    try:
        req = int(requested_amount_cents)
    except (TypeError, ValueError):
        req = payment_amount
    req = max(0, min(req, payment_amount))

    total_active = sum_active_allocations_for_payment(payment_id, org_id)
    existing = _get_active_job_allocation(payment_id, org_id, job_id)
    existing_cents = 0
    if existing:
        try:
            existing_cents = int(existing.get("allocated_amount_cents") or 0)
        except (TypeError, ValueError):
            existing_cents = 0

    other_active = total_active - existing_cents
    room = payment_amount - other_active
    alloc_amt = max(0, min(req, room))
    if alloc_amt < 1:
        logger.info(
            "ensure_job_payment_allocation: skip alloc (no room) payment_id=%s room=%s",
            payment_id[:8] + "***",
            room,
        )
        return True

    charge_id: Optional[str] = resolve_primary_service_charge_id(org_id, job_id)
    if charge_id:
        if not ensure_charge_posted_for_allocation(charge_id):
            logger.error(
                "ensure_job_payment_allocation: draft charge post failed charge_id=%s",
                charge_id[:8] + "***",
            )
            return False

    base_url = _get_base_url()
    headers = _get_headers()
    headers_write = {**headers, "Prefer": "return=minimal"}

    patch_alloc_body: Dict[str, Any] = {
        "allocated_amount_cents": alloc_amt,
        "updated_at": _payment_iso_now(),
    }
    if charge_id:
        patch_alloc_body["charge_id"] = charge_id

    if existing and existing.get("id"):
        alloc_id = existing["id"]
        patch_url = f"{base_url}/payment_allocations?id=eq.{alloc_id}"
        try:
            resp = requests.patch(
                patch_url,
                headers=headers_write,
                json=patch_alloc_body,
                timeout=30,
            )
            if not resp.ok:
                logger.error(
                    "ensure_job_payment_allocation: PATCH allocation failed status=%s body=%s",
                    resp.status_code,
                    resp.text[:300],
                )
                return False
            return True
        except requests.RequestException as e:
            logger.exception("ensure_job_payment_allocation: PATCH exception %s", e)
            return False

    insert_payload: Dict[str, Any] = {
        "org_id": org_id,
        "payment_id": payment_id,
        "target_entity_type": "job",
        "target_entity_id": job_id,
        "allocated_amount_cents": alloc_amt,
        "status": "active",
        "allocation_type": "payment_application",
        "metadata": {},
    }
    if charge_id:
        insert_payload["charge_id"] = charge_id
    try:
        resp = requests.post(f"{base_url}/payment_allocations", headers=headers_write, json=insert_payload, timeout=30)
        if resp.ok:
            return True
        # Idempotent retry: row may have been created concurrently
        if resp.status_code in (409, 400) or "23505" in (resp.text or ""):
            retry = _get_active_job_allocation(payment_id, org_id, job_id)
            if retry and retry.get("id"):
                patch_url = f"{base_url}/payment_allocations?id=eq.{retry['id']}"
                pr = requests.patch(
                    patch_url,
                    headers=headers_write,
                    json=patch_alloc_body,
                    timeout=30,
                )
                return pr.ok
        logger.error(
            "ensure_job_payment_allocation: POST failed status=%s body=%s",
            resp.status_code,
            resp.text[:300],
        )
        return False
    except requests.RequestException as e:
        logger.exception("ensure_job_payment_allocation: POST exception %s", e)
        return False


def finalize_payment_allocation_for_job(payment_id: str) -> None:
    """After payment is posted, ensure job allocation matches payment amount (V1 full job pay)."""
    row = get_payment_row_by_id(payment_id)
    if not row:
        return
    job_id = row.get("job_id")
    org_id = row.get("org_id")
    if not job_id or not org_id:
        logger.warning("finalize_payment_allocation_for_job: missing job_id or org_id on payment")
        return
    try:
        amt = int(row.get("amount_cents") or 0)
    except (TypeError, ValueError):
        amt = 0
    ensure_job_payment_allocation(str(payment_id), str(org_id), str(job_id), amt)


def get_job_by_id(job_id: str) -> Optional[Dict]:
    """Fetch a single job by id. Returns dict with id, customer_id, opportunity_id, org_id, estimated_total_cents, recurring_total_cents or None."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/jobs"
        params = {"id": f"eq.{job_id}", "select": "id,customer_id,opportunity_id,org_id,estimated_total_cents,recurring_total_cents", "limit": "1"}
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if not resp.ok:
            return None
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            return data[0]
        return None
    except Exception as e:
        logger.warning("get_job_by_id: exception %s", e)
        return None


def get_customer_by_id(customer_id: str) -> Optional[Dict]:
    """Fetch a single customer by id. Returns dict with id, stripe_customer_id, default_payment_method_id or None."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/customers"
        params = {
            "id": f"eq.{customer_id}",
            "select": "id,stripe_customer_id,default_payment_method_id,payment_method_brand,payment_method_last4",
            "limit": "1",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if not resp.ok:
            return None
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            return data[0]
        return None
    except Exception as e:
        logger.warning("get_customer_by_id: exception %s", e)
        return None


def get_opportunity_org_id(opportunity_id: str) -> Optional[str]:
    """Fetch org_id for an opportunity. Returns None if not found."""
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/opportunities"
        params = {"id": f"eq.{opportunity_id}", "select": "org_id", "limit": "1"}
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if not resp.ok:
            return None
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            return data[0].get("org_id")
        return None
    except Exception as e:
        logger.warning("get_opportunity_org_id: exception %s", e)
        return None


def insert_payment(
    job_id: str,
    customer_id: str,
    amount_cents: int,
    payment_status_id: str,
    org_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """
    Insert a row into payments. Returns the new row id (UUID string) or None on error.
    Sets canonical fields (status=pending, processor, received_at, …) and creates a pending
    payment_allocations row for the job (V1).
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.error(
            "insert_payment: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY job_id=%s customer_id=%s org_id=%s payment_status_id=%s",
            job_id,
            customer_id,
            org_id,
            payment_status_id,
        )
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    received_at = _payment_iso_now()
    payload: Dict[str, Any] = {
        "job_id": job_id,
        "customer_id": customer_id,
        "amount_cents": amount_cents,
        "currency": "USD",
        "payment_status_id": payment_status_id,
        "provider": "stripe",
        "processor": "stripe",
        "status": "pending",
        "direction": "inbound",
        "received_at": received_at,
        "payment_method": "card",
        "status_key": "pending",
    }
    if org_id:
        payload["org_id"] = org_id
    if metadata is not None:
        payload["metadata"] = metadata
    payload_keys_log = sorted(payload.keys())
    try:
        url = f"{base_url}/payments"
        resp = requests.post(url, headers=headers, json=payload, timeout=30)
        if not resp.ok:
            logger.warning(
                "insert_payment: POST /payments not ok status=%s payload_keys=%s body=%s",
                resp.status_code,
                payload_keys_log,
                _trunc_log_body(resp.text or ""),
            )
            return None
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            pid = data[0].get("id")
            if pid and org_id:
                ensure_job_payment_allocation(str(pid), str(org_id), str(job_id), int(amount_cents))
            if not pid:
                logger.warning(
                    "insert_payment: ok response but row missing id row_keys=%s row_repr_truncated=%s payload_keys=%s job_id=%s customer_id=%s org_id=%s payment_status_id=%s",
                    sorted(data[0].keys()),
                    _trunc_log_body(repr(data[0])),
                    payload_keys_log,
                    job_id,
                    customer_id,
                    org_id,
                    payment_status_id,
                )
                return None
            return pid
        logger.warning(
            "insert_payment: ok response unexpected shape type=%s repr_truncated=%s payload_keys=%s job_id=%s customer_id=%s org_id=%s payment_status_id=%s",
            type(data).__name__,
            _trunc_log_body(repr(data)),
            payload_keys_log,
            job_id,
            customer_id,
            org_id,
            payment_status_id,
        )
        return None
    except Exception:
        logger.exception(
            "insert_payment: exception job_id=%s customer_id=%s org_id=%s payment_status_id=%s payload_keys=%s",
            job_id,
            customer_id,
            org_id,
            payment_status_id,
            payload_keys_log,
        )
        return None


def update_payment_by_id(
    payment_id: str,
    *,
    provider_payment_id: Optional[str] = None,
    payment_status_id: Optional[str] = None,
    paid_at: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    additional_fields: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, int]:
    """
    Update a payments row by id. All keyword-only args are optional.
    additional_fields: merged into PATCH body (use for explicit JSON nulls, e.g. posted_at).
    Returns (success, rows_updated). On non-2xx response logs request/response and raises RuntimeError.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.error("update_payment_by_id: Supabase not configured")
        return (False, 0)
    base_url = _get_base_url()
    headers = _get_headers()
    payload: Dict[str, Any] = {"updated_at": _payment_iso_now()}
    if provider_payment_id is not None:
        payload["provider_payment_id"] = provider_payment_id
    if payment_status_id is not None:
        payload["payment_status_id"] = payment_status_id
    if paid_at is not None:
        payload["paid_at"] = paid_at
    if metadata is not None:
        payload["metadata"] = metadata
    if additional_fields:
        payload.update(additional_fields)
    url = f"{base_url}/payments"
    params = {"id": f"eq.{payment_id}"}
    try:
        resp = requests.patch(url, headers=headers, json=payload, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            rows = len(data) if isinstance(data, list) else 0
            return (True, rows)
        logger.error(
            "update_payment_by_id: PATCH non-2xx request url=%s params=%s payload_keys=%s response status=%d body=%s",
            url, params, list(payload.keys()), resp.status_code, resp.text[:500],
        )
        raise RuntimeError(
            "Supabase PATCH payments by id failed: status=%d body=%s" % (resp.status_code, resp.text[:300])
        )
    except requests.RequestException as e:
        logger.exception("update_payment_by_id: request exception payment_id=%s", payment_id[:8] + "***")
        raise RuntimeError("Supabase PATCH payments by id failed: %s" % e) from e


def get_payment_row_by_provider_payment_id(provider_payment_id: str) -> Optional[Dict[str, Any]]:
    """
    Return the payments row for a Stripe PaymentIntent id (provider_payment_id), or None.
    Used when attaching a PI to a row hits the unique index (idempotent Stripe replay).
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY or not provider_payment_id:
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/payments"
        params = {
            "provider_payment_id": f"eq.{provider_payment_id}",
            "select": "id,org_id,job_id,amount_cents,payment_status_id,provider_payment_id,processor_transaction_id,paid_at,metadata,status",
            "limit": "1",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if not resp.ok:
            return None
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            return data[0]
        return None
    except Exception as e:
        logger.warning("get_payment_row_by_provider_payment_id: exception %s", e)
        return None


def get_payment_status_id_by_key(status_key: str) -> Optional[str]:
    """
    Resolve payment_statuses.id (UUID) by status key/code.
    payment_statuses is assumed to have a column (key/code/name) with values 'pending', 'paid', 'failed'.
    Returns the UUID string of the row, or None if not found.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return None
    base_url = _get_base_url()
    headers = _get_headers()
    try:
        url = f"{base_url}/payment_statuses"
        params = {
            "select": "id",
            PAYMENT_STATUS_LOOKUP_COLUMN: f"eq.{status_key}",
            "limit": "1",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=10)
        if not resp.ok:
            logger.warning("get_payment_status_id_by_key: %s=%s status=%d", PAYMENT_STATUS_LOOKUP_COLUMN, status_key, resp.status_code)
            return None
        data = resp.json()
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
            return data[0].get("id")
        return None
    except Exception as e:
        logger.warning("get_payment_status_id_by_key: exception %s", e)
        return None


def update_payment_by_provider_payment_id(
    provider_payment_id: str,
    payment_status_id: str,
    paid_at: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    *,
    outcome: str = "succeeded",
) -> Tuple[bool, int]:
    """
    Update a payments row by Stripe PaymentIntent id (dual-written to provider_payment_id
    and processor_transaction_id when applicable).

    outcome:
      - succeeded: status=posted, mirrors paid_at/posted_at, Stripe ids, then syncs job allocation.
      - failed: status=failed, failed_at set, clears paid/posted/voided timestamps.
      - canceled: status=voided, voided_at set, clears paid/posted/failed timestamps.

    payment_status_id: FK to payment_statuses (legacy); keep in sync with outcome.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        logger.error("update_payment_by_provider_payment_id: Supabase not configured")
        return (False, 0)
    if not provider_payment_id or not provider_payment_id.startswith("pi_"):
        logger.warning("update_payment_by_provider_payment_id: invalid provider_payment_id")
        return (False, 0)
    base_url = _get_base_url()
    headers = _get_headers()
    now = _payment_iso_now()
    payload: Dict[str, Any] = {
        "payment_status_id": payment_status_id,
        "updated_at": now,
    }
    if metadata is not None:
        payload["metadata"] = metadata

    oc = (outcome or "succeeded").strip().lower()
    if oc == "succeeded":
        ts = paid_at or now
        payload["status"] = "posted"
        payload["status_key"] = _legacy_status_key_for_canonical("posted")
        payload["posted_at"] = ts
        payload["paid_at"] = ts
        payload["failed_at"] = None
        payload["voided_at"] = None
        payload["processor_transaction_id"] = provider_payment_id
        payload["provider_payment_id"] = provider_payment_id
        payload["provider"] = "stripe"
        payload["processor"] = "stripe"
    elif oc == "failed":
        payload["status"] = "failed"
        payload["status_key"] = "failed"
        payload["failed_at"] = now
        payload["posted_at"] = None
        payload["paid_at"] = None
        payload["voided_at"] = None
    elif oc == "canceled":
        payload["status"] = "voided"
        payload["status_key"] = "voided"
        payload["voided_at"] = now
        payload["posted_at"] = None
        payload["paid_at"] = None
        payload["failed_at"] = None
    else:
        if paid_at is not None:
            payload["paid_at"] = paid_at

    url = f"{base_url}/payments"
    # Filter by actual DB column: provider_payment_id (text)
    params = {"provider_payment_id": f"eq.{provider_payment_id}"}
    try:
        resp = requests.patch(url, headers=headers, json=payload, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            rows = len(data) if isinstance(data, list) else 0
            logger.info(
                "update_payment_by_provider_payment_id: filter_column=provider_payment_id rows_updated=%s pi_id=%s outcome=%s",
                rows, provider_payment_id[:14] + "***", oc,
            )
            if oc == "succeeded" and rows > 0:
                row = get_payment_row_by_provider_payment_id(provider_payment_id)
                if row and row.get("id"):
                    finalize_payment_allocation_for_job(str(row["id"]))
            return (True, rows)
        logger.error(
            "update_payment_by_provider_payment_id: PATCH non-2xx request url=%s params=%s response status=%d body=%s",
            url, params, resp.status_code, resp.text[:500],
        )
        raise RuntimeError(
            "Supabase PATCH payments by provider_payment_id failed: status=%d body=%s"
            % (resp.status_code, resp.text[:300])
        )
    except requests.RequestException as e:
        logger.exception(
            "update_payment_by_provider_payment_id: request exception provider_payment_id=%s",
            provider_payment_id[:12] + "***",
        )
        raise RuntimeError("Supabase PATCH payments by provider_payment_id failed: %s" % e) from e
