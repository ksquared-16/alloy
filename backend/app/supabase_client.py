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
    base_url = SUPABASE_URL.rstrip("/")
    return f"{base_url}/rest/v1"

def _get_headers() -> Dict[str, str]:
    """Get PostgREST request headers with service role key."""
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
    base_url = _get_base_url()
    
    # If no internal_id provided, try dedupe fallback
    if internal_id is None:
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
    
    if internal_id:
        # Update existing contact (PATCH)
        url = f"{base_url}/contacts"
        params = {"id": f"eq.{internal_id}"}
        
        try:
            response = requests.patch(url, headers=_get_headers(), params=params, json=contact_payload, timeout=30)
            if not response.ok:
                raise RuntimeError(f"PostgREST PATCH failed: {response.status_code} - {response.text[:200]}")
            
            data = response.json()
            if not data or len(data) == 0:
                raise RuntimeError("PATCH returned no data")
            
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(f"Error updating contact {internal_id}: {e}")
            raise RuntimeError(f"Failed to update contact: {e}")
    else:
        # Insert new contact (POST)
        url = f"{base_url}/contacts"
        
        try:
            response = requests.post(url, headers=_get_headers(), json=contact_payload, timeout=30)
            if not response.ok:
                raise RuntimeError(f"PostgREST POST failed: {response.status_code} - {response.text[:200]}")
            
            data = response.json()
            if not data or len(data) == 0:
                raise RuntimeError("POST returned no data")
            
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(f"Error inserting contact: {e}")
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
            raise RuntimeError(f"PostgREST POST (upsert) failed: {response.status_code} - {response.text[:200]}")
        
        data = response.json()
        if not data or len(data) == 0:
            raise RuntimeError("POST upsert returned no data")
        
        return data[0]
    except requests.exceptions.RequestException as e:
        logger.error(f"Error upserting external_mapping: {e}")
        raise RuntimeError(f"Failed to upsert external mapping: {e}")

def get_vertical_id_by_slug(slug: str) -> Optional[str]:
    """Get vertical ID by slug from verticals table."""
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
        logger.debug(f"Error finding vertical by slug: {e}")
    
    return None

def create_opportunity(opportunity_payload: Dict) -> Dict:
    """
    Create an opportunity in the opportunities table.
    
    Args:
        opportunity_payload: Opportunity data dictionary
    
    Returns:
        Opportunity dict with 'id' field
    """
    base_url = _get_base_url()
    url = f"{base_url}/opportunities"
    
    try:
        response = requests.post(url, headers=_get_headers(), json=opportunity_payload, timeout=30)
        if not response.ok:
            raise RuntimeError(f"PostgREST POST failed: {response.status_code} - {response.text[:200]}")
        
        data = response.json()
        if not data or len(data) == 0:
            raise RuntimeError("POST returned no data")
        
        return data[0]
    except requests.exceptions.RequestException as e:
        logger.error(f"Error inserting opportunity: {e}")
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
    base_url = _get_base_url()
    
    if internal_id:
        # Update existing job (PATCH)
        url = f"{base_url}/jobs"
        params = {"id": f"eq.{internal_id}"}
        
        try:
            response = requests.patch(url, headers=_get_headers(), params=params, json=job_payload, timeout=30)
            if not response.ok:
                raise RuntimeError(f"PostgREST PATCH failed: {response.status_code} - {response.text[:200]}")
            
            data = response.json()
            if not data or len(data) == 0:
                raise RuntimeError("PATCH returned no data")
            
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(f"Error updating job {internal_id}: {e}")
            raise RuntimeError(f"Failed to update job: {e}")
    else:
        # Insert new job (POST)
        url = f"{base_url}/jobs"
        
        try:
            response = requests.post(url, headers=_get_headers(), json=job_payload, timeout=30)
            if not response.ok:
                raise RuntimeError(f"PostgREST POST failed: {response.status_code} - {response.text[:200]}")
            
            data = response.json()
            if not data or len(data) == 0:
                raise RuntimeError("POST returned no data")
            
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(f"Error inserting job: {e}")
            raise RuntimeError(f"Failed to insert job: {e}")

def resolve_opportunity_id_from_ghl(ghl_opportunity_id: str) -> Optional[str]:
    """Resolve Supabase opportunity UUID from GHL opportunity ID via external_mappings."""
    mapping = find_external_mapping("ghl", "opportunity", ghl_opportunity_id, "opportunities")
    if mapping:
        return mapping.get("internal_id")
    return None

def resolve_contact_id_from_ghl(ghl_contact_id: str) -> Optional[str]:
    """Resolve Supabase contact UUID from GHL contact ID via external_mappings."""
    mapping = find_external_mapping("ghl", "contact", ghl_contact_id, "contacts")
    if mapping:
        return mapping.get("internal_id")
    return None

