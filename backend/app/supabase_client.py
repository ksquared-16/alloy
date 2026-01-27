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
        "select": "id,first_name,last_name,phone,email",
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
        "select": "id,first_name,last_name,phone,email",
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
    if internal_id is None:
        email = contact_payload.get("email")
        phone = contact_payload.get("phone")
        if email:
            existing = find_contact_by_email(email)
            if existing:
                internal_id = existing.get("id")
                logger.info("SUPA_WRITE_ATTEMPT entity=contact dedupe_found_by_email internal_id=%s", internal_id)
        if not internal_id and phone:
            existing = find_contact_by_phone(phone)
            if existing:
                internal_id = existing.get("id")
                logger.info("SUPA_WRITE_ATTEMPT entity=contact dedupe_found_by_phone internal_id=%s", internal_id)
    
    if internal_id:
        # Update existing contact (PATCH)
        url = f"{base_url}/contacts"
        params = {"id": f"eq.{internal_id}"}
        
        try:
            response = requests.patch(url, headers=_get_headers(), params=params, json=contact_payload, timeout=30)
            if not response.ok:
                error_text = response.text[:500]
                logger.error(
                    "SUPA_WRITE_FAILED entity=contact action=update internal_id=%s status=%d error=%s",
                    internal_id,
                    response.status_code,
                    error_text
                )
                raise RuntimeError(f"PostgREST PATCH failed: {response.status_code} - {error_text}")
            
            data = response.json()
            if not data or len(data) == 0:
                logger.error("SUPA_WRITE_FAILED entity=contact action=update internal_id=%s error=no_data_returned", internal_id)
                raise RuntimeError("PATCH returned no data")
            
            logger.info(
                "SUPA_WRITE_SUCCESS entity=contact action=update internal_id=%s email=%s phone=%s",
                data[0].get("id"),
                email_masked,
                phone_masked
            )
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(
                "SUPA_WRITE_FAILED entity=contact action=update internal_id=%s error=%s",
                internal_id,
                str(e),
                exc_info=True
            )
            raise RuntimeError(f"Failed to update contact: {e}")
    else:
        # Insert new contact (POST)
        url = f"{base_url}/contacts"
        
        try:
            response = requests.post(url, headers=_get_headers(), json=contact_payload, timeout=30)
            if not response.ok:
                error_text = response.text[:500]
                logger.error(
                    "SUPA_WRITE_FAILED entity=contact action=create status=%d error=%s email=%s phone=%s",
                    response.status_code,
                    error_text,
                    email_masked,
                    phone_masked
                )
                raise RuntimeError(f"PostgREST POST failed: {response.status_code} - {error_text}")
            
            data = response.json()
            if not data or len(data) == 0:
                logger.error("SUPA_WRITE_FAILED entity=contact action=create error=no_data_returned email=%s phone=%s", email_masked, phone_masked)
                raise RuntimeError("POST returned no data")
            
            logger.info(
                "SUPA_WRITE_SUCCESS entity=contact action=create internal_id=%s email=%s phone=%s",
                data[0].get("id"),
                email_masked,
                phone_masked
            )
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(
                "SUPA_WRITE_FAILED entity=contact action=create error=%s email=%s phone=%s",
                str(e),
                email_masked,
                phone_masked,
                exc_info=True
            )
            raise RuntimeError(f"Failed to insert contact: {e}")

def find_external_mapping(source: str, entity_type: str, external_id: str, internal_table: str = "contacts") -> Optional[Dict]:
    """Find external mapping from external_mappings table."""
    base_url = _get_base_url()
    url = f"{base_url}/external_mappings"
    
    params = {
        "source": f"eq.{source}",
        "entity_type": f"eq.{entity_type}",
        "external_id": f"eq.{external_id}",
        "internal_table": f"eq.{internal_table}",
        "select": "internal_id",
        "limit": "1",
    }
    
    try:
        response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
        if not response.ok:
            return None
        
        data = response.json()
        if data and len(data) > 0:
            return data[0]
        return None
    except Exception as e:
        logger.debug(f"Error finding external mapping: {e}")
        return None

