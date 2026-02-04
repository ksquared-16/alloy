"""
Supabase database client for backend operations.
Uses service role key to bypass RLS.
"""
import logging
import requests
import re
from typing import Dict, Optional, Any
from .settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
import stripe

# Initialize Stripe if secret key is available
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

logger = logging.getLogger("alloy-dispatcher")

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
        "SUPA_STRIPE_LINK_ATTEMPT ghl_contact_id=%s email=%s phone=%s stripe_customer_id=%s",
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
                "SUPA_STRIPE_LINK_FAILED reason=contact_not_found supabase_contact_id=%s ghl_contact_id=%s email=%s phone=%s",
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
                "SUPA_STRIPE_LINK_FAILED reason=contact_fetch_failed contact_id=%s status=%d response=%s",
                resolved_supabase_contact_id,
                contact_response.status_code,
                contact_response.text[:200]
            )
            return None
        
        contact_data = contact_response.json()
        if not contact_data or len(contact_data) == 0:
            logger.error("SUPA_STRIPE_LINK_FAILED reason=contact_not_found contact_id=%s", resolved_supabase_contact_id)
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
                    "SUPA_STRIPE_LINK_FAILED reason=customer_create_failed contact_id=%s stripe_customer_id=%s status=%d error=%s payload_keys=%s",
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
            "SUPA_STRIPE_LINK_SUCCESS supa_contact_id=%s supa_customer_id=%s stripe_customer_id=%s payment_method_id=%s last4=%s brand=%s",
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
            "SUPA_STRIPE_LINK_FAILED reason=exception ghl_contact_id=%s email=%s phone=%s stripe_customer_id=%s error=%s",
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
    
    # Step 2: Check if customer has stripe_customer_id
    if supa_customer_row:
        existing_stripe_customer_id = supa_customer_row.get("stripe_customer_id")
        if existing_stripe_customer_id and existing_stripe_customer_id.startswith("cus_"):
            logger.info(
                "get_or_create_stripe_customer: found existing stripe_customer_id source=supa supa_customer_id=%s stripe_customer_id=%s",
                supa_customer_row.get("id")[:8] + "***" if supa_customer_row.get("id") else "None",
                existing_stripe_customer_id[:8] + "***"
            )
            return existing_stripe_customer_id
    
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
