"""
Supabase database client and upsert operations using direct PostgREST API.
Uses service role key to bypass RLS.
"""
import logging
import requests
from datetime import datetime, timezone
from typing import Dict, Optional, Any
from .config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

logger = logging.getLogger(__name__)

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

def fetch_contact_person_id(contact_uuid: str) -> Optional[str]:
    """Return contacts.person_id for an internal contact UUID."""
    if not contact_uuid or not str(contact_uuid).strip():
        return None
    base_url = _get_base_url()
    url = f"{base_url}/contacts"
    params = {
        "select": "person_id",
        "id": f"eq.{str(contact_uuid).strip()}",
        "limit": "1",
    }
    try:
        response = requests.get(url, headers=_get_headers(), params=params, timeout=15)
        if not response.ok:
            return None
        data = response.json()
        if data and len(data) > 0 and isinstance(data[0], dict):
            pid = data[0].get("person_id")
            if pid is not None and str(pid).strip():
                return str(pid).strip()
    except Exception as e:
        logger.warning("fetch_contact_person_id failed: %s", e)
    return None


def enrich_opportunity_payload_person_first(opportunity_payload: Dict, context: str = "") -> Dict:
    """Set primary_person_id from primary_contact_id when missing (person-first writes)."""
    out = dict(opportunity_payload)
    existing = out.get("primary_person_id")
    if existing is not None and str(existing).strip():
        return out
    cid = out.get("primary_contact_id")
    if not cid or not str(cid).strip():
        logger.warning(
            "OPPORTUNITY_IDENTITY_GUARD opportunity write missing identity keys context=%s",
            context,
        )
        return out
    pid = fetch_contact_person_id(str(cid).strip())
    if pid:
        out["primary_person_id"] = pid
    else:
        logger.warning(
            "OPPORTUNITY_IDENTITY_GUARD unresolved contact-only write contact=%s context=%s",
            str(cid)[:8],
            context,
        )
    return out

def find_contact_by_unique_keys(email: Optional[str] = None, phone: Optional[str] = None) -> Optional[Dict]:
    """
    Find existing contact by email or phone (for dedupe fallback).
    
    Args:
        email: Email address (case-insensitive search)
        phone: Phone number (exact match)
    
    Returns:
        Contact dict with 'id' field if found, None otherwise
    """
    if not email and not phone:
        return None
    
    base_url = _get_base_url()
    url = f"{base_url}/contacts"
    params = {"select": "id", "limit": "1"}
    
    # Try email first (case-insensitive)
    if email:
        email_lower = email.strip().lower()
        params["email"] = f"ilike.{email_lower}"
        try:
            response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
            if response.ok:
                data = response.json()
                if data and len(data) > 0:
                    logger.info(f"Matched existing contact by email: {email_lower}")
                    return data[0]
        except Exception as e:
            logger.debug(f"Error searching by email: {e}")
    
    # Try phone if email didn't match
    if phone:
        phone_clean = phone.strip()
        params = {"select": "id", "phone": f"eq.{phone_clean}", "limit": "1"}
        try:
            response = requests.get(url, headers=_get_headers(), params=params, timeout=30)
            if response.ok:
                data = response.json()
                if data and len(data) > 0:
                    logger.info(f"Matched existing contact by phone: {phone_clean}")
                    return data[0]
        except Exception as e:
            logger.debug(f"Error searching by phone: {e}")
    
    return None

def find_external_mapping(source: str, entity_type: str, external_id: str, internal_table: str = "contacts") -> Optional[Dict]:
    """
    Find external mapping from external_mappings table.
    
    Args:
        source: Source name (e.g., 'ghl')
        entity_type: Entity type (e.g., 'contact')
        external_id: External ID (GHL contact ID)
        internal_table: Internal table name (default: 'contacts')
    
    Returns:
        Mapping dict with 'internal_id' if found, None otherwise
    """
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
            raise RuntimeError(f"PostgREST GET failed: {response.status_code} - {response.text[:200]}")
        
        data = response.json()
        if data and len(data) > 0:
            return data[0]
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error finding external mapping: {e}")
        return None
    except Exception as e:
        logger.error(f"Error finding external mapping: {e}")
        return None

def upsert_contact(contact_payload: Dict, internal_id: Optional[str] = None, ghl_contact_raw: Optional[Dict] = None) -> Dict:
    """
    Upsert a contact into the contacts table.
    Includes dedupe fallback logic to avoid 409 errors on duplicate phone/email.
    
    Args:
        contact_payload: Contact data dictionary (fields matching contacts table schema)
        internal_id: Optional existing contact UUID (if provided, performs PATCH update)
        ghl_contact_raw: Optional raw GHL contact (for logging context)
    
    Returns:
        Contact dict with 'id' field
    """
    base_url = _get_base_url()
    
    # If no internal_id provided, try dedupe fallback
    if internal_id is None:
        email = contact_payload.get("email")
        phone = contact_payload.get("phone")
        existing_contact = find_contact_by_unique_keys(email, phone)
        if existing_contact:
            internal_id = existing_contact.get("id")
            logger.info(f"Using dedupe fallback: matched existing contact by phone/email, id={internal_id}")
    
    if internal_id:
        # Update existing contact (PATCH)
        url = f"{base_url}/contacts"
        params = {"id": f"eq.{internal_id}"}
        
        logger.debug(f"Updating existing contact: {internal_id}")
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
        
        logger.debug("Inserting new contact")
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