def upsert_external_mapping(mapping_payload: Dict) -> Dict:
    """
    Upsert external mapping using PostgREST on_conflict.
    
    Args:
        mapping_payload: Mapping payload dict
    
    Returns:
        Mapping dict with 'id' field
    """
    source = mapping_payload.get("source", "unknown")
    entity_type = mapping_payload.get("entity_type", "unknown")
    external_id = mapping_payload.get("external_id", "unknown")
    internal_id = mapping_payload.get("internal_id", "unknown")
    
    logger.info(
        "SUPA_WRITE_ATTEMPT entity=external_mapping source=%s entity_type=%s external_id=%s internal_id=%s",
        source,
        entity_type,
        external_id[:8] + "***" if len(external_id) > 8 else external_id,
        internal_id
    )
    
    base_url = _get_base_url()
    url = f"{base_url}/external_mappings"
    
    # Use on_conflict with merge-duplicates resolution
    headers = _get_headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=representation"
    
    # PostgREST on_conflict query parameter format
    params = {
        "on_conflict": "source,entity_type,external_id,internal_table"
    }
    
    try:
        response = requests.post(url, headers=headers, params=params, json=mapping_payload, timeout=30)
        if not response.ok:
            error_text = response.text[:500]
            logger.error(
                "SUPA_WRITE_FAILED entity=external_mapping source=%s entity_type=%s external_id=%s status=%d error=%s",
                source,
                entity_type,
                external_id[:8] + "***" if len(external_id) > 8 else external_id,
                response.status_code,
                error_text
            )
            raise RuntimeError(f"PostgREST POST (upsert) failed: {response.status_code} - {error_text}")
        
        data = response.json()
        if not data or len(data) == 0:
            logger.error("SUPA_WRITE_FAILED entity=external_mapping source=%s entity_type=%s error=no_data_returned", source, entity_type)
            raise RuntimeError("POST upsert returned no data")
        
        logger.info(
            "SUPA_WRITE_SUCCESS entity=external_mapping source=%s entity_type=%s external_id=%s internal_id=%s mapping_id=%s",
            source,
            entity_type,
            external_id[:8] + "***" if len(external_id) > 8 else external_id,
            internal_id,
            data[0].get("id")
        )
        return data[0]
    except requests.exceptions.RequestException as e:
        logger.error(
            "SUPA_WRITE_FAILED entity=external_mapping source=%s entity_type=%s external_id=%s error=%s",
            source,
            entity_type,
            external_id[:8] + "***" if len(external_id) > 8 else external_id,
            str(e),
            exc_info=True
        )
        raise RuntimeError(f"Failed to upsert external mapping: {e}")

def get_vertical_id_by_slug(slug: str) -> Optional[str]:
    """Get vertical ID by slug from verticals table."""
    logger.info("SUPA_WRITE_ATTEMPT entity=vertical action=lookup slug=%s", slug)
    
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
                vertical_id = data[0].get("id")
                logger.info("SUPA_WRITE_SUCCESS entity=vertical action=lookup slug=%s vertical_id=%s", slug, vertical_id)
                return vertical_id
            else:
                logger.warning("SUPA_WRITE_FAILED entity=vertical action=lookup slug=%s error=not_found", slug)
        else:
            error_text = response.text[:500]
            logger.error(
                "SUPA_WRITE_FAILED entity=vertical action=lookup slug=%s status=%d error=%s",
                slug,
                response.status_code,
                error_text
            )
    except Exception as e:
        logger.error(
            "SUPA_WRITE_FAILED entity=vertical action=lookup slug=%s error=%s",
            slug,
            str(e),
            exc_info=True
        )
    
    return None

def create_opportunity(opportunity_payload: Dict) -> Dict:
    """
    Create an opportunity in the opportunities table.
    
    Args:
        opportunity_payload: Opportunity data dictionary
    
    Returns:
        Opportunity dict with 'id' field
    """
    name = opportunity_payload.get("name", "unknown")
    contact_id = opportunity_payload.get("primary_contact_id", "unknown")
    vertical_id = opportunity_payload.get("vertical_id", "unknown")
    
    logger.info(
        "SUPA_WRITE_ATTEMPT entity=opportunity action=create name=%s contact_id=%s vertical_id=%s",
        name[:50] + "..." if len(name) > 50 else name,
        contact_id,
        vertical_id
    )
    
    base_url = _get_base_url()
    url = f"{base_url}/opportunities"
    
    try:
        response = requests.post(url, headers=_get_headers(), json=opportunity_payload, timeout=30)
        if not response.ok:
            error_text = response.text[:500]
            logger.error(
                "SUPA_WRITE_FAILED entity=opportunity action=create name=%s contact_id=%s status=%d error=%s",
                name[:50] + "..." if len(name) > 50 else name,
                contact_id,
                response.status_code,
                error_text
            )
            raise RuntimeError(f"PostgREST POST failed: {response.status_code} - {error_text}")
        
        data = response.json()
        if not data or len(data) == 0:
            logger.error("SUPA_WRITE_FAILED entity=opportunity action=create name=%s error=no_data_returned", name[:50])
            raise RuntimeError("POST returned no data")
        
        opportunity_id = data[0].get("id")
        logger.info(
            "SUPA_WRITE_SUCCESS entity=opportunity action=create opportunity_id=%s name=%s contact_id=%s",
            opportunity_id,
            name[:50] + "..." if len(name) > 50 else name,
            contact_id
        )
        return data[0]
    except requests.exceptions.RequestException as e:
        logger.error(
            "SUPA_WRITE_FAILED entity=opportunity action=create name=%s contact_id=%s error=%s",
            name[:50] + "..." if len(name) > 50 else name,
            contact_id,
            str(e),
            exc_info=True
        )
        raise RuntimeError(f"Failed to insert opportunity: {e}")

