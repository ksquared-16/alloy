"""
Supabase database client for backend operations.
Uses service role key to bypass RLS.
"""
import logging
import requests
from typing import Dict, Optional, Any
from .settings import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

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
) -> Dict:
    """
    Upsert an external mapping record.
    
    Args:
        source: Source system (e.g., 'ghl')
        entity_type: Entity type (e.g., 'contact', 'opportunity', 'job')
        external_id: External system ID
        internal_id: Internal Supabase UUID
        internal_table: Internal Supabase table name
        raw: Optional raw JSON data from external system
    
    Returns:
        Mapping dict with 'id' field
    """
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
    headers["Prefer"] = "resolution=merge-duplicates"
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        if response.ok:
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                return data[0]
            elif isinstance(data, dict):
                return data
            else:
                raise ValueError("Unexpected response format")
        else:
            error_text = response.text[:500]
            logger.error(
                "SUPA_WRITE_FAILED entity=external_mapping action=upsert status=%d error=%s source=%s entity_type=%s external_id=%s",
                response.status_code,
                error_text,
                source,
                entity_type,
                external_id[:8] + "***" if len(external_id) > 8 else external_id
            )
            raise RuntimeError(f"Failed to upsert external mapping: {response.status_code} {error_text}")
    except Exception as e:
        logger.error(
            "SUPA_WRITE_FAILED entity=external_mapping action=upsert error=%s source=%s entity_type=%s external_id=%s",
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
    
    Resolves Supabase contact_id from ghl_contact_id (via external_mappings) or email/phone fallback.
    Upserts customers row and updates contacts.customer_id.
    Updates address fields from Stripe billing_details if provided.
    
    Args:
        ghl_contact_id: GHL contact ID (preferred)
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
        
        # 1. Resolve Supabase contact_id
        supabase_contact_id = None
        
        # Priority 1: GHL contact_id via external_mappings
        if ghl_contact_id:
            supabase_contact_id = resolve_contact_id_from_ghl(ghl_contact_id)
        
        # Priority 2: Email lookup
        if not supabase_contact_id and email:
            contact = find_contact_by_email(email.strip().lower())
            if contact:
                supabase_contact_id = contact.get("id")
        
        # Priority 3: Phone lookup
        if not supabase_contact_id and phone:
            contact = find_contact_by_phone(phone.strip())
            if contact:
                supabase_contact_id = contact.get("id")
        
        if not supabase_contact_id:
            logger.warning(
                "SUPA_STRIPE_LINK_FAILED reason=contact_not_found ghl_contact_id=%s email=%s phone=%s",
                ghl_contact_id or "None",
                email[:3] + "***" if email else "None",
                phone[:4] + "***" if phone else "None"
            )
            return None
        
        # 2. Get contact details for customer name
        contact_url = f"{base_url}/contacts"
        contact_params = {
            "select": "id,first_name,last_name,email,phone,customer_id,address_line1,address_line2,city,state,postal_code,country,address_source",
            "id": f"eq.{supabase_contact_id}",
            "limit": "1",
        }
        
        contact_response = requests.get(contact_url, headers=headers, params=contact_params, timeout=30)
        if not contact_response.ok:
            logger.error(
                "SUPA_STRIPE_LINK_FAILED reason=contact_fetch_failed contact_id=%s status=%d",
                supabase_contact_id,
                contact_response.status_code
            )
            return None
        
        contact_data = contact_response.json()
        if not contact_data or len(contact_data) == 0:
            logger.error("SUPA_STRIPE_LINK_FAILED reason=contact_not_found contact_id=%s", supabase_contact_id)
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
                    logger.info("SUPA_STRIPE_LINK_ATTEMPT: Found existing customer_id=%s by stripe_customer_id", customer_id)
        
        # Option C: Create new customer
        if not customer_id:
            customer_payload = {
                "stripe_customer_id": stripe_customer_id,
                "primary_contact_id": supabase_contact_id,
            }
            
            if customer_name:
                customer_payload["name"] = customer_name
            
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
                logger.info("SUPA_STRIPE_LINK_ATTEMPT: Created new customer_id=%s", customer_id)
            else:
                error_text = customer_response.text[:500]
                logger.error(
                    "SUPA_STRIPE_LINK_FAILED reason=customer_create_failed contact_id=%s stripe_customer_id=%s status=%d error=%s",
                    supabase_contact_id,
                    stripe_customer_id[:8] + "***",
                    customer_response.status_code,
                    error_text
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
            contact_update_url = f"{base_url}/contacts?id=eq.{supabase_contact_id}"
            contact_update_response = requests.patch(contact_update_url, headers=headers, json=contact_update_payload, timeout=30)
            if not contact_update_response.ok:
                logger.warning(
                    "SUPA_STRIPE_LINK_ATTEMPT: Failed to update contact.customer_id contact_id=%s customer_id=%s status=%d",
                    supabase_contact_id,
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
                    address_update_url = f"{base_url}/contacts?id=eq.{supabase_contact_id}"
                    address_update_response = requests.patch(address_update_url, headers=headers, json=address_payload, timeout=30)
                    if address_update_response.ok:
                        logger.info(
                            "SUPA_STRIPE_LINK_ATTEMPT: Updated address from Stripe billing_details contact_id=%s",
                            supabase_contact_id
                        )
                    else:
                        logger.warning(
                            "SUPA_STRIPE_LINK_ATTEMPT: Failed to update address contact_id=%s status=%d",
                            supabase_contact_id,
                            address_update_response.status_code
                        )
        
        logger.info(
            "SUPA_STRIPE_LINK_SUCCESS contact_id=%s customer_id=%s stripe_customer_id=%s payment_method_id=%s last4=%s brand=%s",
            supabase_contact_id,
            customer_id,
            stripe_customer_id[:8] + "***",
            payment_method_id[:8] + "***" if payment_method_id and len(payment_method_id) > 8 else payment_method_id or "None",
            payment_method_last4 or "None",
            payment_method_brand or "None"
        )
        
        return {
            "contact_id": supabase_contact_id,
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