def build_external_mapping_payload(ghl_contact_id: str, internal_contact_id: str, ghl_contact_raw: Dict[str, Any], sync_hash: Optional[str] = None) -> Dict:
    """
    Build payload for external_mappings table.
    
    Args:
        ghl_contact_id: GHL contact ID
        internal_contact_id: Internal contact UUID
        ghl_contact_raw: Full raw GHL contact JSON
        sync_hash: Optional sync hash (not used in current implementation)
    
    Returns:
        Mapping payload dictionary
    """
    payload = {
        "source": "ghl",
        "entity_type": "contact",
        "external_id": ghl_contact_id,
        "internal_table": "contacts",
        "internal_id": internal_contact_id,
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
        "raw": ghl_contact_raw,
    }
    
    if sync_hash:
        payload["sync_hash"] = sync_hash
    
    return payload

def upsert_external_mapping(mapping_payload: Dict) -> Dict:
    """
    Upsert external mapping using PostgREST on_conflict.
    
    Args:
        mapping_payload: Mapping payload from build_external_mapping_payload()
    
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
        
        logger.debug(f"Upserted external_mapping: ghl:contact:{mapping_payload.get('external_id')} -> {mapping_payload.get('internal_id')}")
        return data[0]
    except requests.exceptions.RequestException as e:
        logger.error(f"Error upserting external_mapping: {e}")
        raise RuntimeError(f"Failed to upsert external mapping: {e}")

def upsert_opportunity(opportunity_payload: Dict, internal_id: Optional[str] = None) -> Dict:
    """
    Upsert an opportunity into the opportunities table.
    
    Args:
        opportunity_payload: Opportunity data dictionary (fields matching opportunities table schema)
        internal_id: Optional existing opportunity UUID (if provided, performs PATCH update)
    
    Returns:
        Opportunity dict with 'id' field
    """
    opportunity_payload = enrich_opportunity_payload_person_first(
        dict(opportunity_payload), "sync.upsert_opportunity"
    )
    base_url = _get_base_url()
    
    if internal_id:
        # Update existing opportunity (PATCH)
        url = f"{base_url}/opportunities"
        params = {"id": f"eq.{internal_id}"}
        
        logger.debug(f"Updating existing opportunity: {internal_id}")
        try:
            response = requests.patch(url, headers=_get_headers(), params=params, json=opportunity_payload, timeout=30)
            if not response.ok:
                raise RuntimeError(f"PostgREST PATCH failed: {response.status_code} - {response.text[:200]}")
            
            data = response.json()
            if not data or len(data) == 0:
                raise RuntimeError("PATCH returned no data")
            
            return data[0]
        except requests.exceptions.RequestException as e:
            logger.error(f"Error updating opportunity {internal_id}: {e}")
            raise RuntimeError(f"Failed to update opportunity: {e}")
    else:
        # Insert new opportunity (POST)
        url = f"{base_url}/opportunities"
        
        logger.debug("Inserting new opportunity")
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
        job_payload: Job data dictionary (fields matching jobs table schema)
        internal_id: Optional existing job UUID (if provided, performs PATCH update)
    
    Returns:
        Job dict with 'id' field
    """
    base_url = _get_base_url()
    
    if internal_id:
        # Update existing job (PATCH)
        url = f"{base_url}/jobs"
        params = {"id": f"eq.{internal_id}"}
        
        logger.debug(f"Updating existing job: {internal_id}")
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
        
        logger.debug("Inserting new job")
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

def build_external_mapping_payload_generic(
    ghl_id: str,
    internal_id: str,
    entity_type: str,
    internal_table: str,
    ghl_raw: Dict[str, Any],
    sync_hash: Optional[str] = None
) -> Dict:
    """
    Build payload for external_mappings table (generic version for any entity type).
    
    Args:
        ghl_id: GHL entity ID
        internal_id: Internal entity UUID
        entity_type: Entity type (e.g., 'opportunity', 'job')
        internal_table: Internal table name (e.g., 'opportunities', 'jobs')
        ghl_raw: Full raw GHL entity JSON
        sync_hash: Optional sync hash
    
    Returns:
        Mapping payload dictionary
    """
    payload = {
        "source": "ghl",
        "entity_type": entity_type,
        "external_id": ghl_id,
        "internal_table": internal_table,
        "internal_id": internal_id,
        "last_synced_at": datetime.now(timezone.utc).isoformat(),
        "raw": ghl_raw,
    }
    
    if sync_hash:
        payload["sync_hash"] = sync_hash
    
    return payload

def resolve_contact_id_from_ghl_contact_id(ghl_contact_id: Optional[str]) -> Optional[str]:
    """
    Resolve internal contact UUID from GHL contact ID via external_mappings.
    
    Args:
        ghl_contact_id: GHL contact ID
    
    Returns:
        Internal contact UUID if found, None otherwise
    """
    if not ghl_contact_id:
        return None
    
    mapping = find_external_mapping("ghl", "contact", ghl_contact_id, "contacts")
    if mapping:
        return mapping.get("internal_id")
    return None

def resolve_opportunity_id_from_ghl_opportunity_id(ghl_opportunity_id: Optional[str]) -> Optional[str]:
    """
    Resolve internal opportunity UUID from GHL opportunity ID via external_mappings.
    
    Args:
        ghl_opportunity_id: GHL opportunity ID
    
    Returns:
        Internal opportunity UUID if found, None otherwise
    """
    if not ghl_opportunity_id:
        return None
    
    mapping = find_external_mapping("ghl", "opportunity", ghl_opportunity_id, "opportunities")
    if mapping:
        return mapping.get("internal_id")
    return None