def upsert_job(job_payload: Dict, internal_id: Optional[str] = None) -> Dict:
    """
    Upsert a job into the jobs table.
    
    Args:
        job_payload: Job data dictionary
        internal_id: Optional existing job UUID (if provided, performs PATCH update)
    
    Returns:
        Job dict with 'id' field
    """
    title = job_payload.get("title", "unknown")
    opportunity_id = job_payload.get("opportunity_id", "unknown")
    action = "update" if internal_id else "create"
    
    logger.info(
        "SUPA_WRITE_ATTEMPT entity=job action=%s title=%s opportunity_id=%s internal_id=%s",
        action,
        title[:50] + "..." if len(title) > 50 else title,
        opportunity_id,
        internal_id
    )
    
    base_url = _get_base_url()
    
    if internal_id:
        # Update existing job (PATCH)
        url = f"{base_url}/jobs"
        params = {"id": f"eq.{internal_id}"}
        
        try:
            response = requests.patch(url, headers=_get_headers(), params=params, json=job_payload, timeout=30)
            if not response.ok:
                error_text = response.text[:500]
                logger.error(
                    "SUPA_WRITE_FAILED entity=job action=update internal_id=%s status=%d error=%s",
                    internal_id,
                    response.status_code,
                    error_text
                )
                raise RuntimeError(f"PostgREST PATCH failed: {response.status_code} - {error_text}")
            
            data = response.json()
            if not data or len(data) == 0:
                logger.error("SUPA_WRITE_FAILED entity=job action=update internal_id=%s error=no_data_returned", internal_id)
                raise RuntimeError("PATCH returned no data")
            
            logger.info(
                "SUPA_WRITE_SUCCESS entity=job action=update job_id=%s opportunity_id=%s",
                data[0].get("id"),
                opportunity_id
            )
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(
                "SUPA_WRITE_FAILED entity=job action=update internal_id=%s error=%s",
                internal_id,
                str(e),
                exc_info=True
            )
            raise RuntimeError(f"Failed to update job: {e}")
    else:
        # Insert new job (POST)
        url = f"{base_url}/jobs"
        
        try:
            response = requests.post(url, headers=_get_headers(), json=job_payload, timeout=30)
            if not response.ok:
                error_text = response.text[:500]
                logger.error(
                    "SUPA_WRITE_FAILED entity=job action=create opportunity_id=%s status=%d error=%s",
                    opportunity_id,
                    response.status_code,
                    error_text
                )
                raise RuntimeError(f"PostgREST POST failed: {response.status_code} - {error_text}")
            
            data = response.json()
            if not data or len(data) == 0:
                logger.error("SUPA_WRITE_FAILED entity=job action=create opportunity_id=%s error=no_data_returned", opportunity_id)
                raise RuntimeError("POST returned no data")
            
            job_id = data[0].get("id")
            logger.info(
                "SUPA_WRITE_SUCCESS entity=job action=create job_id=%s opportunity_id=%s title=%s",
                job_id,
                opportunity_id,
                title[:50] + "..." if len(title) > 50 else title
            )
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(
                "SUPA_WRITE_FAILED entity=job action=create opportunity_id=%s error=%s",
                opportunity_id,
                str(e),
                exc_info=True
            )
            raise RuntimeError(f"Failed to insert job: {e}")

def resolve_opportunity_id_from_ghl(ghl_opportunity_id: str) -> Optional[str]:
    """Resolve Supabase opportunity UUID from GHL opportunity ID via external_mappings."""
    logger.info("SUPA_WRITE_ATTEMPT entity=opportunity action=resolve ghl_opportunity_id=%s", ghl_opportunity_id[:8] + "***" if len(ghl_opportunity_id) > 8 else ghl_opportunity_id)
    mapping = find_external_mapping("ghl", "opportunity", ghl_opportunity_id, "opportunities")
    if mapping:
        internal_id = mapping.get("internal_id")
        logger.info("SUPA_WRITE_SUCCESS entity=opportunity action=resolve ghl_opportunity_id=%s internal_id=%s", ghl_opportunity_id[:8] + "***", internal_id)
        return internal_id
    logger.warning("SUPA_WRITE_FAILED entity=opportunity action=resolve ghl_opportunity_id=%s error=mapping_not_found", ghl_opportunity_id[:8] + "***")
    return None

def resolve_contact_id_from_ghl(ghl_contact_id: str) -> Optional[str]:
    """Resolve Supabase contact UUID from GHL contact ID via external_mappings."""
    logger.info("SUPA_WRITE_ATTEMPT entity=contact action=resolve ghl_contact_id=%s", ghl_contact_id[:8] + "***" if len(ghl_contact_id) > 8 else ghl_contact_id)
    mapping = find_external_mapping("ghl", "contact", ghl_contact_id, "contacts")
    if mapping:
        internal_id = mapping.get("internal_id")
        logger.info("SUPA_WRITE_SUCCESS entity=contact action=resolve ghl_contact_id=%s internal_id=%s", ghl_contact_id[:8] + "***", internal_id)
        return internal_id
    logger.warning("SUPA_WRITE_FAILED entity=contact action=resolve ghl_contact_id=%s error=mapping_not_found", ghl_contact_id[:8] + "***")
    return None

